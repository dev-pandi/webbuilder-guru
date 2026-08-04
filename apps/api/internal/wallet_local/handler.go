package wallet_local

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// --- Interfaces di-inject dari main.go (avoid import cycle) ---

// InvoiceForTopup — subset invoices.Service.
type InvoiceForTopup interface {
	CreateForTopup(ctx context.Context, in InvoiceTopupInput) (invoiceID uuid.UUID, total int64, dueAt time.Time, err error)
	SavePaymentRef(ctx context.Context, id uuid.UUID, providerRef string) error
	MarkPaid(ctx context.Context, id uuid.UUID, paidAt time.Time, providerRef string) error
}

// InvoiceTopupInput — payload minimal untuk create invoice topup.
type InvoiceTopupInput struct {
	UserID        uuid.UUID
	Amount        int64
	PaymentMethod string
	Description   string
	TopupID       string
}

// GatewayForTopup — abstraksi resolve payment gateway.
type GatewayForTopup interface {
	Get(ctx context.Context, code string) (TopupPaymentGateway, error)
}

// TopupPaymentGateway — subset paymentgw.Gateway.
//
// CreateCharge return:
//   paymentURL   — non-empty untuk online gateway (Midtrans/Paylabs).
//   instructions — non-empty untuk manual_bank (markdown).
//   providerRef  — provider transaction id untuk lookup di webhook.
type TopupPaymentGateway interface {
	Code() string
	Type() string
	CreateCharge(ctx context.Context, req TopupChargeRequest) (paymentURL, instructions, providerRefID string, err error)
}

type TopupChargeRequest struct {
	OrderID       string
	UserID        string
	Amount        int64
	Description   string
	CustomerName  string
	CustomerEmail string
	CustomerPhone string
	ReturnURL     string
	ExpiresAt     time.Time
}

// UserProfile — fetch customer info untuk gateway. Optional (kalau nil,
// pakai user_id string sebagai fallback).
type UserProfile interface {
	GetCustomerInfo(ctx context.Context, userID uuid.UUID) (name, email, phone string, err error)
}

// Handler — user-facing wallet endpoints.
type Handler struct {
	repo        *Repo
	invoicesSvc InvoiceForTopup
	gwRegistry  GatewayForTopup
	users       UserProfile
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// SetInvoicesService wire invoice service — required untuk POST /wallet/topup.
func (h *Handler) SetInvoicesService(s InvoiceForTopup) { h.invoicesSvc = s }

// SetGatewayRegistry wire gateway registry — required untuk POST /wallet/topup.
func (h *Handler) SetGatewayRegistry(g GatewayForTopup) { h.gwRegistry = g }

// SetUserProfile wire user lookup — optional (gateway customer info).
func (h *Handler) SetUserProfile(u UserProfile) { h.users = u }

// --- GET /api/v1/wallet ---
func (h *Handler) GetBalance(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	b, err := h.repo.GetBalance(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, b)
}

// --- GET /api/v1/wallet/ledger?page=&limit= ---
func (h *Handler) ListLedger(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 50
	}
	offset := (page - 1) * limit
	items, err := h.repo.ListLedger(c.Context(), uid, limit, offset)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items, "page": page, "limit": limit})
}

// --- Top-up endpoints ---

// Standard denominations — snap yang paling umum dipakai. Client-side validate
// pakai list ini supaya user tidak input Rp 12345 aneh. Backend tetap accept
// > 0, tapi frontend prefer preset chip.
const (
	MinTopupAmount = 50_000     // Rp 50k — minimum charge biar tidak spam
	MaxTopupAmount = 100_000_000 // Rp 100 juta — safety cap
)

type topupCreateReq struct {
	Amount        int64  `json:"amount"`         // IDR
	PaymentMethod string `json:"payment_method"` // midtrans | paylabs | manual_bank
	ReturnURL     string `json:"return_url,omitempty"`
}

