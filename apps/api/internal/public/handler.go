package public

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/blog"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/products"
	"github.com/webbuilder/api/internal/sites"
)

// Public read-only endpoints consumed by the renderer.

type Handler struct {
	sites               *sites.Repo
	pages               *pages.Repo
	products            *products.Repo
	blog                *blog.Repo
	rendererDefaultHost string
}

func NewHandler(s *sites.Repo, p *pages.Repo, pr *products.Repo, b *blog.Repo, rendererDefaultHost string) *Handler {
	return &Handler{
		sites:               s,
		pages:               p,
		products:            pr,
		blog:                b,
		rendererDefaultHost: rendererDefaultHost,
	}
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

// --- Products (public read for renderer / dynamic blocks) ---

// GET /public/sites/:id/products?limit=20
// Only returns "active" products. Newest first.
func (h *Handler) ListProducts(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	items, _, err := h.products.ListPage(c.Context(), id, "%", "active", "newest", limit, 0)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}

// GET /public/sites/:id/products/:slug
func (h *Handler) ProductBySlug(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	p, err := h.products.GetBySiteSlug(c.Context(), id, c.Params("slug"))
	if errors.Is(err, products.ErrNotFound) {
		return httpx.NotFound(c, "product not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if p.Status != "active" {
		return httpx.NotFound(c, "product not found")
	}
	return httpx.OK(c, p)
}

// --- Blog posts (public read) ---

// GET /public/sites/:id/blog-posts?limit=20
// Only returns "published" posts. Newest first by published_at.
func (h *Handler) ListBlogPosts(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	items, _, err := h.blog.ListPage(c.Context(), id, "%", "published", "published_desc", limit, 0)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}

// GET /public/sites/:id/blog-posts/:slug
func (h *Handler) BlogPostBySlug(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	p, err := h.blog.GetBySiteSlug(c.Context(), id, c.Params("slug"))
	if errors.Is(err, blog.ErrNotFound) {
		return httpx.NotFound(c, "post not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if p.Status != "published" {
		return httpx.NotFound(c, "post not found")
	}
	return httpx.OK(c, p)
}
