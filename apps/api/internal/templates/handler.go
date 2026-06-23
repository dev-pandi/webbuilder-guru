package templates

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	repo  *Repo
	sites *sites.Repo
	pages *pages.Repo
}

func NewHandler(repo *Repo, s *sites.Repo, p *pages.Repo) *Handler {
	return &Handler{repo: repo, sites: s, pages: p}
}

func (h *Handler) List(c *fiber.Ctx) error {
	out, err := h.repo.List(c.Context())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, out)
}

func (h *Handler) Get(c *fiber.Ctx) error {
	t, err := h.repo.GetBySlug(c.Context(), c.Params("slug"))
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "template not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, t)
}

type createFromTemplateReq struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

var slugRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`)

// POST /sites/from-template/:slug   { slug, name }
func (h *Handler) CreateSiteFromTemplate(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	tplSlug := c.Params("slug")
	tpl, err := h.repo.GetBySlug(c.Context(), tplSlug)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "template not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}

	var req createFromTemplateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Name = strings.TrimSpace(req.Name)
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug invalid")
	}
	if req.Name == "" {
		req.Name = tpl.Name
	}

	site, err := h.sites.Create(c.Context(), uid, req.Slug, req.Name, &tpl.ID, tpl.Theme)
	if errors.Is(err, sites.ErrSlugTaken) {
		return httpx.Conflict(c, "slug already taken")
	}
	if errors.Is(err, sites.ErrLimitReached) {
		return httpx.Forbidden(c, "site limit reached")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}

	// Provision template pages.
	var tplPages []struct {
		Slug   string          `json:"slug"`
		Title  string          `json:"title"`
		Tree   json.RawMessage `json:"tree"`
		SEO    json.RawMessage `json:"seo"`
		IsHome bool            `json:"is_home"`
	}
	if len(tpl.Pages) > 0 {
		_ = json.Unmarshal(tpl.Pages, &tplPages)
	}
	for _, p := range tplPages {
		if p.Slug == "" {
			continue
		}
		_, _ = h.pages.Create(c.Context(), site.ID, strings.ToLower(p.Slug), p.Title, p.Tree, p.SEO, p.IsHome)
	}

	return httpx.Created(c, site)
}
