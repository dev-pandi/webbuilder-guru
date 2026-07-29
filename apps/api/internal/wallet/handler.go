// Package wallet — reseller wallet proxy ke registrar-api. Web-builder tidak
// simpan state wallet lokal; semua endpoint di sini transparent forward ke
// registrar dengan JWT reseller induk.
//
// Boundary:
//   - Reseller/agent = boleh READ (GET balance, ledger, topup list, banks)
//   - Reseller-only = boleh WRITE (POST topup, upload proof) — agent tidak
//     boleh top-up (cegah agent nakal drain wallet reseller induk).
package wallet

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/registrar"
)

// AssignmentChecker — dep untuk resolve wallet-owner reseller kalau caller
// role=agent. Agent view balance-nya reseller induk (parent_reseller_id).
// Interface, bukan concrete import ke `reseller` package, cegah cycle.
type AssignmentChecker interface {
	// HasActiveAssignment kept in interface untuk future need (agent list-clients).
	// Wallet flow tidak butuh — kita hanya perlu parent_reseller_id di caller record.
}

// Handler — Fiber handler untuk wallet proxy.
type Handler struct {
	registrar *registrar.Client
	users     *auth.Repo
	audit     *audit.Repo // nil = audit disabled
}

func NewHandler(r *registrar.Client, users *auth.Repo) *Handler {
	return &Handler{registrar: r, users: users}
}

// SetAudit inject audit repo (Phase 7). Nil = no-op.
func (h *Handler) SetAudit(r *audit.Repo) { h.audit = r }

// logAudit fire-and-forget helper.
func (h *Handler) logAudit(ctx context.Context, actor uuid.UUID, event, targetType, targetID string, meta map[string]any) {
	if h.audit == nil {
		return
	}
	var actorID *uuid.UUID
	if actor != uuid.Nil {
		actorID = &actor
	}
	_ = h.audit.Log(ctx, audit.Params{
		ActorID:    actorID,
		Event:      event,
		TargetType: targetType,
		TargetID:   targetID,
		Metadata:   meta,
	})
}

// resolveActor — pastikan caller reseller aktif ATAU agent dengan parent
// reseller aktif. Return caller record + "effective" reseller ID (self kalau
// reseller, parent kalau agent) yang dipakai untuk scope authorization di
// UI. Semua request ke registrar-api pakai JWT reseller induk (via
// `REGISTRAR_RESELLER_EMAIL/PASSWORD` env) — jadi effective ID di sini
// hanya untuk logging/UI, bukan untuk cross-tenant isolation.
type actor struct {
	User             *auth.User
	IsReseller       bool
	IsAgent          bool
	EffectiveReseller uuid.UUID
}

func (h *Handler) resolveActor(c *fiber.Ctx) (*actor, error) {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return nil, errors.New("unauthenticated")
	}
	u, err := h.users.GetByID(c.Context(), uid)
	if err != nil {
		return nil, err
	}
	a := &actor{User: u}
	switch u.Role {
	case auth.RoleReseller:
		if u.ResellerStatus != auth.ResellerStatusActive {
			return nil, errors.New("reseller belum aktif")
		}
		a.IsReseller = true
		a.EffectiveReseller = u.ID
	case auth.RoleAgent:
		if u.ParentResellerID == nil {
			return nil, errors.New("agent tanpa reseller induk")
		}
		a.IsAgent = true
		a.EffectiveReseller = *u.ParentResellerID
	default:
		return nil, errors.New("role tidak diizinkan")
	}
	return a, nil
}

// GetWallet — GET /api/v1/reseller/wallet
// Reseller/agent view balance + last 20 ledger. Proxy passthrough.
func (h *Handler) GetWallet(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	if _, err := h.resolveActor(c); err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	w, err := h.registrar.GetWallet(c.Context())
	if err != nil {
		return proxyErr(c, "wallet_read_failed", err)
	}
	return httpx.OK(c, w)
}

// GetLedger — GET /api/v1/reseller/wallet/ledger?kind=&page=&page_size=
func (h *Handler) GetLedger(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	if _, err := h.resolveActor(c); err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	kind := strings.TrimSpace(c.Query("kind"))
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	res, err := h.registrar.ListWalletLedger(c.Context(), kind, page, pageSize)
	if err != nil {
		return proxyErr(c, "ledger_read_failed", err)
	}
	return httpx.OK(c, res)
}

// InitTopup — POST /api/v1/reseller/wallet/topup
// Reseller-only. Agent 403 (cegah agent drain wallet induk via topup-refund
// cycle bila ada bug).
type topupReq struct {
	Amount        float64 `json:"amount"`
	PaymentMethod string  `json:"payment_method"`
	ReturnURL     string  `json:"return_url,omitempty"`
	BankID        uint64  `json:"bank_id,omitempty"`
}

