// retry.go — Phase 3 self-sufficient retry untuk job yang gagal di
// EPP CREATE/RENEW step. Invoice + payment sudah paid; kita cuma re-run
// ExecuteAfterPayment (yang dispatch ke RegisterDomainDirect / RenewDomainDirect
// via api-registry) tanpa charge ulang.

package domain_purchase

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// syncFromEPPIfActive — cek EPP registry. Kalau domain sudah ada (artinya
// EPP sudah berhasil register dari attempt sebelumnya tapi local nyangkut
// di pending_provisioning / failed karena api-registry crash mid-request),
// langsung promote local status ke active + upsert ke registered_domains.
// Return (true, nil) kalau sudah di-sync (caller skip re-execute).
// Return (false, nil) kalau EPP tidak punya domain (lanjut retry normal).
func (h *Handler) syncFromEPPIfActive(ctx context.Context, job *Purchase) (bool, error) {
	if h.registrar == nil || !h.registrar.UsesAPIRegistry() {
		return false, nil
	}
	info, err := h.registrar.InfoDomain(ctx, job.Domain)
	if err != nil || info == nil {
		// Treat semua error sebagai "belum ada di EPP" — biar normal retry
		// handle (ExecuteAfterPayment punya error handling sendiri).
		return false, nil
	}
	// Domain exists di EPP. Promote local ke active + upsert registered_domains.
	d := Domain{
		UserID:         job.UserID,
		PurchasedBy:    job.PurchasedBy,
		Name:           job.Domain,
		ContactID:      info.Registrant,
		Status:         "active",
		RegistrarJobID: job.RegistrarJobID,
	}
	if !info.ExpiresAt.IsZero() {
		exp := info.ExpiresAt
		d.ExpiresAt = &exp
	}
	if !info.CreatedAt.IsZero() {
		d.RegisteredAt = info.CreatedAt
	}
	if _, err := h.repo.UpsertDomain(ctx, d); err != nil {
		slog.Error("retry sync: upsert domain gagal",
			"domain", job.Domain, "error", err)
	}
	var expPtr *time.Time
	if d.ExpiresAt != nil {
		exp := *d.ExpiresAt
		expPtr = &exp
	}
	if _, err := h.repo.UpdateStatus(ctx, job.RegistrarJobID, StatusActive, "", expPtr); err != nil {
		return false, err
	}
	return true, nil
}

