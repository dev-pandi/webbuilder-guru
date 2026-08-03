package payments

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// Handler — payment_methods CRUD.
//
// Admin: full CRUD termasuk credentials.
// Public (authenticated user): GET /payment-methods — enabled only, config
// masked (credentials → "***"). Wizard render dari sini.
type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// --- Public: GET /api/v1/payment-methods ---
func (h *Handler) ListPublic(c *fiber.Ctx) error {
	items, err := h.repo.ListEnabled(c.Context())
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items})
}

// --- Admin: GET /api/v1/admin/payment-methods ---
func (h *Handler) ListAdmin(c *fiber.Ctx) error {
	items, err := h.repo.ListAll(c.Context())
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items})
}

// createReq — untuk tambah custom gateway (di luar 4 seed). Jarang dipakai;
// biasanya admin cukup enable + isi config yang sudah seed.
type createReq struct {
	Code      string          `json:"code"`
	Label     string          `json:"label"`
	Type      string          `json:"type"`
	SortOrder int             `json:"sort_order"`
	Config    json.RawMessage `json:"config"`
}

// --- Admin: POST /api/v1/admin/payment-methods ---
func (h *Handler) Create(c *fiber.Ctx) error {
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "payload tidak valid")
	}
	code := strings.ToLower(strings.TrimSpace(req.Code))
	label := strings.TrimSpace(req.Label)
	if code == "" || label == "" {
		return httpx.BadRequest(c, "code dan label wajib")
	}
	if !validType(req.Type) {
		return httpx.BadRequest(c, "type harus salah satu: gateway | manual | wallet")
	}
	adminID := auth.UserIDFrom(c)
	in := CreateInput{
		Code:      code,
		Label:     label,
		Type:      req.Type,
		SortOrder: req.SortOrder,
		Config:    req.Config,
	}
	if adminID != uuid.Nil {
		in.CreatedBy = &adminID
	}
	m, err := h.repo.Create(c.Context(), in)
	if err != nil {
		if errors.Is(err, ErrCodeTaken) {
			return httpx.Conflict(c, "code sudah ada di catalog")
		}
		if errors.Is(err, ErrInvalidType) {
			return httpx.BadRequest(c, err.Error())
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.Created(c, m)
}

// updateReq — partial update.
type updateReq struct {
	Label     *string         `json:"label"`
	Enabled   *bool           `json:"enabled"`
	Config    json.RawMessage `json:"config"`
	SortOrder *int            `json:"sort_order"`
}

// --- Admin: PATCH /api/v1/admin/payment-methods/:id ---
func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	// Peek raw body untuk detect "config: null" vs "config missing" (yang
	// otherwise indistinguishable di struct pointer). Kalau field muncul di
	// body → treat sebagai replace; kalau missing → don't touch.
	raw := c.Body()
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(raw, &probe); err != nil {
		return httpx.BadRequest(c, "payload tidak valid")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "payload tidak valid")
	}
	// Kalau config field TIDAK muncul di body, set nil supaya COALESCE tidak
	// overwrite. Kalau muncul (bahkan sebagai {}), set explicit value.
	if _, hasConfig := probe["config"]; !hasConfig {
		req.Config = nil
	}
	adminID := auth.UserIDFrom(c)
	in := UpdateInput{
		Label:     req.Label,
		Enabled:   req.Enabled,
		Config:    req.Config,
		SortOrder: req.SortOrder,
	}
	if adminID != uuid.Nil {
		in.UpdatedBy = &adminID
	}
	m, err := h.repo.Update(c.Context(), id, in)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "payment method tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, m)
}

// --- Admin: DELETE /api/v1/admin/payment-methods/:id ---
func (h *Handler) Delete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "payment method tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}
