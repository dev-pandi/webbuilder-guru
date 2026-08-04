package wallet_local

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
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
	// GetRoleAndParent return role + parent reseller id (nullable). Dipakai
	// agent activity endpoint untuk resolve wallet reseller induk.
	GetRoleAndParent(ctx context.Context, userID uuid.UUID) (role string, parentResellerID *uuid.UUID, err error)
}

// ProofStorage — subset assets.Storage untuk simpan bukti transfer.
// Sengaja small interface supaya avoid direct dep ke assets package.
type ProofStorage interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error)
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	Delete(ctx context.Context, key string) error
}

// Handler — user-facing wallet endpoints.
type Handler struct {
	repo        *Repo
	invoicesSvc InvoiceForTopup
	gwRegistry  GatewayForTopup
	users       UserProfile
	storage     ProofStorage
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// SetInvoicesService wire invoice service — required untuk POST /wallet/topup.
func (h *Handler) SetInvoicesService(s InvoiceForTopup) { h.invoicesSvc = s }

// SetGatewayRegistry wire gateway registry — required untuk POST /wallet/topup.
func (h *Handler) SetGatewayRegistry(g GatewayForTopup) { h.gwRegistry = g }

// SetUserProfile wire user lookup — optional (gateway customer info).
func (h *Handler) SetUserProfile(u UserProfile) { h.users = u }

// SetStorage wire blob storage — required untuk upload bukti transfer.
func (h *Handler) SetStorage(s ProofStorage) { h.storage = s }

// --- GET /api/v1/wallet ---
// Return "effective billing wallet" balance:
//   - reseller / client → wallet sendiri
//   - agent → wallet parent reseller (dipakai buat semua transaksi agent)
//
// Response tambahan `wallet_owner_id` supaya frontend tahu ini wallet siapa
// (agent bisa show label "Wallet reseller induk"). Nil = wallet sendiri.
func (h *Handler) GetBalance(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	// Resolve effective wallet owner. Default = self.
	walletOwner := uid
	var ownedByParent bool
	if h.users != nil {
		if role, parent, err := h.users.GetRoleAndParent(c.Context(), uid); err == nil {
			if role == "agent" && parent != nil {
				walletOwner = *parent
				ownedByParent = true
			}
		}
	}
	b, err := h.repo.GetBalance(c.Context(), walletOwner)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{
		"balance":              b.Balance,
		"currency":             b.Currency,
		"wallet_owner_id":      walletOwner,
		"is_shared_from_parent": ownedByParent,
	})
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

// AgentsBreakdown — GET /api/v1/wallet/agents-breakdown
// Reseller-only. Aggregate wallet_ledger caller (wallet reseller) group by
// metadata.agent_id → per-agent debit summary. Optional date filter via
// query ?from=ISO&to=ISO.
func (h *Handler) AgentsBreakdown(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	if h.users == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "role_lookup_disabled",
			"User profile lookup belum wired")
	}
	role, _, err := h.users.GetRoleAndParent(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}
	if role != "reseller" {
		return httpx.Forbidden(c, "endpoint khusus reseller")
	}
	var from, to time.Time
	if s := strings.TrimSpace(c.Query("from")); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			from = t
		}
	}
	if s := strings.TrimSpace(c.Query("to")); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			to = t
		}
	}
	items, err := h.repo.AgentBreakdownByReseller(c.Context(), uid, from, to)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	// Grand total supaya UI bisa show summary tanpa client-side reduce.
	var totalDebit int64
	var totalTxn int
	for _, r := range items {
		totalDebit += r.TotalDebit
		totalTxn += r.TxnCount
	}
	return httpx.OK(c, fiber.Map{
		"items":              items,
		"total_debit":        totalDebit,
		"total_transactions": totalTxn,
	})
}

