package jobs

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/httpx"
)

// Handler — HTTP endpoints untuk browse/inspect job records.
// Read-only — mutation cuma via Tracker dari handler operasi domain.
type Handler struct {
	store Store
}

func NewHandler(s Store) *Handler { return &Handler{store: s} }

// Get — GET /v1/jobs/:id
func (h *Handler) Get(c *fiber.Ctx) error {
	if h.store == nil {
		return httpx.ServiceUnavailable(c, "jobs_disabled", "job store belum di-wire")
	}
	id := c.Params("id")
	if id == "" {
		return httpx.BadRequest(c, "id wajib")
	}
	job, err := h.store.Get(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "job tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, job)
}

// List — GET /v1/jobs?kind=&status=&domain=&external_user_id=&limit=&offset=
func (h *Handler) List(c *fiber.Ctx) error {
	if h.store == nil {
		return httpx.ServiceUnavailable(c, "jobs_disabled", "job store belum di-wire")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	f := ListFilter{
		Kind:           Kind(c.Query("kind")),
		Status:         Status(c.Query("status")),
		Domain:         c.Query("domain"),
		ExternalUserID: c.Query("external_user_id"),
		Limit:          limit,
		Offset:         offset,
	}
	items, total, err := h.store.List(c.Context(), f)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{
		"items":  items,
		"total":  total,
		"limit":  f.Limit,
		"offset": f.Offset,
	})
}
