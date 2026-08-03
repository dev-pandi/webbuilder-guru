// execute.go — 2-phase self-sufficient flow: Phase B (execute EPP after invoice paid).
//
// Callback yang di-hook ke paymentwh.SetPaidCallback. Alur:
//
//   Frontend → POST /purchases/v2 → invoices.CreateForRegister + paymentgw.CreateCharge
//   → return payment_url ke user
//   User bayar → Provider webhook → paymentwh.Receive → invoices.MarkPaid
//   → ExecuteAfterPayment(inv) → registrar.RegisterDomainDirect (via api-registry)
//   → update Purchase status
//
// Idempotent: kalau webhook di-retry, ExecuteAfterPayment cek Purchase.Status;
// kalau sudah 'active', no-op. Registrar API-registry sudah idempotent via
// domain object identity (EPP 2302 kalau exist → treat sukses).

package domain_purchase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/invoices"
	"github.com/webbuilder/api/internal/metrics"
	"github.com/webbuilder/api/internal/registrar"
)

const metricExecuteAfterPayment = "domain_purchase_execute_after_payment_total"

// ExecuteAfterPayment — dipanggil paymentwh.Handler setelah invoice sukses
// paid. Baca invoice.metadata untuk cari job_id + domain + years + kind,
// lalu trigger EPP execute via registrar client (api-registry direct).
//
// Return error kalau EPP execute gagal — caller (paymentwh) log tapi
// tidak retry-loop; invoice sudah paid, EPP nanti bisa di-retry via
// admin panel atau reconciliation job.
func (h *Handler) ExecuteAfterPayment(ctx context.Context, inv *invoices.Invoice) error {
	if inv == nil {
		return errors.New("invoice nil")
	}
	if h.registrar == nil {
		return errors.New("registrar client tidak configured")
	}

	// Parse metadata.
	meta := parseInvoiceMetadata(inv.Metadata)
	kind := stringFromMeta(meta, "kind")
	domain := stringFromMeta(meta, "domain")
	years := intFromMeta(meta, "years")
	jobID := stringFromMeta(meta, "job_id")

	if domain == "" || years < 1 {
		return fmt.Errorf("invoice metadata invalid: domain=%q years=%d", domain, years)
	}
	if kind == "" {
		kind = KindRegister // default
	}

	// Idempotency: kalau job_id ada + purchase local sudah active, skip.
	// Terjadi kalau webhook double-fire (provider retry policy).
	if jobID != "" {
		if p, err := h.repo.GetByJobIDAny(ctx, jobID); err == nil && p != nil && p.Status == StatusActive {
			slog.Info("execute_after_payment: skip (sudah active)",
				"job_id", jobID, "domain", domain)
			metrics.Default.CounterInc(metricExecuteAfterPayment,
				"EPP execute triggers after invoice paid",
				map[string]string{"result": "idempotent_skip", "kind": kind},
			)
			return nil
		}
	}

	// Fetch owner profile — butuh untuk Contact object di EPP register.
	owner, err := h.resolveOwner(ctx, inv.UserID)
	if err != nil {
		return fmt.Errorf("owner lookup (user_id=%s): %w", inv.UserID, err)
	}

	// Idempotency-Key = invoice.ID.String() — deterministic per invoice,
	// dijamin unik per checkout attempt. Kalau webhook retry, key sama →
	// api-registry idempotent by domain identity anyway.
	idemKey := inv.ID.String()

	switch kind {
	case KindRenew:
		return h.executeRenew(ctx, inv, domain, years, idemKey, owner)
	case KindRegister:
		return h.executeRegister(ctx, inv, domain, years, idemKey, owner)
	default:
		return fmt.Errorf("unknown kind %q di invoice metadata", kind)
	}
}