// AgentActivity — GET /api/v1/wallet/agent-activity
// Return debit ledger entries dari wallet reseller induk yang di-tag
// dengan agent_id = caller.ID. Dipakai agent wallet page supaya agent
// bisa lihat kontribusi transaksinya tanpa expose full balance reseller.
func (h *Handler) AgentActivity(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	if h.users == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "role_lookup_disabled",
			"User profile lookup belum wired")
	}
	role, parentID, err := h.users.GetRoleAndParent(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}
	if role != "agent" {
		return httpx.Forbidden(c, "endpoint khusus agent")
	}
	if parentID == nil {
		return httpx.Err(c, fiber.StatusBadRequest, "agent_orphan",
			"Akun agent tidak terhubung ke reseller.")
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 50
	}
	items, err := h.repo.ListLedgerByAgent(c.Context(), *parentID, uid, limit, (page-1)*limit)
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
	// Agent tidak boleh top-up wallet sendiri — pakai saldo reseller induk.
	// Cegah orphan balance kalau agent iseng hit endpoint langsung.
	if h.users != nil {
		if role, _, err := h.users.GetRoleAndParent(c.Context(), uid); err == nil && role == "agent" {
			return httpx.Forbidden(c,
				"Agent tidak perlu top-up. Transaksi Anda pakai saldo reseller induk.")
		}
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

// --- Upload bukti transfer (manual_bank flow) ---

// Max 5 MiB — bukti transfer biasanya screenshot mobile banking; 5 MiB
// lebih dari cukup. Bigger cap = bigger risk untuk storage abuse.
const maxProofBytes = 5 * 1024 * 1024

// allowedProofMime — image + PDF. Screenshot m-banking + foto struk +
// PDF e-statement adalah 99% use case.
var allowedProofMime = map[string]string{
	"image/png":       ".png",
	"image/jpeg":      ".jpg",
	"image/jpg":       ".jpg",
	"application/pdf": ".pdf",
}

// UploadProof — POST /api/v1/wallet/topup/:id/proof (multipart)
// Fields: file (image/PDF, max 5 MiB), note (optional, max 500 char).
//
// Ownership-scoped (user_id from JWT). Status guard: hanya boleh upload
// kalau topup masih pending_payment. Setelah credited/failed → 409.
func (h *Handler) UploadProof(c *fiber.Ctx) error {
	if h.storage == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "storage_disabled",
			"Fitur upload bukti belum aktif — storage belum dikonfigurasi.")
	}
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}

	// Pre-check ownership + status supaya kita tidak upload blob dulu kalau
	// row tidak valid.
	t, err := h.repo.GetTopup(c.Context(), id, uid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "topup tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	if t.Status != TopupStatusPendingPayment {
		return httpx.Conflict(c,
			"Bukti transfer tidak bisa di-upload — status topup: "+t.Status)
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return httpx.BadRequest(c, "field 'file' wajib")
	}
	if fh.Size <= 0 {
		return httpx.BadRequest(c, "file kosong")
	}
	if fh.Size > maxProofBytes {
		return httpx.BadRequest(c, "file terlalu besar (max 5 MB)")
	}

	// MIME detection: prefer Content-Type header; fallback ke extension.
	mime := strings.ToLower(fh.Header.Get("Content-Type"))
	ext, ok := allowedProofMime[mime]
	if !ok {
		switch strings.ToLower(filepath.Ext(fh.Filename)) {
		case ".jpg", ".jpeg":
			ext, mime = ".jpg", "image/jpeg"
		case ".png":
			ext, mime = ".png", "image/png"
		case ".pdf":
			ext, mime = ".pdf", "application/pdf"
		default:
			return httpx.BadRequest(c, "hanya JPG/PNG/PDF yang diterima")
		}
	}

	f, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "open file gagal")
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, maxProofBytes+1))
	if err != nil {
		return httpx.Internal(c, "read file gagal")
	}
	if int64(len(body)) > maxProofBytes {
		return httpx.BadRequest(c, "file terlalu besar")
	}

	note := strings.TrimSpace(c.FormValue("note"))
	if len(note) > 500 {
		note = note[:500]
	}

	// Storage key — opaque, tidak leak identitas via URL scan.
	key := fmt.Sprintf("wallet-topup-proofs/%s/%d-%s%s",
		uid.String(), time.Now().UnixNano(), uuid.NewString(), ext)

	if _, err := h.storage.Put(c.Context(), key,
		bytes.NewReader(body), int64(len(body)), mime); err != nil {
		return httpx.Internal(c, "upload gagal: "+err.Error())
	}

	// Kalau ada bukti lama, delete blob-nya setelah update sukses.
	oldKey := t.ProofKey

	if err := h.repo.SetTopupProof(c.Context(), id, uid,
		key, mime, int64(len(body)), note); err != nil {
		// Best-effort cleanup blob yang baru di-put.
		_ = h.storage.Delete(c.Context(), key)
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "topup tidak ditemukan / status berubah")
		}
		return httpx.Internal(c, "simpan metadata bukti gagal: "+err.Error())
	}

	// Cleanup blob lama best-effort (idempotent).
	if oldKey != "" {
		_ = h.storage.Delete(c.Context(), oldKey)
	}

	slog.Info("topup: proof uploaded",
		"topup_id", id, "user_id", uid, "size", len(body), "mime", mime)

	return httpx.OK(c, fiber.Map{
		"topup_id":          id.String(),
		"proof_mime":        mime,
		"proof_size":        len(body),
		"proof_note":        note,
		"proof_uploaded_at": time.Now().Format(time.RFC3339),
	})
}

