package zones

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// Handler — endpoint zones catalog.
//
// Admin (JWT + role=admin): CRUD full.
// Public (authenticated user OK, tidak butuh role khusus): GET /zones untuk
// wizard cari domain — hanya return active zones.
type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// --- Public: GET /api/v1/zones ---
//
// Return active zones untuk render TLD chip di wizard. UI-friendly shape:
// tanpa updated_by/updated_at (irrelevant untuk user), ordered by sort_order.
func (h *Handler) ListPublic(c *fiber.Ctx) error {
	zs, err := h.repo.ListActive(c.Context())
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": zs})
}

// --- Admin: GET /api/v1/admin/zones ---
//
// Return semua zones (active + inactive) supaya admin bisa manage.
func (h *Handler) ListAdmin(c *fiber.Ctx) error {
	zs, err := h.repo.ListAll(c.Context())
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": zs})
}

// createReq — payload POST /admin/zones.
type createReq struct {
	TLD             string `json:"tld"`
	Label           string `json:"label"`
	RequireDocument bool   `json:"require_document"`
	AutoApproved    bool   `json:"auto_approved"`
	NikAutoApproved bool   `json:"nik_auto_approved"`
	MinYears        int    `json:"min_years"`
	MaxYears        int    `json:"max_years"`
	SortOrder       int    `json:"sort_order"`
}

// --- Admin: POST /api/v1/admin/zones ---
func (h *Handler) Create(c *fiber.Ctx) error {
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "payload tidak valid")
	}
	tld := strings.ToLower(strings.TrimSpace(req.TLD))
	if tld == "" {
		return httpx.BadRequest(c, "tld wajib diisi")
	}
	// Basic sanity: no leading dot ("id" bukan ".id"). Label bisa punya dot.
	if strings.HasPrefix(tld, ".") {
		return httpx.BadRequest(c, "tld tanpa titik di depan (contoh: 'id' bukan '.id')")
	}
	adminID := auth.UserIDFrom(c)
	in := CreateInput{
		TLD:             tld,
		Label:           strings.TrimSpace(req.Label),
		RequireDocument: req.RequireDocument,
		AutoApproved:    req.AutoApproved,
		NikAutoApproved: req.NikAutoApproved,
		MinYears:        req.MinYears,
		MaxYears:        req.MaxYears,
		SortOrder:       req.SortOrder,
	}
	if adminID != uuid.Nil {
		in.CreatedBy = &adminID
	}
	z, err := h.repo.Create(c.Context(), in)
	if err != nil {
		if errors.Is(err, ErrTLDTaken) {
			return httpx.Conflict(c, "tld sudah ada di catalog")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.Created(c, z)
}

// updateReq — partial update, semua pointer.
type updateReq struct {
	Label           *string `json:"label"`
	Active          *bool   `json:"active"`
	RequireDocument *bool   `json:"require_document"`
	AutoApproved    *bool   `json:"auto_approved"`
	NikAutoApproved *bool   `json:"nik_auto_approved"`
	MinYears        *int    `json:"min_years"`
	MaxYears        *int    `json:"max_years"`
	SortOrder       *int    `json:"sort_order"`
}

// --- Admin: PATCH /api/v1/admin/zones/:id ---
func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "payload tidak valid")
	}
	// Cross-field validation.
	if req.MinYears != nil && *req.MinYears < 1 {
		return httpx.BadRequest(c, "min_years minimal 1")
	}
	if req.MaxYears != nil && req.MinYears != nil && *req.MaxYears < *req.MinYears {
		return httpx.BadRequest(c, "max_years tidak boleh kurang dari min_years")
	}
	adminID := auth.UserIDFrom(c)
	in := UpdateInput{
		Label:           req.Label,
		Active:          req.Active,
		RequireDocument: req.RequireDocument,
		AutoApproved:    req.AutoApproved,
		NikAutoApproved: req.NikAutoApproved,
		MinYears:        req.MinYears,
		MaxYears:        req.MaxYears,
		SortOrder:       req.SortOrder,
	}
	if adminID != uuid.Nil {
		in.UpdatedBy = &adminID
	}
	z, err := h.repo.Update(c.Context(), id, in)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "zone tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, z)
}

// --- Admin: DELETE /api/v1/admin/zones/:id ---
func (h *Handler) Delete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "zone tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
