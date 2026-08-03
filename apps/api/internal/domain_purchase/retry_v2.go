// retry_v2.go — Phase 3 self-sufficient retry untuk job yang gagal di
// EPP CREATE/RENEW step. Invoice + payment sudah paid; kita cuma re-run
// ExecuteAfterPayment (yang dispatch ke RegisterDomainDirect / RenewDomainDirect
// via api-registry) tanpa charge ulang.

package domain_purchase

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// RetryV2 — POST /api/v1/domains/purchases/:job_id/retry
//
// Prereq: job status=failed AND invoice status=paid. Kalau invoice belum paid,
// user harus lunasi via /invoices dulu (webhook otomatis trigger execute).
func (h *Handler) RetryV2(c *fiber.Ctx) error {
	if h.invoicesSvc == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "retry_v2_not_ready",
			"Retry V2 butuh invoices service ter-wire.")
	}
	if h.registrar == nil || !h.registrar.UsesAPIRegistry() {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "api_registry_required",
			"Retry V2 butuh API_REGISTRY_URL di-set.")
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
	if job.Status != StatusFailed {
		return httpx.BadRequest(c, "retry hanya untuk job status=failed")
	}

	// Untuk V2 flow, job_id = invoice.ID. Kalau parse gagal, ini job legacy —
	// tolak explicit (bukan crash).
	invoiceID, err := uuid.Parse(jobID)
	if err != nil {
		return httpx.BadRequest(c, "job ini bukan V2 flow — hubungi admin")
	}
	inv, err := h.invoicesSvc.GetInvoiceForCallback(c.Context(), invoiceID)
	if err != nil || inv == nil {
		return httpx.NotFound(c, "invoice tidak ditemukan")
	}
	if inv.Status != "paid" {
		return httpx.BadRequest(c,
			"invoice belum lunas — bayar dulu di /settings/invoices sebelum retry")
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
