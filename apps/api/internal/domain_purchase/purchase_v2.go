// purchase_v2.go — Phase A checkout untuk flow 2-phase self-sufficient.
//
// Beda dengan legacy Purchase (yang forward payment ke registrar-api PANDI):
//   - Price lookup dari platform_prices lokal (bukan trust registrar response)
//   - Zone active check dari zones lokal (operator control)
//   - Invoice dibuat lokal via invoices.Service (dengan PPN via settings)
//   - Payment charge via paymentgw lokal (Midtrans/manual_bank/dsb.)
//   - Return payment_url + invoice_id + job_id ke frontend
//
// Phase B (EPP execute) di-trigger otomatis oleh paymentwh webhook via
// ExecuteAfterPayment callback (sudah in-place).
//
// Scope minimum viable turn ini:
//   - Register only (renew nanti — pattern sama)
//   - Payment method: gateway (midtrans/paylabs) + manual (manual_bank)
//   - Wallet: TIDAK (butuh internal wallet package — belum ada di web builder)
//   - On-behalf-of: TIDAK (defer, tidak critical path)
//   - Promo: TIDAK (defer — invoices.CreateForRegister sudah support kalau perlu)

package domain_purchase

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/metrics"
)

const metricPurchasesCreatedV2 = "domain_purchase_v2_created_total"

// purchaseV2Req — payload frontend baru untuk 2-phase flow.
type purchaseV2Req struct {
	Domain        string `json:"domain"`
	Years         int    `json:"years"`
	PaymentMethod string `json:"payment_method"` // "midtrans" | "paylabs" | "manual_bank"
	ReturnURL     string `json:"return_url,omitempty"`
}

// purchaseV2Resp — response.
type purchaseV2Resp struct {
	JobID       string `json:"job_id"`      // = invoice_id string (single source of truth)
	InvoiceID   string `json:"invoice_id"`
	Domain      string `json:"domain"`
	Status      string `json:"status"`      // "pending_payment"
	PaymentURL  string `json:"payment_url,omitempty"`   // gateway redirect (kosong untuk manual_bank)
	Instructions string `json:"instructions,omitempty"` // manual_bank markdown
	Total       int64  `json:"total"`       // IDR minor unit — total setelah PPN
	Currency    string `json:"currency"`
	DueAt       string `json:"due_at"`      // RFC3339
}

