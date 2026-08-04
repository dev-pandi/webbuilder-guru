package invoices

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// AssignmentResolver — dependency untuk aggregate reseller/agent listing.
// Return list client user_id yang di-manage oleh managerID. Nil = feature
// off (ListForTeam handler return 503).
type AssignmentResolver interface {
	ListManagedClientIDs(ctx context.Context, managerID uuid.UUID) ([]uuid.UUID, error)
}

// Handler — HTTP endpoints untuk invoices.
//
// User (JWT authenticated): list + detail + PDF (own only, enforce ownership).
// Admin: list all + detail + PDF + manual verify (mark-paid).
// Reseller/agent: aggregate list (self + managed clients).
type Handler struct {
	repo        *Repo
	svc         *Service
	pdf         PDFRenderer         // opsional; kalau nil, endpoint /pdf return 501
	assignments AssignmentResolver  // opsional; kalau nil, /reseller/invoices return 503
}

func NewHandler(r *Repo, s *Service) *Handler {
	return &Handler{repo: r, svc: s}
}

func (h *Handler) SetPDFRenderer(p PDFRenderer) { h.pdf = p }

// SetAssignments inject reseller assignment resolver untuk aggregate list.
// Nil-safe: kalau tidak di-set, endpoint `/reseller/invoices` return 503.
func (h *Handler) SetAssignments(a AssignmentResolver) { h.assignments = a }

// --- User endpoints ---

// GET /api/v1/invoices — list milik user login. Pagination via ?page + ?limit.
func (h *Handler) ListMine(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	limit, offset := parsePage(c)
	items, err := h.repo.ListByUser(c.Context(), uid, limit, offset)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items})
}

// GET /api/v1/reseller/invoices — aggregate untuk reseller/agent portal.
// Include: invoice caller sendiri + invoice client yang di-manage +
// invoice yang caller trigger sebagai purchased_by (on-behalf-of).
func (h *Handler) ListForTeam(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	if h.assignments == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "assignments_disabled",
			"Fitur aggregate invoice belum di-wire.")
	}
	clientIDs, err := h.assignments.ListManagedClientIDs(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, "list managed clients failed: "+err.Error())
	}
	limit, offset := parsePage(c)
	items, err := h.repo.ListForTeam(c.Context(), uid, clientIDs, limit, offset)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items})
}

// canAccessInvoice — return true kalau caller boleh lihat invoice ini.
// Rules:
//   1. Invoice.user_id == caller → self (own invoice)
//   2. Invoice.purchased_by == caller → caller yang trigger (on-behalf-of)
//   3. Invoice.user_id ∈ managed clients (via assignments resolver)
//
// Rule 3 butuh assignments resolver; kalau nil, skip (cuma rule 1+2).
func (h *Handler) canAccessInvoice(c *fiber.Ctx, inv *Invoice, callerID uuid.UUID) bool {
	if inv.UserID == callerID {
		return true
	}
	if inv.PurchasedBy != nil && *inv.PurchasedBy == callerID {
		return true
	}
	if h.assignments != nil {
		clientIDs, err := h.assignments.ListManagedClientIDs(c.Context(), callerID)
		if err == nil {
			for _, id := range clientIDs {
				if id == inv.UserID {
					return true
				}
			}
		}
	}
	return false
}

// GET /api/v1/invoices/:id — detail milik user (ownership check).
// Reseller/agent boleh akses kalau invoice user_id di managed clients,
// atau kalau caller = purchased_by (on-behalf-of).
func (h *Handler) GetMine(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	inv, err := h.repo.GetWithLines(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "invoice tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	if !h.canAccessInvoice(c, inv, uid) {
		return httpx.NotFound(c, "invoice tidak ditemukan")
	}
	return httpx.OK(c, inv)
}

// GET /api/v1/invoices/:id/pdf — download PDF. Sama access rule dengan GetMine.
func (h *Handler) GetPDFMine(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	inv, err := h.repo.GetWithLines(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "invoice tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	if !h.canAccessInvoice(c, inv, uid) {
		return httpx.NotFound(c, "invoice tidak ditemukan")
	}
	return h.renderPDF(c, inv)
}

// --- Admin endpoints ---

// GET /api/v1/admin/invoices — list all.
func (h *Handler) ListAdmin(c *fiber.Ctx) error {
	limit, offset := parsePage(c)
	items, err := h.repo.ListAll(c.Context(), limit, offset)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items})
}

// GET /api/v1/admin/invoices/:id — detail (any invoice).
func (h *Handler) GetAdmin(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	inv, err := h.repo.GetWithLines(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "invoice tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, inv)
}

// GET /api/v1/admin/invoices/:id/pdf — download PDF (any invoice).
func (h *Handler) GetPDFAdmin(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	inv, err := h.repo.GetWithLines(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "invoice tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return h.renderPDF(c, inv)
}

// POST /api/v1/admin/invoices/:id/mark-paid — manual verify (untuk
// manual_bank flow). Admin verify bukti transfer, lalu tandai paid.
type markPaidReq struct {
	ProviderRef string `json:"provider_ref"` // opsional; nomor referensi bank
}

func (h *Handler) MarkPaidAdmin(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	var req markPaidReq
	_ = c.BodyParser(&req) // opsional

	if err := h.svc.MarkPaid(c.Context(), id, time.Now(), req.ProviderRef); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "invoice tidak ditemukan")
		}
		if errors.Is(err, ErrInvalidStatus) {
			return httpx.Conflict(c, err.Error())
		}
		return httpx.Internal(c, err.Error())
	}
	inv, _ := h.repo.GetWithLines(c.Context(), id)
	return httpx.OK(c, inv)
}

// POST /api/v1/admin/invoices/:id/cancel — admin cancel.
func (h *Handler) CancelAdmin(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	if err := h.svc.Cancel(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "invoice tidak ditemukan")
		}
		if errors.Is(err, ErrInvalidStatus) {
			return httpx.Conflict(c, err.Error())
		}
		return httpx.Internal(c, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

// --- helpers ---

// renderPDF — kalau PDF renderer belum di-inject, return 501.
func (h *Handler) renderPDF(c *fiber.Ctx, inv *Invoice) error {
	if h.pdf == nil {
		return httpx.Err(c, fiber.StatusNotImplemented, "pdf_disabled",
			"PDF renderer belum dikonfigurasi")
	}
	buf, err := h.pdf.Render(c.Context(), inv)
	if err != nil {
		return httpx.Internal(c, "render pdf: "+err.Error())
	}
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", "inline; filename=\""+inv.Number+".pdf\"")
	return c.Send(buf)
}

func parsePage(c *fiber.Ctx) (limit, offset int) {
	limit, _ = strconv.Atoi(c.Query("limit"))
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 20
	}
	offset = (page - 1) * limit
	return limit, offset
}