func (h *Handler) executeRegister(
	ctx context.Context, inv *invoices.Invoice, domain string, years int, idemKey string,
	owner *ownerProfile,
) error {
	req := registrar.RegisterRequest{
		Domain:         domain,
		Years:          years,
		ExternalUserID: inv.UserID.String(),
		IdempotencyKey: idemKey,
		Contact: registrar.Contact{
			Name:        owner.Name,
			Email:       owner.Email,
			Phone:       owner.PhoneNumber,
			Address:     owner.Address,
			City:        owner.City,
			State:       owner.State,
			PostalCode:  owner.PostalCode,
			CountryCode: "ID",
		},
	}
	// Nameservers tidak di-set di sini — pakai default registry (biasanya
	// PANDI hosting NS default). Kalau ada auto-attach Cloudflare, akan
	// di-update via UpdateNameservers di step berikutnya.

	resp, err := h.registrar.RegisterDomainDirect(ctx, req)
	if err != nil {
		metrics.Default.CounterInc(metricExecuteAfterPayment,
			"EPP execute triggers after invoice paid",
			map[string]string{"result": "epp_error", "kind": KindRegister},
		)
		slog.Error("execute_after_payment: RegisterDomainDirect gagal",
			"invoice_id", inv.ID, "domain", domain, "error", err)
		// Mark local purchase failed kalau ada.
		if pMeta := parseInvoiceMetadata(inv.Metadata); stringFromMeta(pMeta, "job_id") != "" {
			jobID := stringFromMeta(pMeta, "job_id")
			_, _ = h.repo.UpdateStatus(ctx, jobID, StatusFailed, err.Error(), nil)
		}
		return fmt.Errorf("EPP register: %w", err)
	}

	// Sukses — persist local purchase kalau belum ada, atau update status
	// existing.
	local := &Purchase{
		UserID:         inv.UserID,
		PurchasedBy:    inv.PurchasedBy,
		RegistrarJobID: resp.JobID,
		Domain:         domain,
		Years:          years,
		Status:         StatusActive,
		PaymentMethod:  inv.PaymentMethod,
	}
	if err := h.repo.Create(ctx, local); err != nil && !errors.Is(err, ErrJobTaken) {
		slog.Error("execute_after_payment: local save gagal",
			"job_id", resp.JobID, "error", err)
	} else if errors.Is(err, ErrJobTaken) {
		// Existing purchase — update status.
		_, _ = h.repo.UpdateStatus(ctx, resp.JobID, StatusActive, "", nil)
	}

	// Trigger Cloudflare auto-attach best-effort — same pattern dengan
	// legacy webhook flow.
	if h.cloudflare != nil {
		h.tryAttachToCloudflare(ctx, domain)
	}

	metrics.Default.CounterInc(metricExecuteAfterPayment,
		"EPP execute triggers after invoice paid",
		map[string]string{"result": "success", "kind": KindRegister},
	)
	slog.Info("execute_after_payment: register success",
		"invoice_id", inv.ID, "job_id", resp.JobID, "domain", domain)
	return nil
}

func (h *Handler) executeRenew(
	ctx context.Context, inv *invoices.Invoice, domain string, years int, idemKey string,
	owner *ownerProfile,
) error {
	req := registrar.RenewRequest{
		Years:          years,
		IdempotencyKey: idemKey,
		ExternalUserID: inv.UserID.String(),
	}
	resp, err := h.registrar.RenewDomainDirect(ctx, domain, req)
	if err != nil {
		metrics.Default.CounterInc(metricExecuteAfterPayment,
			"EPP execute triggers after invoice paid",
			map[string]string{"result": "epp_error", "kind": KindRenew},
		)
		slog.Error("execute_after_payment: RenewDomainDirect gagal",
			"invoice_id", inv.ID, "domain", domain, "error", err)
		return fmt.Errorf("EPP renew: %w", err)
	}
	local := &Purchase{
		UserID:         inv.UserID,
		PurchasedBy:    inv.PurchasedBy,
		RegistrarJobID: resp.JobID,
		Domain:         domain,
		Years:          years,
		Kind:           KindRenew,
		Status:         StatusActive,
		PaymentMethod:  inv.PaymentMethod,
	}
	if err := h.repo.Create(ctx, local); err != nil && !errors.Is(err, ErrJobTaken) {
		slog.Error("execute_after_payment: local save (renew) gagal",
			"job_id", resp.JobID, "error", err)
	} else if errors.Is(err, ErrJobTaken) {
		_, _ = h.repo.UpdateStatus(ctx, resp.JobID, StatusActive, "", nil)
	}
	metrics.Default.CounterInc(metricExecuteAfterPayment,
		"EPP execute triggers after invoice paid",
		map[string]string{"result": "success", "kind": KindRenew},
	)
	slog.Info("execute_after_payment: renew success",
		"invoice_id", inv.ID, "job_id", resp.JobID, "domain", domain)
	return nil
}

// --- metadata helpers ---

// ownerProfile — subset auth.User yang dipakai untuk Contact object EPP.
// Kita abstract minimal supaya test bisa fake tanpa full auth.User.
type ownerProfile struct {
	ID          uuid.UUID
	Name        string
	Email       string
	PhoneNumber string
	Address     string
	City        string
	State       string
	PostalCode  string
}

// resolveOwner — helper untuk fetch profile dari auth.Repo dan convert
// ke ownerProfile struct minimal.
//
// Kita cast via h.users.GetByID langsung — auth.User punya field yang kita
// butuh. Wrapper cuma untuk decoupling test.
func (h *Handler) resolveOwner(ctx context.Context, id uuid.UUID) (*ownerProfile, error) {
	u, err := h.users.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &ownerProfile{
		ID:          u.ID,
		Name:        u.Name,
		Email:       u.Email,
		PhoneNumber: u.PhoneNumber,
		Address:     u.Address,
		City:        u.City,
		State:       u.State,
		PostalCode:  u.PostalCode,
	}, nil
}

// parseInvoiceMetadata — safe JSON decode. Return empty map kalau invalid.
func parseInvoiceMetadata(raw []byte) map[string]any {
	if len(raw) == 0 {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return map[string]any{}
	}
	return out
}

func stringFromMeta(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

func intFromMeta(m map[string]any, key string) int {
	v, ok := m[key]
	if !ok {
		return 0
	}
	// JSON number → float64 di Go standard decode. Cast + round.
	switch t := v.(type) {
	case float64:
		return int(t)
	case int:
		return t
	case int64:
		return int(t)
	}
	return 0
}
