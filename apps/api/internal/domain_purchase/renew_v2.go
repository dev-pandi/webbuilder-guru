// renew_v2.go — Phase A checkout untuk renew (2-phase self-sufficient).
// Pattern reuse penuh dari purchase_v2.go — beda hanya:
//   - Ownership check (domain harus milik caller via GetLatestActiveByDomain)
//   - Path param `:name` untuk domain (bukan body)
//   - Kind=renew, pakai retail_renew_price (bukan retail_register_price)
//
// Phase B (EPP execute) sudah in-place di execute.go — ExecuteAfterPayment
// switch on kind, panggil RenewDomainDirect kalau kind=renew.

package domain_purchase

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/metrics"
)

const metricRenewsCreatedV2 = "domain_renew_v2_created_total"

// renewV2Req — body untuk RenewV2. `domain` diambil dari path param, bukan body.
type renewV2Req struct {
	Years         int    `json:"years"`
	PaymentMethod string `json:"payment_method"`
	ReturnURL     string `json:"return_url,omitempty"`
}

// RenewV2 — Phase A checkout untuk renew.
//
// POST /api/v1/domains/:name/renew/v2
// Body: renewV2Req
// Header: Idempotency-Key wajib.
func (h *Handler) RenewV2(c *fiber.Ctx) error {
	if h.pricingRepo == nil || h.invoicesSvc == nil || h.gwRegistry == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "renew_v2_not_ready",
			"Fitur renew 2-phase belum aktif — dependencies pricing/invoices/gateway belum wired.")
	}
	if h.registrar == nil || !h.registrar.UsesAPIRegistry() {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "api_registry_required",
			"Fitur renew 2-phase butuh API_REGISTRY_URL di-set.")
	}

	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}

	// Domain dari path — decode URL-escaped supaya "myshop.co.id" match.
	domain, err := url.PathUnescape(c.Params("name"))
	if err != nil {
		return httpx.BadRequest(c, "domain tidak valid")
	}
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" || !strings.Contains(domain, ".") {
		return httpx.BadRequest(c, "domain full FQDN wajib")
	}

	var req renewV2Req
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Years < 1 || req.Years > 10 {
		return httpx.BadRequest(c, "years harus 1-10")
	}
	req.PaymentMethod = strings.TrimSpace(req.PaymentMethod)
	if req.PaymentMethod == "" {
		return httpx.BadRequest(c, "payment_method wajib")
	}

	idem := strings.TrimSpace(c.Get("Idempotency-Key"))
	if idem == "" {
		return httpx.Err(c, fiber.StatusBadRequest, "idempotency_key_required",
			"Header Idempotency-Key wajib untuk cegah double-charge.")
	}

	// Ownership check — cegah renew domain orang lain.
	if _, err := h.repo.GetLatestActiveByDomain(c.Context(), domain, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "domain tidak ditemukan atau bukan milik Anda")
		}
		return httpx.Internal(c, "domain lookup failed")
	}

	// Owner profile — untuk gateway customer info + invoice attribution.
	owner, err := h.users.GetByID(c.Context(), cl.UserID)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}

	// Zone + years-range check.
	tld := extractTLD(domain)
	if tld == "" {
		return httpx.BadRequest(c, "domain tidak punya TLD valid")
	}
	if h.zonesRepo != nil {
		z, err := h.zonesRepo.GetByTLD(c.Context(), tld)
		if err == nil && z != nil {
			if !z.Active {
				return httpx.Err(c, fiber.StatusBadRequest, "zone_disabled",
					fmt.Sprintf("TLD .%s sementara ditutup untuk renew — hubungi admin", tld))
			}
			if req.Years < z.MinYears || req.Years > z.MaxYears {
				return httpx.Err(c, fiber.StatusBadRequest, "years_out_of_range",
					fmt.Sprintf("TLD .%s butuh renew %d-%d tahun", tld, z.MinYears, z.MaxYears))
			}
		}
	}

	// Fetch retail_renew_price (beda dengan register).
	_, retailRenew, err := h.pricingRepo.GetPlatformPrice(c.Context(), tld)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "price_not_set",
			fmt.Sprintf("Harga renew TLD .%s belum di-set admin.", tld))
	}

	// Invoice.
	invoiceID, total, dueAt, err := h.invoicesSvc.CreateForRegister(c.Context(), InvoiceCreateInput{
		UserID:        owner.ID,
		Domain:        domain,
		Years:         req.Years,
		UnitPrice:     retailRenew,
		PaymentMethod: req.PaymentMethod,
		Kind:          KindRenew,
	})
	if err != nil {
		slog.Error("renew_v2: create invoice failed",
			"user_id", owner.ID, "domain", domain, "error", err)
		return httpx.Internal(c, "gagal membuat invoice")
	}
	jobID := invoiceID.String()

	// Gateway charge.
	gw, err := h.gwRegistry.Get(c.Context(), req.PaymentMethod)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "gateway_unavailable",
			fmt.Sprintf("Payment method %q tidak tersedia: %v", req.PaymentMethod, err))
	}
	paymentURL, providerRef, err := gw.CreateCharge(c.Context(), GatewayChargeRequest{
		OrderID:       invoiceID.String(),
		Amount:        total,
		Description:   fmt.Sprintf("Perpanjangan %s (%d tahun)", domain, req.Years),
		CustomerName:  owner.Name,
		CustomerEmail: owner.Email,
		CustomerPhone: owner.PhoneNumber,
		ReturnURL:     req.ReturnURL,
		ExpiresAt:     dueAt,
	})
	if err != nil {
		metrics.Default.CounterInc(metricRenewsCreatedV2,
			"RenewV2 checkout by outcome",
			map[string]string{"result": "charge_failed", "gateway": req.PaymentMethod},
		)
		return httpx.Err(c, fiber.StatusBadGateway, "charge_failed", err.Error())
	}

	if err := h.invoicesSvc.SavePaymentRef(c.Context(), invoiceID, providerRef); err != nil {
		slog.Warn("renew_v2: save payment ref failed",
			"invoice_id", invoiceID, "error", err)
	}

	// Save local Purchase — kind=renew, status=pending_payment.
	local := &Purchase{
		UserID:         owner.ID,
		RegistrarJobID: jobID,
		Domain:         domain,
		Years:          req.Years,
		Kind:           KindRenew,
		Status:         StatusPendingPayment,
		PaymentMethod:  req.PaymentMethod,
		PaymentURL:     paymentURL,
	}
	if err := h.repo.Create(c.Context(), local); err != nil {
		slog.Error("renew_v2: local save failed", "job_id", jobID, "error", err)
	}

	metrics.Default.CounterInc(metricRenewsCreatedV2,
		"RenewV2 checkout by outcome",
		map[string]string{"result": "success", "gateway": req.PaymentMethod},
	)
	slog.Info("renew_v2: checkout accepted",
		"job_id", jobID, "invoice_id", invoiceID,
		"domain", domain, "years", req.Years, "total", total)

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": purchaseV2Resp{
		JobID:      jobID,
		InvoiceID:  invoiceID.String(),
		Domain:     domain,
		Status:     StatusPendingPayment,
		PaymentURL: paymentURL,
		Total:      total,
		Currency:   "IDR",
		DueAt:      dueAt.Format(time.RFC3339),
	}})
}
