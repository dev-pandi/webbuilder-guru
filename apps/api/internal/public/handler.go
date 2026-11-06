package public

import (
	"context"
	"encoding/json"
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
	"github.com/webbuilder/api/internal/templates"
)

// Public read-only endpoints consumed by the renderer.

type Handler struct {
	sites      *sites.Repo
	pages      *pages.Repo
	products   *products.Repo
	blog       *blog.Repo
	templates  *templates.Repo // nil = template-preview endpoint 503
	suspension SuspensionChecker
}

// SuspensionChecker — diimplementasi abuse.Repo. Interface supaya paket
// public tidak bergantung ke paket abuse.
type SuspensionChecker interface {
	SuspensionFor(ctx context.Context, host string, siteID uuid.UUID) (string, error)
}

func NewHandler(s *sites.Repo, p *pages.Repo, pr *products.Repo, b *blog.Repo) *Handler {
	return &Handler{sites: s, pages: p, products: pr, blog: b}
}

// SetSuspensionChecker — nil-safe; tanpa checker penangguhan tidak ditegakkan.
func (h *Handler) SetSuspensionChecker(c SuspensionChecker) { h.suspension = c }

// SetTemplates — inject template repo pasca-construction (avoid circular
// dep di NewHandler signature). Nil-safe.
func (h *Handler) SetTemplates(r *templates.Repo) { h.templates = r }

// GET /public/site-by-host?host=<hostname>
// Resolves site by custom verified domain (baik BYO `domains` maupun PANDI
// `domain_purchases`). Free-subdomain fallback sudah dihapus — konsep
// "1 domain = 1 situs" tidak lagi menyediakan URL platform gratis.
//
// Response 404 punya body `{ error: { code, message } }` dengan code:
//   - `site_not_published` — ada site yang link ke domain ini tapi
//     status=draft. Renderer bisa tampilkan hint "publikasikan dulu".
//   - `no_site_for_host` — tidak ada site link sama sekali (host tidak
//     dikenal / typo / belum di-attach).
func (h *Handler) SiteByHost(c *fiber.Ctx) error {
	host := strings.ToLower(strings.TrimSpace(c.Query("host")))
	if host == "" {
		return httpx.BadRequest(c, "host required")
	}
	if s, err := h.sites.GetByHost(c.Context(), host); err == nil {
		// Satu-satunya titik penegakan penangguhan: SEMUA rute renderer
		// (beranda, halaman, artikel, blog, produk, materi, sitemap)
		// me-resolve situs lewat endpoint ini, dan semuanya berhenti
		// menyajikan konten begitu respons tidak OK. Gagal lookup = tutup
		// (503), bukan terbuka — situs yang ditangguhkan tidak boleh muncul
		// kembali hanya karena query cek-nya error.
		if h.suspension != nil {
			code, serr := h.suspension.SuspensionFor(c.Context(), host, s.ID)
			if serr != nil {
				return httpx.Err(c, fiber.StatusServiceUnavailable, "suspension_check_failed",
					"Status situs tidak dapat diperiksa.")
			}
			if code != "" {
				return httpx.Err(c, fiber.StatusUnavailableForLegalReasons, code,
					"Situs ini ditangguhkan karena pelanggaran kebijakan konten.")
			}
		}
		return httpx.OK(c, s)
	} else if !errors.Is(err, sites.ErrNotFound) {
		return httpx.Internal(c, "lookup failed")
	}
	// Bedakan "site draft" vs "host tidak dikenal" supaya renderer bisa
	// kasih user pesan yang tepat.
	hasSite, err := h.sites.HasSiteForHost(c.Context(), host)
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}
	if hasSite {
		return httpx.Err(c, 404, "site_not_published",
			"Situs sudah dihubungkan tapi belum diterbitkan.")
	}
	return httpx.Err(c, 404, "no_site_for_host",
		"Host ini belum terhubung ke situs mana pun.")
}