// PurchaseV2 — Phase A checkout. Endpoint terpisah dari Purchase lama supaya
// frontend bisa migrate incremental + backward compat 100%.
//
// POST /api/v1/purchases/v2
// Body: purchaseV2Req
// Header: Idempotency-Key (wajib untuk cegah double-charge).
func (h *Handler) PurchaseV2(c *fiber.Ctx) error {
	// Dependency check — kalau ada yang belum wired, kasih hint clear.
	if h.pricingRepo == nil || h.invoicesSvc == nil || h.gwRegistry == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "purchase_v2_not_ready",
			"Fitur checkout 2-phase belum aktif — dependencies pricing/invoices/gateway belum wired.")
	}
	if h.registrar == nil || !h.registrar.UsesAPIRegistry() {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "api_registry_required",
			"Fitur checkout 2-phase butuh API_REGISTRY_URL di-set (EPP execute via api-registry).")
	}

	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	var req purchaseV2Req
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Domain = strings.ToLower(strings.TrimSpace(req.Domain))
	if req.Domain == "" || !strings.Contains(req.Domain, ".") {
		return httpx.BadRequest(c, "domain full FQDN wajib (mis. myshop.id)")
	}
	if req.Years < 1 || req.Years > 10 {
		return httpx.BadRequest(c, "years harus 1-10")
	}
	req.PaymentMethod = strings.TrimSpace(req.PaymentMethod)
	if req.PaymentMethod == "" {
		return httpx.BadRequest(c, "payment_method wajib")
	}

	// Idempotency key wajib — sama pola dengan Purchase legacy.
	idem := strings.TrimSpace(c.Get("Idempotency-Key"))
	if idem == "" {
		return httpx.Err(c, fiber.StatusBadRequest, "idempotency_key_required",
			"Header Idempotency-Key wajib untuk cegah double-charge.")
	}

	// Fetch caller profile — untuk contact + gateway customer info.
	owner, err := h.users.GetByID(c.Context(), cl.UserID)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}
	if missing := missingProfileFields(owner); len(missing) > 0 {
		return httpx.Err(c, fiber.StatusBadRequest, "profile_incomplete",
			"Lengkapi profil Anda dulu di /settings/profile — field kosong: "+strings.Join(missing, ", "))
	}

	// Extract TLD supaya bisa lookup zone + price.
	tld := extractTLD(req.Domain)
	if tld == "" {
		return httpx.BadRequest(c, "domain tidak punya TLD valid")
	}

	// Zone active check — kalau zones repo di-set, enforce.
	if h.zonesRepo != nil {
		z, err := h.zonesRepo.GetByTLD(c.Context(), tld)
		if err != nil {
			return httpx.Err(c, fiber.StatusBadRequest, "zone_not_supported",
				fmt.Sprintf("TLD .%s tidak didukung platform", tld))
		}
		if !z.Active {
			return httpx.Err(c, fiber.StatusBadRequest, "zone_disabled",
				fmt.Sprintf("TLD .%s sementara ditutup — hubungi admin", tld))
		}
		if req.Years < z.MinYears || req.Years > z.MaxYears {
			return httpx.Err(c, fiber.StatusBadRequest, "years_out_of_range",
				fmt.Sprintf("TLD .%s butuh registrasi %d-%d tahun", tld, z.MinYears, z.MaxYears))
		}
	}

	// Fetch retail price dari platform_prices lokal.
	retailReg, _, err := h.pricingRepo.GetPlatformPrice(c.Context(), tld)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "price_not_set",
			fmt.Sprintf("Harga TLD .%s belum di-set admin. Hubungi support.", tld))
	}

	// Create invoice — service apply PPN via settings.
	invoiceID, total, dueAt, err := h.invoicesSvc.CreateForRegister(c.Context(), InvoiceCreateInput{
		UserID:        owner.ID,
		Domain:        req.Domain,
		Years:         req.Years,
		UnitPrice:     retailReg,
		PaymentMethod: req.PaymentMethod,
		Kind:          KindRegister,
		JobID:         "", // will use invoice.ID as job_id — no separate id
	})
	if err != nil {
		slog.Error("purchase_v2: create invoice failed",
			"user_id", owner.ID, "domain", req.Domain, "error", err)
		return httpx.Internal(c, "gagal membuat invoice")
	}
	// Save job_id metadata now that we have invoice.ID. Alternative:
	// update metadata after create. Simplify by using invoice.ID as job_id
	// downstream — no separate UUID needed.
	jobID := invoiceID.String()

	// Resolve gateway.
	gw, err := h.gwRegistry.Get(c.Context(), req.PaymentMethod)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "gateway_unavailable",
			fmt.Sprintf("Payment method %q tidak tersedia: %v", req.PaymentMethod, err))
	}

	// Charge — order_id = invoice.id string. Provider POST webhook nanti
	// dengan order_id ini, paymentwh lookup invoice by GetByGatewayRef
	// (setelah SavePaymentRef).
	paymentURL, providerRef, err := gw.CreateCharge(c.Context(), GatewayChargeRequest{
		OrderID:       invoiceID.String(),
		Amount:        total,
		Description:   fmt.Sprintf("Register %s (%d tahun)", req.Domain, req.Years),
		CustomerName:  owner.Name,
		CustomerEmail: owner.Email,
		CustomerPhone: owner.PhoneNumber,
		ReturnURL:     req.ReturnURL,
		ExpiresAt:     dueAt,
	})
	if err != nil {
		slog.Error("purchase_v2: charge failed",
			"gateway", req.PaymentMethod, "invoice_id", invoiceID, "error", err)
		metrics.Default.CounterInc(metricPurchasesCreatedV2,
			"PurchaseV2 checkout by outcome",
			map[string]string{"result": "charge_failed", "gateway": req.PaymentMethod},
		)
		return httpx.Err(c, fiber.StatusBadGateway, "charge_failed", err.Error())
	}

	// Persist provider ref supaya webhook nanti bisa lookup + promote invoice
	// draft → unpaid.
	if err := h.invoicesSvc.SavePaymentRef(c.Context(), invoiceID, providerRef); err != nil {
		// Non-fatal — invoice tetap ada (status draft). Log + lanjut.
		slog.Warn("purchase_v2: save payment ref failed",
			"invoice_id", invoiceID, "provider_ref", providerRef, "error", err)
	}

	// Save local Purchase — status pending_payment. job_id = invoice_id
	// string supaya webhook.ExecuteAfterPayment bisa lookup via
	// invoice.metadata.job_id (yang kita simpan di CreateForRegister flow
	// nanti). Untuk sekarang, kita tidak isi metadata.job_id — invoice.ID
	// sendiri sudah cukup jadi identity.
	local := &Purchase{
		UserID:         owner.ID,
		RegistrarJobID: jobID,
		Domain:         req.Domain,
		Years:          req.Years,
		Status:         StatusPendingPayment,
		PaymentMethod:  req.PaymentMethod,
		PaymentURL:     paymentURL,
	}
	if err := h.repo.Create(c.Context(), local); err != nil {
		slog.Error("purchase_v2: local save failed", "job_id", jobID, "error", err)
		// Non-fatal — invoice + charge sudah jalan. User bisa cek /invoices/:id.
	}

	metrics.Default.CounterInc(metricPurchasesCreatedV2,
		"PurchaseV2 checkout by outcome",
		map[string]string{"result": "success", "gateway": req.PaymentMethod},
	)
	slog.Info("purchase_v2: checkout accepted",
		"job_id", jobID, "invoice_id", invoiceID,
		"domain", req.Domain, "total", total,
		"gateway", req.PaymentMethod, "provider_ref", providerRef)

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": purchaseV2Resp{
		JobID:      jobID,
		InvoiceID:  invoiceID.String(),
		Domain:     req.Domain,
		Status:     StatusPendingPayment,
		PaymentURL: paymentURL,
		Total:      total,
		Currency:   "IDR",
		DueAt:      dueAt.Format(time.RFC3339),
	}})
}

// extractTLD — "myshop.co.id" → "co.id". Return "" kalau tidak punya dot.
func extractTLD(domain string) string {
	i := strings.Index(domain, ".")
	if i < 0 {
		return ""
	}
	return domain[i+1:]
}