// Retry — POST /api/v1/domains/purchases/:job_id/retry
//
// Prereq: invoice status=paid + job status ∈ {failed, pending_provisioning}.
//
//   - failed: EPP execute gagal → retry rerun ExecuteAfterPayment
//   - pending_provisioning: invoice paid tapi EPP execute nyangkut / silent
//     drop (mis. api-registry crash mid-request) → retry re-invoke ExecuteAfterPayment
//
// Kalau invoice belum paid, user harus lunasi via /invoices dulu (webhook
// otomatis trigger execute).
//
// Idempotent: ExecuteAfterPayment cek `p.Status == StatusActive` di awal —
// kalau race dengan sukses paralel, no-op.
func (h *Handler) Retry(c *fiber.Ctx) error {
	if h.invoicesSvc == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "retry_not_ready",
			"Retry butuh invoices service ter-wire.")
	}
	if h.registrar == nil || !h.registrar.UsesAPIRegistry() {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "api_registry_required",
			"Retry butuh API_REGISTRY_URL di-set.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	jobID := strings.TrimSpace(c.Params("job_id"))
	if jobID == "" {
		return httpx.BadRequest(c, "job_id required")
	}
	// Ownership scoped to actor (owner atau purchased_by).
	job, err := h.repo.GetByJobIDForActor(c.Context(), jobID, cl.UserID)
	if err != nil {
		return httpx.NotFound(c, "job tidak ditemukan")
	}
	// Retry allowed untuk semua status non-terminal (kecuali active/expired/
	// cancelled). Termasuk `pending_payment` kalau ternyata invoice paid tapi
	// callback gagal — user stuck di sini kalau EPP fail sebelum sempat
	// transisi ke pending_provisioning/failed. Idempotency di
	// ExecuteAfterPayment (cek StatusActive di awal).
	if job.Status == StatusActive || job.Status == StatusExpired || job.Status == StatusCancelled {
		return httpx.BadRequest(c,
			"job sudah dalam status terminal ("+job.Status+"), tidak perlu retry")
	}

	// job_id = invoice.ID (canonical). Kalau parse gagal, invalid job.
	invoiceID, err := uuid.Parse(jobID)
	if err != nil {
		return httpx.BadRequest(c, "job_id tidak valid")
	}
	inv, err := h.invoicesSvc.GetInvoiceForCallback(c.Context(), invoiceID)
	if err != nil || inv == nil {
		return httpx.NotFound(c, "invoice tidak ditemukan")
	}
	if inv.Status != "paid" {
		return httpx.BadRequest(c,
			"invoice belum lunas — bayar dulu di /settings/invoices sebelum retry")
	}

	// Shortcut: cek EPP dulu — kalau domain sudah terdaftar (local nyangkut
	// karena api-registry crash saat callback), promote ke active tanpa
	// re-execute. Cegah risk duplicate register.
	if job.Kind == KindRegister {
		if synced, err := h.syncFromEPPIfActive(c.Context(), job); err == nil && synced {
			h.logAudit(c.Context(), cl.UserID, audit.EventDomainRetried, "job", jobID, map[string]any{
				"kind":        job.Kind,
				"sync_source": "epp_info",
			})
			fresh, _ := h.repo.GetByJobIDForActor(c.Context(), jobID, cl.UserID)
			if fresh == nil {
				return httpx.OK(c, fiber.Map{"job_id": jobID, "status": StatusActive})
			}
			return httpx.OK(c, toResp(fresh))
		}
	}

	// Clear status ke pending_provisioning supaya visual reset saat retry.
	if _, err := h.repo.UpdateStatus(c.Context(), jobID, StatusPendingProvisioning, "", nil); err != nil {
		return httpx.Internal(c, "status reset gagal: "+err.Error())
	}

	if execErr := h.ExecuteAfterPayment(c.Context(), inv); execErr != nil {
		// Execute sudah update status ke failed dengan reason. Balikin error
		// user-facing tapi status di DB sudah authoritative.
		return httpx.Err(c, fiber.StatusBadGateway, "epp_execute_failed", execErr.Error())
	}

	h.logAudit(c.Context(), cl.UserID, audit.EventDomainRetried, "job", jobID, map[string]any{
		"kind": job.Kind,
	})

	// Return status terbaru.
	fresh, err := h.repo.GetByJobIDForActor(c.Context(), jobID, cl.UserID)
	if err != nil {
		return httpx.OK(c, fiber.Map{"job_id": jobID, "status": StatusPendingProvisioning})
	}
	return httpx.OK(c, toResp(fresh))
}

// AdminRetry — POST /api/v1/admin/registrar/purchases/:job_id/retry
//
// Sama seperti Retry tapi bypass ownership check — admin bisa retry job
// siapa pun. Dipakai untuk unblock user yang stuck (mis. invoice paid tapi
// api-registry down saat callback → purchase pending_payment tanpa retry
// button di frontend user).
//
// Idempotent + safe: ExecuteAfterPayment cek StatusActive di awal.
func (h *Handler) AdminRetry(c *fiber.Ctx) error {
	if h.invoicesSvc == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "retry_not_ready",
			"Retry butuh invoices service ter-wire.")
	}
	if h.registrar == nil || !h.registrar.UsesAPIRegistry() {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "api_registry_required",
			"Retry butuh API_REGISTRY_URL di-set.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	jobID := strings.TrimSpace(c.Params("job_id"))
	if jobID == "" {
		return httpx.BadRequest(c, "job_id required")
	}

	// Admin bypass — GetByJobIDAny (bukan ForActor).
	job, err := h.repo.GetByJobIDAny(c.Context(), jobID)
	if err != nil || job == nil {
		return httpx.NotFound(c, "job tidak ditemukan")
	}
	if job.Status == StatusActive || job.Status == StatusExpired || job.Status == StatusCancelled {
		return httpx.BadRequest(c,
			"job sudah dalam status terminal ("+job.Status+"), tidak perlu retry")
	}

	invoiceID, err := uuid.Parse(jobID)
	if err != nil {
		return httpx.BadRequest(c, "job_id tidak valid")
	}
	inv, err := h.invoicesSvc.GetInvoiceForCallback(c.Context(), invoiceID)
	if err != nil || inv == nil {
		return httpx.NotFound(c, "invoice tidak ditemukan")
	}
	if inv.Status != "paid" {
		return httpx.BadRequest(c,
			"invoice belum lunas — mark-paid dulu via /admin/invoices sebelum retry")
	}

	// Shortcut: cek EPP dulu — kalau domain sudah terdaftar (local nyangkut
	// karena api-registry crash saat callback), promote ke active tanpa
	// re-execute. Cegah risk duplicate register.
	if job.Kind == KindRegister {
		if synced, err := h.syncFromEPPIfActive(c.Context(), job); err == nil && synced {
			h.logAudit(c.Context(), cl.UserID, audit.EventDomainRetried, "job", jobID, map[string]any{
				"kind":        job.Kind,
				"admin":       true,
				"sync_source": "epp_info",
			})
			fresh, _ := h.repo.GetByJobIDAny(c.Context(), jobID)
			if fresh == nil {
				return httpx.OK(c, fiber.Map{"job_id": jobID, "status": StatusActive})
			}
			return httpx.OK(c, toResp(fresh))
		}
	}

	// Clear status ke pending_provisioning supaya visual reset saat retry.
	if _, err := h.repo.UpdateStatus(c.Context(), jobID, StatusPendingProvisioning, "", nil); err != nil {
		return httpx.Internal(c, "status reset gagal: "+err.Error())
	}

	if execErr := h.ExecuteAfterPayment(c.Context(), inv); execErr != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "epp_execute_failed", execErr.Error())
	}

	h.logAudit(c.Context(), cl.UserID, audit.EventDomainRetried, "job", jobID, map[string]any{
		"kind":  job.Kind,
		"admin": true,
	})

	fresh, _ := h.repo.GetByJobIDAny(c.Context(), jobID)
	if fresh == nil {
		return httpx.OK(c, fiber.Map{"job_id": jobID, "status": StatusPendingProvisioning})
	}
	return httpx.OK(c, toResp(fresh))
}