// GET /public/sites/:id/pages/:slug   (slug "_home" returns the home page)
func (h *Handler) PageBySlug(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	slug := c.Params("slug")
	if slug == "_home" {
		// Find the home page among published ones. Unpublished home pages
		// don't show on the public site at all — author must publish them.
		all, err := h.pages.ListBySitePublic(c.Context(), id)
		if err != nil {
			return httpx.Internal(c, "load failed")
		}
		for i := range all {
			if all[i].IsHome {
				return httpx.OK(c, &all[i])
			}
		}
		return httpx.NotFound(c, "home page not found")
	}
	p, err := h.pages.GetBySiteAndSlugPublic(c.Context(), id, slug)
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
	out, err := h.pages.ListBySitePublic(c.Context(), id)
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

// TemplatePreviewPage — 1 halaman di dalam template preview response. Shape
// selaras dengan `pages` element di templates.pages_json + apa yang renderer
// butuhkan (subset dari sites/pages endpoint yang biasa).
type TemplatePreviewPage struct {
	Slug   string          `json:"slug"`
	Title  string          `json:"title"`
	IsHome bool            `json:"is_home"`
	Tree   json.RawMessage `json:"tree"`
	SEO    json.RawMessage `json:"seo"`
}

// TemplatePreviewResponse — envelope untuk renderer template-preview route.
// Cover full render context: identity + theme (untuk CSS var + font link) +
// semua pages supaya navigation antar-page di preview jalan tanpa refetch.
type TemplatePreviewResponse struct {
	ID          string                `json:"id"`
	Slug        string                `json:"slug"`
	Name        string                `json:"name"`
	Description string                `json:"description"`
	Category    string                `json:"category"`
	Variant     string                `json:"variant"`
	Theme       json.RawMessage       `json:"theme"`
	Pages       []TemplatePreviewPage `json:"pages"`
}

// TemplatePreview — GET /public/template-preview/:slug
//
// Public endpoint (no auth) — dipakai renderer di route
// `/template-preview/:slug` untuk render HTML live seperti site production.
// Hanya template dengan status='published' yang accessible; draft/archived
// return 404 supaya WIP tidak bocor ke crawler.
//
// Response include semua pages (tidak filter is_home saja) supaya renderer
// bisa navigate antar-page tanpa fetch ulang.
func (h *Handler) TemplatePreview(c *fiber.Ctx) error {
	if h.templates == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "templates_disabled",
			"Template repo belum di-wire.")
	}
	slug := strings.ToLower(strings.TrimSpace(c.Params("slug")))
	if slug == "" {
		return httpx.BadRequest(c, "slug required")
	}
	t, err := h.templates.GetBySlug(c.Context(), slug)
	if errors.Is(err, templates.ErrNotFound) {
		return httpx.NotFound(c, "template tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}
	// Draft + archived → 404 supaya draft admin tidak leak. (Nanti Phase 4
	// tambah token-based preview untuk admin lihat draft-nya.)
	if t.Status != templates.StatusPublished {
		return httpx.NotFound(c, "template belum published")
	}

	// Parse pages_json → slice untuk shape yang stabil (renderer bergantung).
	var pages []TemplatePreviewPage
	if len(t.Pages) > 0 {
		if err := json.Unmarshal(t.Pages, &pages); err != nil {
			return httpx.Internal(c, "pages_json malformed: "+err.Error())
		}
	}
	// Ensure tree + seo tidak nil di setiap page (renderer parse pakai `??`).
	for i := range pages {
		if len(pages[i].Tree) == 0 {
			pages[i].Tree = json.RawMessage(`{}`)
		}
		if len(pages[i].SEO) == 0 {
			pages[i].SEO = json.RawMessage(`{}`)
		}
	}
	theme := t.Theme
	if len(theme) == 0 {
		theme = json.RawMessage(`{}`)
	}
	return httpx.OK(c, TemplatePreviewResponse{
		ID:          t.ID.String(),
		Slug:        t.Slug,
		Name:        t.Name,
		Description: t.Description,
		Category:    t.Category,
		Variant:     t.Variant,
		Theme:       theme,
		Pages:       pages,
	})
}

// TemplatePreviewByID — GET /public/template-preview-by-id/:id
//
// Sama seperti TemplatePreview tapi:
//   1. Accept UUID (bukan slug) — supaya tidak bisa guess dari nama.
//   2. TIDAK filter status — draft/archived juga accessible.
//
// Kenapa aman tanpa auth: template.ID adalah UUIDv4 dengan 122-bit entropy —
// tidak feasible di-brute-force. Dipakai admin dashboard untuk live preview
// template saat editing (belum published). Kalau UUID bocor, worst-case admin
// draft template terlihat orang — impact rendah karena hanya struktur block
// + theme (tidak ada data user/business sensitive).
func (h *Handler) TemplatePreviewByID(c *fiber.Ctx) error {
	if h.templates == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "templates_disabled",
			"Template repo belum di-wire.")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	t, err := h.templates.GetByID(c.Context(), id)
	if errors.Is(err, templates.ErrNotFound) {
		return httpx.NotFound(c, "template tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}
	// TIDAK cek status — admin preview mode.
	var pages []TemplatePreviewPage
	if len(t.Pages) > 0 {
		if err := json.Unmarshal(t.Pages, &pages); err != nil {
			return httpx.Internal(c, "pages_json malformed: "+err.Error())
		}
	}
	for i := range pages {
		if len(pages[i].Tree) == 0 {
			pages[i].Tree = json.RawMessage(`{}`)
		}
		if len(pages[i].SEO) == 0 {
			pages[i].SEO = json.RawMessage(`{}`)
		}
	}
	theme := t.Theme
	if len(theme) == 0 {
		theme = json.RawMessage(`{}`)
	}
	return httpx.OK(c, TemplatePreviewResponse{
		ID:          t.ID.String(),
		Slug:        t.Slug,
		Name:        t.Name,
		Description: t.Description,
		Category:    t.Category,
		Variant:     t.Variant,
		Theme:       theme,
		Pages:       pages,
	})
}
