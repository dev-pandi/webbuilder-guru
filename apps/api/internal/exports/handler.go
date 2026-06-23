package exports

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	builder *Builder
}

func NewHandler(b *Builder) *Handler { return &Handler{builder: b} }

// POST /api/v1/sites/:id/export
// Streams the zip directly. Synchronous for MVP; async worker can be added later.
func (h *Handler) Export(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	c.Set(fiber.HeaderContentType, "application/zip")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="site-`+siteID.String()+`.zip"`)
	if err := h.builder.Write(c.Context(), c.Response().BodyWriter(), siteID, uid); err != nil {
		if errors.Is(err, sites.ErrNotFound) {
			return httpx.NotFound(c, "site not found")
		}
		return httpx.Internal(c, "export failed: "+err.Error())
	}
	return nil
}