// AdminSyncFromEPP — POST /api/v1/admin/registrar/purchases/:job_id/sync
//
// Kalau purchase sudah 'active' tapi tabel `registered_domains` belum punya
// row (misal upsert fail saat callback asli), tombol Retry ditolak karena
// status terminal. Endpoint ini bypass gate itu — forcibly re-cek EPP
// InfoDomain lalu UpsertDomain + UpdateStatus (idempotent).
//
// Juga berfungsi untuk purchase failed/pending_provisioning yang domainnya
// ternyata sudah terdaftar — tanpa trigger ExecuteAfterPayment (yang
// re-charge logic-nya tidak kita butuhkan di sini).
//
// Return 404 kalau job tidak ada. Return 200 dengan status terbaru kalau
// sync sukses. Return 422 kalau EPP tidak mengenali domain (artinya memang
// belum di-register di registry; admin perlu Retry provisioning normal).
func (h *Handler) AdminSyncFromEPP(c *fiber.Ctx) error {
	if h.registrar == nil || !h.registrar.UsesAPIRegistry() {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "api_registry_required",
			"Sync butuh API_REGISTRY_URL di-set.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	jobID := strings.TrimSpace(c.Params("job_id"))
	if jobID == "" {
		return httpx.BadRequest(c, "job_id required")
	}

	job, err := h.repo.GetByJobIDAny(c.Context(), jobID)
	if err != nil || job == nil {
		return httpx.NotFound(c, "job tidak ditemukan")
	}
	if job.Kind != KindRegister {
		return httpx.BadRequest(c,
			"sync hanya untuk kind=register (renew tidak perlu sync)")
	}

	synced, syncErr := h.syncFromEPPIfActive(c.Context(), job)
	if syncErr != nil {
		return httpx.Internal(c, "sync gagal: "+syncErr.Error())
	}
	if !synced {
		return httpx.Err(c, fiber.StatusUnprocessableEntity, "epp_not_found",
			"Domain tidak ditemukan di EPP registry. Kalau job pending/failed, pakai Retry provisioning untuk re-run EPP CREATE.")
	}

	h.logAudit(c.Context(), cl.UserID, audit.EventDomainRetried, "job", jobID, map[string]any{
		"kind":        job.Kind,
		"admin":       true,
		"sync_source": "manual_epp_sync",
	})

	fresh, _ := h.repo.GetByJobIDAny(c.Context(), jobID)
	if fresh == nil {
		return httpx.OK(c, fiber.Map{"job_id": jobID, "status": StatusActive})
	}
	return httpx.OK(c, toResp(fresh))
}