// GetProof — GET /api/v1/wallet/topup/:id/proof
// Return base64 data URI supaya frontend bisa preview inline (pattern sama
// dengan documents_local.Show).
func (h *Handler) GetProof(c *fiber.Ctx) error {
	if h.storage == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "storage_disabled",
			"Fitur bukti belum aktif")
	}
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
	if t.ProofKey == "" {
		return httpx.NotFound(c, "belum ada bukti transfer")
	}
	rc, err := h.storage.Get(c.Context(), t.ProofKey)
	if err != nil {
		return httpx.Internal(c, "read blob gagal: "+err.Error())
	}
	defer rc.Close()
	raw, err := io.ReadAll(io.LimitReader(rc, maxProofBytes+1))
	if err != nil {
		return httpx.Internal(c, "read blob gagal: "+err.Error())
	}
	return httpx.OK(c, fiber.Map{
		"topup_id": t.ID.String(),
		"type":     t.ProofMime,
		"image":    "data:" + t.ProofMime + ";base64," + base64.StdEncoding.EncodeToString(raw),
		"note":     t.ProofNote,
	})
}

// --- Admin: manage top-up requests ---

// AdminListTopups — GET /api/v1/admin/wallet/topups
// Query: status, has_proof (true/false), page, limit.
func (h *Handler) AdminListTopups(c *fiber.Ctx) error {
	status := strings.TrimSpace(c.Query("status"))
	hasProofRaw := strings.TrimSpace(c.Query("has_proof"))
	var hasProof *bool
	if hasProofRaw == "true" {
		v := true
		hasProof = &v
	} else if hasProofRaw == "false" {
		v := false
		hasProof = &v
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 30
	}
	items, total, err := h.repo.AdminListTopups(c.Context(), AdminListFilter{
		Status:   status,
		HasProof: hasProof,
		Limit:    limit,
		Offset:   (page - 1) * limit,
	})
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{
		"items": items,
		"page":  page,
		"limit": limit,
		"total": total,
	})
}

// AdminGetProof — GET /api/v1/admin/wallet/topups/:id/proof
// Sama dengan GetProof user tapi tanpa ownership check.
func (h *Handler) AdminGetProof(c *fiber.Ctx) error {
	if h.storage == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "storage_disabled",
			"Fitur bukti belum aktif")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	t, err := h.repo.AdminGetTopup(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "topup tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	if t.ProofKey == "" {
		return httpx.NotFound(c, "belum ada bukti transfer")
	}
	rc, err := h.storage.Get(c.Context(), t.ProofKey)
	if err != nil {
		return httpx.Internal(c, "read blob gagal: "+err.Error())
	}
	defer rc.Close()
	raw, err := io.ReadAll(io.LimitReader(rc, maxProofBytes+1))
	if err != nil {
		return httpx.Internal(c, "read blob gagal: "+err.Error())
	}
	return httpx.OK(c, fiber.Map{
		"topup_id": t.ID.String(),
		"type":     t.ProofMime,
		"image":    "data:" + t.ProofMime + ";base64," + base64.StdEncoding.EncodeToString(raw),
		"note":     t.ProofNote,
	})
}

