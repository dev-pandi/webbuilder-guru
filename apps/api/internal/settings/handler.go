package settings

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// Handler — admin CRUD system_settings.
//
// Bukan endpoint public — semua setting boleh berisi konfigurasi operational
// (PPN rate, brand info) yang admin manage. Frontend user-facing pakai
// package-level Service accessor (BrandName, dsb.), bukan HTTP fetch key.
type Handler struct {
	repo *Repo
	svc  *Service
}

func NewHandler(r *Repo, svc *Service) *Handler {
	return &Handler{repo: r, svc: svc}
}

// --- GET /api/v1/admin/settings ---
func (h *Handler) List(c *fiber.Ctx) error {
	ss, err := h.repo.List(c.Context())
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": ss})
}

// updateReq — PATCH /admin/settings/:key body.
type updateReq struct {
	Value string `json:"value"`
}

// --- PATCH /api/v1/admin/settings/:key ---
//
// Set value untuk key. Key harus format `<namespace>.<key>` (mengandung dot,
// tanpa whitespace) — cegah accidental typo yang bikin junk key.
func (h *Handler) Update(c *fiber.Ctx) error {
	key := strings.TrimSpace(c.Params("key"))
	if key == "" {
		return httpx.BadRequest(c, "key wajib")
	}
	// Basic sanity — key harus punya dot (namespace) dan tidak boleh spasi.
	if !strings.Contains(key, ".") || strings.ContainsAny(key, " \t\n") {
		return httpx.BadRequest(c, "key format tidak valid (harus namespace.key tanpa spasi)")
	}

	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "payload tidak valid")
	}

	adminID := auth.UserIDFrom(c)
	var by *uuid.UUID
	if adminID != uuid.Nil {
		by = &adminID
	}
	s, err := h.repo.Set(c.Context(), key, req.Value, by)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	// Invalidate cache supaya next-read dapat value baru immediately.
	if h.svc != nil {
		h.svc.Invalidate(key)
	}
	return httpx.OK(c, s)
}

// --- GET /api/v1/admin/settings/:key ---
//
// Fetch single setting. Return default value kalau key belum di-set di DB
// (via service getter) — supaya admin panel bisa "reset to default" easy.
func (h *Handler) Get(c *fiber.Ctx) error {
	key := strings.TrimSpace(c.Params("key"))
	if key == "" {
		return httpx.BadRequest(c, "key wajib")
	}
	s, err := h.repo.Get(c.Context(), key)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "setting tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, s)
}