type topupCreateResp struct {
	TopupID       string `json:"topup_id"`
	InvoiceID     string `json:"invoice_id"`
	Amount        int64  `json:"amount"`
	Currency      string `json:"currency"`
	Status        string `json:"status"`
	PaymentURL    string `json:"payment_url,omitempty"`
	Instructions  string `json:"instructions,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}

// CreateTopup — POST /api/v1/wallet/topup
//
// Flow:
//   1. Validate amount + method.
//   2. Create invoice (invoices.Service.CreateForTopup, no PPN).
//   3. Create wallet_topups row (link ke invoice_id).
//   4. Charge via gateway → paymentURL / instructions.
//   5. SavePaymentRef untuk paymentwh lookup.
//   6. Return topup_id + payment_url. Client polling status via GET.
//
// Header: Idempotency-Key WAJIB (frontend generate 1 UUID per attempt).
func (h *Handler) CreateTopup(c *fiber.Ctx) error {
	if h.invoicesSvc == nil || h.gwRegistry == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "topup_not_ready",
			"Fitur top-up belum aktif — dependencies invoices/gateway belum wired.")
	}
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	idem := strings.TrimSpace(c.Get("Idempotency-Key"))
	if idem == "" {
		return httpx.Err(c, fiber.StatusBadRequest, "idempotency_key_required",
			"Header Idempotency-Key wajib untuk cegah double-charge.")
	}

	var req topupCreateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Amount < MinTopupAmount {
		return httpx.BadRequest(c,
			fmt.Sprintf("Amount minimal Rp %d", MinTopupAmount))
	}
	if req.Amount > MaxTopupAmount {
		return httpx.BadRequest(c,
			fmt.Sprintf("Amount maksimal Rp %d", MaxTopupAmount))
	}
	req.PaymentMethod = strings.TrimSpace(req.PaymentMethod)
	if req.PaymentMethod == "" {
		return httpx.BadRequest(c, "payment_method wajib")
	}
	// Wallet-payment tidak boleh dipakai untuk top-up wallet (infinite loop).
	if req.PaymentMethod == "deposit_wallet" {
		return httpx.BadRequest(c,
			"payment_method 'deposit_wallet' tidak boleh untuk top-up wallet")
	}

	// Buat invoice dulu — dapat invoice_id, total, due_at.
	description := fmt.Sprintf("Top-up wallet Rp %d", req.Amount)
	invoiceID, total, dueAt, err := h.invoicesSvc.CreateForTopup(c.Context(), InvoiceTopupInput{
		UserID:        uid,
		Amount:        req.Amount,
		PaymentMethod: req.PaymentMethod,
		Description:   description,
	})
	if err != nil {
		slog.Error("topup: create invoice failed", "user_id", uid, "error", err)
		return httpx.Internal(c, "gagal membuat invoice topup")
	}

	// Resolve gateway sebelum create topup row supaya payment_url langsung
	// tersimpan di row (satu source of truth untuk polling).
	gw, err := h.gwRegistry.Get(c.Context(), req.PaymentMethod)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "gateway_unavailable",
			fmt.Sprintf("Payment method %q tidak tersedia: %v", req.PaymentMethod, err))
	}

	// Customer info dari user profile (opsional).
	var custName, custEmail, custPhone string
	if h.users != nil {
		custName, custEmail, custPhone, _ = h.users.GetCustomerInfo(c.Context(), uid)
	}

	paymentURL, instructions, providerRef, err := gw.CreateCharge(c.Context(), TopupChargeRequest{
		OrderID:       invoiceID.String(),
		UserID:        uid.String(),
		Amount:        total,
		Description:   description,
		CustomerName:  custName,
		CustomerEmail: custEmail,
		CustomerPhone: custPhone,
		ReturnURL:     strings.TrimSpace(req.ReturnURL),
		ExpiresAt:     dueAt,
	})
	if err != nil {
		slog.Error("topup: charge failed",
			"gateway", req.PaymentMethod, "invoice_id", invoiceID, "error", err)
		return httpx.Err(c, fiber.StatusBadGateway, "charge_failed", err.Error())
	}

	// Create wallet_topups row — link ke invoice_id + persist payment_url +
	// instructions (manual_bank).
	topup, err := h.repo.CreateTopup(c.Context(), TopupCreateInput{
		UserID:        uid,
		InvoiceID:     invoiceID,
		Amount:        req.Amount,
		PaymentMethod: req.PaymentMethod,
		PaymentURL:    paymentURL,
		Instructions:  instructions,
	})
	if err != nil {
		slog.Error("topup: create row failed", "invoice_id", invoiceID, "error", err)
		return httpx.Internal(c, "gagal simpan record topup")
	}

	// Persist provider_ref supaya paymentwh bisa lookup invoice saat webhook.
	if err := h.invoicesSvc.SavePaymentRef(c.Context(), invoiceID, providerRef); err != nil {
		slog.Warn("topup: save payment ref failed",
			"invoice_id", invoiceID, "error", err)
	}

	slog.Info("topup: checkout accepted",
		"topup_id", topup.ID, "invoice_id", invoiceID,
		"amount", req.Amount, "gateway", req.PaymentMethod,
		"has_payment_url", paymentURL != "")

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": topupCreateResp{
		TopupID:      topup.ID.String(),
		InvoiceID:    invoiceID.String(),
		Amount:       req.Amount,
		Currency:     "IDR",
		Status:       topup.Status,
		PaymentURL:   paymentURL,
		Instructions: instructions,
		CreatedAt:    topup.CreatedAt,
	}})
}

// GetTopup — GET /api/v1/wallet/topup/:id
// Ownership-scoped; return 404 kalau bukan milik caller.
func (h *Handler) GetTopup(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	t, err := h.repo.GetTopup(c.Context(), id, uid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "topup tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, t)
}

// ListTopups — GET /api/v1/wallet/topup?page=&limit=
func (h *Handler) ListTopups(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 20
	}
	offset := (page - 1) * limit
	items, err := h.repo.ListTopupsByUser(c.Context(), uid, limit, offset)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items, "page": page, "limit": limit})
}

// --- Admin endpoint: POST /api/v1/admin/wallet/adjust ---
//
// Manual balance adjustment (audit trail via ledger). Butuh admin role
// (di-guard di router level). Untuk operator support case: refund manual,
// credit promo, koreksi bug.
type adjustReq struct {
	UserID string `json:"user_id"`
	Delta  int64  `json:"delta"`  // +credit atau -debit
	Reason string `json:"reason"` // required
	Note   string `json:"note,omitempty"`
}

// AdminAdjust — admin-only. Bebas + atau − asalkan hasil balance tidak
// negative (repo Debit enforce).
func (h *Handler) AdminAdjust(c *fiber.Ctx) error {
	var req adjustReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	uid, err := uuid.Parse(req.UserID)
	if err != nil {
		return httpx.BadRequest(c, "user_id bukan UUID valid")
	}
	if req.Delta == 0 {
		return httpx.BadRequest(c, "delta tidak boleh 0")
	}
	if req.Reason == "" {
		req.Reason = ReasonAdminAdjust
	}

	// Metadata: siapa admin + note.
	adminID := auth.UserIDFrom(c)
	metaJSON := []byte(`{}`)
	if req.Note != "" || adminID != uuid.Nil {
		// Build JSON manually — small object, avoid heavy encoding/json for MVP.
		metaJSON = buildAdminMeta(adminID, req.Note)
	}

	var entry *LedgerEntry
	if req.Delta > 0 {
		entry, err = h.repo.Credit(c.Context(), TopupInput{
			UserID:   uid,
			Amount:   req.Delta,
			Reason:   req.Reason,
			Metadata: metaJSON,
		})
	} else {
		entry, err = h.repo.Debit(c.Context(), DebitInput{
			UserID:   uid,
			Amount:   -req.Delta,
			Reason:   req.Reason,
			Metadata: metaJSON,
		})
	}
	if err != nil {
		if err == ErrInsufficient {
			return httpx.Err(c, fiber.StatusUnprocessableEntity, "insufficient", err.Error())
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, entry)
}

// buildAdminMeta — encode admin_id + note ke JSON tanpa import
// encoding/json (small hand-rolled untuk avoid extra dependency).
// Safe untuk MVP karena input di-sanitize.
func buildAdminMeta(adminID uuid.UUID, note string) []byte {
	// Escape note untuk JSON string safety.
	escaped := escapeJSONString(note)
	if adminID == uuid.Nil {
		return []byte(`{"note":"` + escaped + `"}`)
	}
	return []byte(`{"admin_id":"` + adminID.String() + `","note":"` + escaped + `"}`)
}

func escapeJSONString(s string) string {
	out := make([]byte, 0, len(s))
	for _, c := range []byte(s) {
		switch c {
		case '"', '\\':
			out = append(out, '\\', c)
		case '\n':
			out = append(out, '\\', 'n')
		case '\r':
			out = append(out, '\\', 'r')
		case '\t':
			out = append(out, '\\', 't')
		default:
			if c < 0x20 {
				continue // drop control chars
			}
			out = append(out, c)
		}
	}
	return string(out)
}
