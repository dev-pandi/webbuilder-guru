package audit

import (
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/httpx"
)

// Handler — admin-only viewer untuk audit log. Route mount di admin group
// (auth.RequireAdmin di router layer). Handler tidak enforce role sendiri —
// asumsi middleware sudah lolos.
type Handler struct{ repo *Repo }

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// List — GET /api/v1/admin/audit-log?event=&actor_id=&target_type=&target_id=
//         &since=&until=&page=&page_size=
//
// Response: httpx.Paginated[Entry] shape.
func (h *Handler) List(c *fiber.Ctx) error {
	f := ListFilter{}
	f.Event = strings.TrimSpace(c.Query("event"))
	f.TargetType = strings.TrimSpace(c.Query("target_type"))
	f.TargetID = strings.TrimSpace(c.Query("target_id"))
	if v := c.Query("actor_id"); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			return httpx.BadRequest(c, "actor_id bukan UUID valid")
		}
		f.ActorID = &id
	}
	if v := c.Query("since"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return httpx.BadRequest(c, "since harus RFC3339")
		}
		f.Since = &t
	}
	if v := c.Query("until"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return httpx.BadRequest(c, "until harus RFC3339")
		}
		f.Until = &t
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	f.Limit = pageSize
	f.Offset = (page - 1) * pageSize

	items, total, err := h.repo.List(c.Context(), f)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	totalPages := (total + pageSize - 1) / pageSize
	return httpx.OK(c, fiber.Map{
		"items":       items,
		"page":        page,
		"page_size":   pageSize,
		"total":       total,
		"total_pages": totalPages,
	})
}
