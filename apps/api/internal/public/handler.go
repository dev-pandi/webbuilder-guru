package public

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/sites"
)

// Public read-only endpoints consumed by the renderer.

type Handler struct {
	sites               *sites.Repo
	pages               *pages.Repo
	rendererDefaultHost string
}

func NewHandler(s *sites.Repo, p *pages.Repo, rendererDefaultHost string) *Handler {
	return &Handler{sites: s, pages: p, rendererDefaultHost: rendererDefaultHost}
}

// GET /public/site-by-host?host=<hostname>
// Resolves either a custom verified domain or a "<slug>.<rendererDefaultHost>" subdomain.
func (h *Handler) SiteByHost(c *fiber.Ctx) error {
	host := strings.ToLower(strings.TrimSpace(c.Query("host")))
	if host == "" {
		return httpx.BadRequest(c, "host required")
	}
	if s, err := h.sites.GetByHost(c.Context(), host); err == nil {
		return httpx.OK(c, s)
	} else if !errors.Is(err, sites.ErrNotFound) {
		return httpx.Internal(c, "lookup failed")
	}
	if h.rendererDefaultHost != "" && strings.HasSuffix(host, "."+h.rendererDefaultHost) {
		slug := strings.TrimSuffix(host, "."+h.rendererDefaultHost)
		if s, err := h.sites.GetBySlug(c.Context(), slug); err == nil {
			return httpx.OK(c, s)
		}
	}
	return httpx.NotFound(c, "no site published for this host")
}

// GET /public/sites/:id/pages/:slug   (slug "_home" returns the home page)
func (h *Handler) PageBySlug(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	slug := c.Params("slug")
	if slug == "_home" {
		p, err := h.pages.GetHomeOfSite(c.Context(), id)
		if errors.Is(err, pages.ErrNotFound) {
			return httpx.NotFound(c, "home page not found")
		}
		if err != nil {
			return httpx.Internal(c, "load failed")
		}
		return httpx.OK(c, p)
	}
	p, err := h.pages.GetBySiteAndSlug(c.Context(), id, slug)
	if errors.Is(err, pages.ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, p)
}

// GET /public/sites/:id/pages — list slugs (for sitemap and renderer navigation).
func (h *Handler) ListPages(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	out, err := h.pages.ListBySite(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, out)
}
