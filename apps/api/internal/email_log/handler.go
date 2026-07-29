package email_log

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"

	"github.com/webbuilder/api/internal/httpx"
)

// Handler — admin-only viewer. Mount under /api/v1/admin/email-log via router.
type Handler struct{ repo *Repo }

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// List — GET /api/v1/admin/email-log?status=&to=&page=&page_size=
func (h *Handler) List(c *fiber.Ctx) error {
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != StatusSent && status != StatusFailed {
		return httpx.BadRequest(c, "status harus 'sent' atau 'failed'")
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "50"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	items, total, err := h.repo.List(c.Context(), ListFilter{
		Status: status,
		To:     c.Query("to"),
		Limit:  pageSize,
		Offset: (page - 1) * pageSize,
	})
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