// AdminApprove — POST /api/v1/admin/wallet/topups/:id/approve
// Admin sudah verify bukti transfer di rekening → 2-step:
//  1. invoicesSvc.MarkPaid — update invoices.status=paid + paid_at.
//  2. repo.MarkTopupCredited — atomically credit wallet_balances +
//     insert wallet_ledger + update topup.status=credited.
//
// invoicesSvc.MarkPaid TIDAK auto-trigger ExecuteAfterPayment (itu cuma
// jalan di paymentwh webhook path), jadi kita harus call MarkTopupCredited
// eksplisit di sini. Idempotent — kalau webhook duluan credit, step 2
// return existing tanpa double-credit.
func (h *Handler) AdminApprove(c *fiber.Ctx) error {
	if h.invoicesSvc == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "invoices_disabled",
			"Fitur invoice belum aktif")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	t, err := h.repo.AdminGetTopup(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "topup tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	if t.Status == TopupStatusCredited {
		return httpx.OK(c, t) // idempotent — sudah credited
	}
	if t.Status != TopupStatusPendingPayment {
		return httpx.Conflict(c,
			"Topup tidak bisa di-approve — status: "+t.Status)
	}

	adminID := auth.UserIDFrom(c)
	providerRef := "manual_approved:" + adminID.String()

	// Step 1: MarkPaid invoice. Idempotent — kalau webhook tiba sebelum
	// admin approve, no-op.
	if err := h.invoicesSvc.MarkPaid(c.Context(), t.InvoiceID, time.Now(), providerRef); err != nil {
		slog.Error("admin approve topup: mark paid failed",
			"topup_id", id, "invoice_id", t.InvoiceID, "admin_id", adminID, "error", err)
		return httpx.Internal(c, "gagal tandai invoice paid: "+err.Error())
	}

	// Step 2: MarkTopupCredited — credit wallet_balances + wallet_ledger +
	// update topup.status=credited. Idempotent via SELECT FOR UPDATE inside
	// tx; kalau sudah credited (webhook race), return existing ledger.
	if _, _, err := h.repo.MarkTopupCredited(c.Context(), id); err != nil {
		slog.Error("admin approve topup: mark credited failed",
			"topup_id", id, "invoice_id", t.InvoiceID, "admin_id", adminID, "error", err)
		return httpx.Internal(c, "gagal credit wallet: "+err.Error())
	}

	slog.Info("admin approve topup",
		"topup_id", id, "invoice_id", t.InvoiceID, "amount", t.Amount, "admin_id", adminID)

	// Refetch supaya response reflect status baru (credited).
	updated, _ := h.repo.AdminGetTopup(c.Context(), id)
	return httpx.OK(c, updated)
}

// AdminReject — POST /api/v1/admin/wallet/topups/:id/reject
// Body: {"reason":"..."} — required.
type adminRejectReq struct {
	Reason string `json:"reason"`
}

func (h *Handler) AdminReject(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	var req adminRejectReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "payload tidak valid")
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		return httpx.BadRequest(c, "reason wajib diisi")
	}

	t, err := h.repo.AdminGetTopup(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "topup tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	if t.Status != TopupStatusPendingPayment {
		return httpx.Conflict(c,
			"Topup tidak bisa di-reject — status: "+t.Status)
	}
	if err := h.repo.UpdateTopupStatus(c.Context(), id, TopupStatusFailed, req.Reason); err != nil {
		return httpx.Internal(c, err.Error())
	}
	adminID := auth.UserIDFrom(c)
	slog.Info("admin reject topup",
		"topup_id", id, "reason", req.Reason, "admin_id", adminID)

	updated, _ := h.repo.AdminGetTopup(c.Context(), id)
	return httpx.OK(c, updated)
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