func (h *Handler) InitTopup(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	a, err := h.resolveActor(c)
	if err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	if !a.IsReseller {
		return httpx.Forbidden(c, "hanya reseller (bukan agent) yang boleh top-up wallet")
	}

	var req topupReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	// Web builder validate dasar sebelum forward — cegah waste HTTP round-trip.
	if req.Amount < 100_000 {
		return httpx.BadRequest(c, "amount minimal Rp 100.000")
	}
	if req.Amount > 100_000_000 {
		return httpx.BadRequest(c, "amount maksimal Rp 100.000.000 per top-up")
	}
	switch req.PaymentMethod {
	case "midtrans", "paylabs", "manual_transfer":
	default:
		return httpx.BadRequest(c, "payment_method harus 'midtrans', 'paylabs', atau 'manual_transfer'")
	}
	// Idempotency-Key dari header. Frontend generate UUID per attempt.
	idem := strings.TrimSpace(c.Get("Idempotency-Key"))
	if idem == "" {
		return httpx.Err(c, fiber.StatusBadRequest, "idempotency_key_required",
			"Header Idempotency-Key wajib.")
	}

	resp, err := h.registrar.InitTopup(c.Context(), registrar.TopupRequest{
		Amount:         req.Amount,
		PaymentMethod:  req.PaymentMethod,
		IdempotencyKey: idem,
		ReturnURL:      req.ReturnURL,
		BankID:         req.BankID,
	})
	if err != nil {
		return proxyErr(c, "topup_failed", err)
	}
	h.logAudit(c.Context(), a.User.ID, audit.EventWalletTopupInit, "topup", resp.TopupID, map[string]any{
		"amount":         req.Amount,
		"payment_method": req.PaymentMethod,
	})
	return httpx.OK(c, resp)
}

// GetTopupStatus — GET /api/v1/reseller/wallet/topup/:topup_id/status
func (h *Handler) GetTopupStatus(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	if _, err := h.resolveActor(c); err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	topupID := strings.TrimSpace(c.Params("topup_id"))
	if topupID == "" {
		return httpx.BadRequest(c, "topup_id required")
	}
	st, err := h.registrar.GetTopupStatus(c.Context(), topupID)
	if err != nil {
		return proxyErr(c, "topup_status_failed", err)
	}
	return httpx.OK(c, st)
}

// ListMyTopups — GET /api/v1/reseller/wallet/topup?status=&page=&page_size=
func (h *Handler) ListMyTopups(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	if _, err := h.resolveActor(c); err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	status := strings.TrimSpace(c.Query("status"))
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	res, err := h.registrar.ListMyTopups(c.Context(), status, page, pageSize)
	if err != nil {
		return proxyErr(c, "topup_list_failed", err)
	}
	return httpx.OK(c, res)
}

// ListBanks — GET /api/v1/reseller/wallet/topup/banks
// Read-only, safe untuk reseller/agent kedua-duanya (info publik: bank tujuan).
func (h *Handler) ListBanks(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	if _, err := h.resolveActor(c); err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	banks, err := h.registrar.ListTopupBanks(c.Context())
	if err != nil {
		return proxyErr(c, "banks_read_failed", err)
	}
	return httpx.OK(c, banks)
}

// UploadProof — POST /api/v1/reseller/wallet/topup/:topup_id/proof (multipart)
// Reseller-only. File di-forward ke registrar tanpa disimpan di web-builder.
// MIME whitelist + size limit di-enforce di sini + registrar (defence in depth).
func (h *Handler) UploadProof(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	a, err := h.resolveActor(c)
	if err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	if !a.IsReseller {
		return httpx.Forbidden(c, "hanya reseller (bukan agent) yang boleh upload bukti transfer")
	}
	topupID := strings.TrimSpace(c.Params("topup_id"))
	if topupID == "" {
		return httpx.BadRequest(c, "topup_id required")
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return httpx.BadRequest(c, "field 'file' wajib (multipart)")
	}
	if fh.Size > 5*1024*1024 {
		return httpx.BadRequest(c, "ukuran file maksimal 5 MiB")
	}

	// MIME check — trust header dulu, fallback ke ekstensi.
	mime := fh.Header.Get("Content-Type")
	if mime == "" {
		switch strings.ToLower(filepath.Ext(fh.Filename)) {
		case ".png":
			mime = "image/png"
		case ".jpg", ".jpeg":
			mime = "image/jpeg"
		case ".pdf":
			mime = "application/pdf"
		}
	}
	switch mime {
	case "image/png", "image/jpeg", "application/pdf":
	default:
		return httpx.BadRequest(c, "format file harus PNG, JPG, atau PDF")
	}

	src, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "buka file gagal")
	}
	defer src.Close()

	st, err := h.registrar.UploadTopupProof(c.Context(), topupID, fh.Filename, mime, src)
	if err != nil {
		return proxyErr(c, "upload_proof_failed", err)
	}
	h.logAudit(c.Context(), a.User.ID, audit.EventWalletProofUploaded, "topup", topupID, map[string]any{
		"filename": fh.Filename,
		"size":     fh.Size,
	})
	return httpx.OK(c, st)
}

// proxyErr — map error dari registrar ke Fiber response. 402 = wallet
// insufficient (register-for-client flow) — TIDAK dipakai di file ini (semua
// wallet endpoint tidak trigger debit); di-handle di domain_purchase handler.
func proxyErr(c *fiber.Ctx, code string, err error) error {
	var apiErr *registrar.APIError
	if errors.As(err, &apiErr) && apiErr.Status >= 400 && apiErr.Status < 500 {
		return httpx.Err(c, apiErr.Status, code, apiErr.Msg)
	}
	return httpx.Err(c, fiber.StatusBadGateway, code, fmt.Sprintf("%v", err))
}

// Compile-time: ensure context import stays live (used for tests di future).
var _ = context.Background
