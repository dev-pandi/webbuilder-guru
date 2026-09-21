// renew.go — Phase A checkout untuk renew (2-phase self-sufficient).
// Pattern reuse penuh dari purchase.go — beda hanya:
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
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/metrics"
)

const metricRenewsCreated = "domain_renew_created_total"

// renewReq — body untuk Renew. `domain` diambil dari path param, bukan body.
type renewReq struct {
	Years         int    `json:"years"`
	PaymentMethod string `json:"payment_method"`
	ReturnURL     string `json:"return_url,omitempty"`
	PromoCode     string `json:"promo_code,omitempty"`
}

// Renew — Phase A checkout untuk renew.
//
// POST /api/v1/domains/:name/renew
// Body: renewReq
// Header: Idempotency-Key wajib.
func (h *Handler) Renew(c *fiber.Ctx) error {
	if h.pricingRepo == nil || h.invoicesSvc == nil || h.gwRegistry == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "renew_not_ready",
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

	var req renewReq
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
	// Renew belum support on-behalf-of, jadi owner == caller.
	owner, err := h.users.GetByID(c.Context(), cl.UserID)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}

	// Wallet payment restriction — sama dengan Purchase.
	if req.PaymentMethod == "deposit_wallet" && !auth.IsResellerLike(owner.Role) {
		return httpx.Forbidden(c, "payment_method 'deposit_wallet' hanya untuk reseller/agent")
	}
	if req.PaymentMethod == "deposit_wallet" && owner.Role == auth.RoleAgent {
		if owner.ParentResellerID == nil {
			return httpx.Err(c, fiber.StatusBadRequest, "agent_orphan",
				"Akun agent tidak terhubung ke reseller. Hubungi admin.")
		}
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

	// Promo — validate + hitung discount sebelum invoice creation.
	var (
		promoID       uuid.UUID
		promoDiscount int64
	)
	if promoCode := strings.TrimSpace(req.PromoCode); promoCode != "" {
		if h.promos == nil {
			return httpx.Err(c, fiber.StatusServiceUnavailable, "promo_disabled",
				"Fitur promo belum aktif di server.")
		}
		subtotal := int64(req.Years) * retailRenew
		pid, disc, err := h.promos.Validate(c.Context(), promoCode, owner.ID, tld, KindRenew, subtotal)
		if err != nil {
			return httpx.Err(c, fiber.StatusBadRequest, "promo_invalid", err.Error())
		}
		promoID = pid
		promoDiscount = disc
	}

	// Invoice.
	invoiceID, total, dueAt, err := h.invoicesSvc.CreateForRegister(c.Context(), InvoiceCreateInput{
		UserID:        owner.ID,
		Domain:        domain,
		Years:         req.Years,
		UnitPrice:     retailRenew,
		PaymentMethod: req.PaymentMethod,
		Kind:          KindRenew,
		PromoCode:     req.PromoCode,
		PromoDiscount: promoDiscount,
	})
	if err != nil {
		slog.Error("renew: create invoice failed",
			"user_id", owner.ID, "domain", domain, "error", err)
		return httpx.Internal(c, "gagal membuat invoice")
	}
	jobID := invoiceID.String()

	// Redeem promo — audit trail. Non-fatal kalau gagal.
	if promoDiscount > 0 && h.promos != nil {
		if err := h.promos.Redeem(c.Context(), promoID, owner.ID, invoiceID, promoDiscount); err != nil {
			slog.Warn("renew: promo redeem failed",
				"invoice_id", invoiceID, "promo_id", promoID, "error", err)
		} else {
			h.logAudit(c.Context(), owner.ID, audit.EventPromoApplied, "invoice", invoiceID.String(), map[string]any{
				"promo_code": req.PromoCode,
				"promo_id":   promoID.String(),
				"discount":   promoDiscount,
				"kind":       KindRenew,
				"domain":     domain,
			})
		}
	}

	// Zero-total short-circuit — promo 100% bikin total=0, semua gateway
	// reject Amount<=0. Skip gateway, langsung sync flow (MarkPaid + EPP
	// execute). Provider ref pakai sentinel `free_promo_<invoice_id>`.
	isFreeInvoice := total == 0

	var paymentURL string
	var providerRef string
	var isWalletGateway bool

	if isFreeInvoice {
		providerRef = "free_promo_" + invoiceID.String()
	} else {
		// Gateway charge.
		gw, gwErr := h.gwRegistry.Get(c.Context(), req.PaymentMethod)
		if gwErr != nil {
			return httpx.Err(c, fiber.StatusBadRequest, "gateway_unavailable",
				fmt.Sprintf("Payment method %q tidak tersedia: %v", req.PaymentMethod, gwErr))
		}
		isWalletGateway = gw.Type() == "wallet"

		// Wallet payer resolution — agent debit dari wallet parent reseller,
		// metadata catat agent_id supaya reseller bisa report per-agent.
		walletPayerID := ""
		var walletMeta []byte
		if req.PaymentMethod == "deposit_wallet" {
			if owner.Role == auth.RoleAgent && owner.ParentResellerID != nil {
				walletPayerID = owner.ParentResellerID.String()
				walletMeta = buildWalletMetadata(owner.ID, nil)
			} else {
				walletPayerID = owner.ID.String()
			}
		}
		var chargeErr error
		paymentURL, providerRef, chargeErr = gw.CreateCharge(c.Context(), GatewayChargeRequest{
			OrderID:        invoiceID.String(),
			UserID:         owner.ID.String(),
			Amount:         total,
			Description:    fmt.Sprintf("Perpanjangan %s (%d tahun)", domain, req.Years),
			CustomerName:   owner.Name,
			CustomerEmail:  owner.Email,
			CustomerPhone:  owner.PhoneNumber,
			ReturnURL:      req.ReturnURL,
			ExpiresAt:      dueAt,
			WalletPayerID:  walletPayerID,
			WalletMetadata: walletMeta,
		})
		if chargeErr != nil {
			metrics.Default.CounterInc(metricRenewsCreated,
				"Renew checkout by outcome",
				map[string]string{"result": "charge_failed", "gateway": req.PaymentMethod},
			)
			return httpx.Err(c, fiber.StatusBadGateway, "charge_failed", chargeErr.Error())
		}

		if err := h.invoicesSvc.SavePaymentRef(c.Context(), invoiceID, providerRef); err != nil {
			slog.Warn("renew: save payment ref failed",
				"invoice_id", invoiceID, "error", err)
		}
	}

	// Sync flow: wallet gateway (langsung debit) atau free invoice (promo=100%).
	// Selaras dengan Purchase — response bisa langsung return status=active
	// tanpa client polling.
	syncFlow := isFreeInvoice || isWalletGateway
	initialStatus := StatusPendingPayment
	if syncFlow {
		initialStatus = StatusPendingProvisioning
	}

	// Save local Purchase — kind=renew.
	local := &Purchase{
		UserID:         owner.ID,
		RegistrarJobID: jobID,
		Domain:         domain,
		Years:          req.Years,
		Kind:           KindRenew,
		Status:         initialStatus,
		PaymentMethod:  req.PaymentMethod,
		PaymentURL:     paymentURL,
	}
	if err := h.repo.Create(c.Context(), local); err != nil {
		slog.Error("renew: local save failed", "job_id", jobID, "error", err)
	}

	metrics.Default.CounterInc(metricRenewsCreated,
		"Renew checkout by outcome",
		map[string]string{"result": "success", "gateway": req.PaymentMethod},
	)
	slog.Info("renew: checkout accepted",
		"job_id", jobID, "invoice_id", invoiceID,
		"domain", domain, "years", req.Years, "total", total,
		"is_wallet", isWalletGateway)

	// Sync flow — wallet gateway atau free invoice (promo 100%). MarkPaid +
	// ExecuteAfterPayment inline supaya response bisa langsung return
	// status=active tanpa client polling.
	finalStatus := initialStatus
	respPaymentURL := paymentURL
	if syncFlow {
		flowLabel := "wallet"
		if isFreeInvoice {
			flowLabel = "free"
		}
		if err := h.invoicesSvc.MarkPaid(c.Context(), invoiceID, time.Now(), providerRef); err != nil {
			slog.Error("renew ("+flowLabel+"): MarkPaid failed",
				"invoice_id", invoiceID, "error", err)
		}
		inv, err := h.invoicesSvc.GetInvoiceForCallback(c.Context(), invoiceID)
		if err != nil {
			slog.Error("renew ("+flowLabel+"): fetch invoice for execute failed",
				"invoice_id", invoiceID, "error", err)
		} else if inv != nil {
			if execErr := h.ExecuteAfterPayment(c.Context(), inv); execErr != nil {
				slog.Error("renew ("+flowLabel+"): ExecuteAfterPayment failed",
					"invoice_id", invoiceID, "error", execErr)
				finalStatus = StatusFailed
			} else {
				finalStatus = StatusActive
			}
		}
		respPaymentURL = "" // no redirect untuk sync flow
	}

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": purchaseCreatedResp{
		JobID:      jobID,
		InvoiceID:  invoiceID.String(),
		Domain:     domain,
		Status:     finalStatus,
		PaymentURL: respPaymentURL,
		Total:      total,
		Currency:   "IDR",
		DueAt:      dueAt.Format(time.RFC3339),
	}})
}
