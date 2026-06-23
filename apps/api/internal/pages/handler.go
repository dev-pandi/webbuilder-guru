package pages

import (
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	pages *Repo
	sites *sites.Repo
}

func NewHandler(pages *Repo, sitesRepo *sites.Repo) *Handler {
	return &Handler{pages: pages, sites: sitesRepo}
}

var slugRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9\-/]{0,60}[a-z0-9])?$`)

type createReq struct {
	Slug   string          `json:"slug"`
	Title  string          `json:"title"`
	Tree   json.RawMessage `json:"tree"`
	SEO    json.RawMessage `json:"seo"`
	IsHome bool            `json:"is_home"`
}

type updateReq struct {
	Slug   *string         `json:"slug"`
	Title  *string         `json:"title"`
	Tree   json.RawMessage `json:"tree"`
	SEO    json.RawMessage `json:"seo"`
	IsHome *bool           `json:"is_home"`
}

func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	out, err := h.pages.ListBySite(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, out)
}

func (h *Handler) CreateForSite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	site, err := h.sites.GetOwned(c.Context(), siteID, uid)
	if err != nil {
		return httpx.NotFound(c, "site not found")
	}
	// Quota check
	if site.QuotaMaxPages > 0 {
		count, err := h.pages.CountBySite(c.Context(), siteID)
		if err != nil {
			return httpx.Internal(c, "quota check failed")
		}
		if count >= site.QuotaMaxPages {
			return httpx.Forbidden(c, "page quota reached ("+itoa(site.QuotaMaxPages)+" maks). Hapus halaman atau naikkan quota.")
		}
	}
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug invalid")
	}
	p, err := h.pages.Create(c.Context(), siteID, req.Slug, strings.TrimSpace(req.Title), req.Tree, req.SEO, req.IsHome)
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used in this site")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, p)
}

func itoa(n int) string { return strconv.Itoa(n) }

func (h *Handler) Get(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	p, err := h.pages.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), p.SiteID, uid); err != nil {
		return httpx.NotFound(c, "page not found")
	}
	return httpx.OK(c, p)
}

func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.pages.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "page not found")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Slug != nil {
		s := strings.ToLower(strings.TrimSpace(*req.Slug))
		if !slugRe.MatchString(s) {
			return httpx.BadRequest(c, "slug invalid")
		}
		req.Slug = &s
	}
	uidCopy := uid
	p, err := h.pages.Update(c.Context(), id, req.Title, req.Tree, req.SEO, req.IsHome, req.Slug, &uidCopy)
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used")
	}
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, p)
}

// GET /api/v1/pages/:id/versions
func (h *Handler) ListVersions(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.pages.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "page not found")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	out, err := h.pages.ListVersions(c.Context(), id, limit)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, out)
}

// POST /api/v1/pages/:id/restore/:versionId
func (h *Handler) RestoreVersion(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	pageID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	versionID, err := uuid.Parse(c.Params("versionId"))
	if err != nil {
		return httpx.BadRequest(c, "invalid version id")
	}
	existing, err := h.pages.Get(c.Context(), pageID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "page not found")
	}
	// guard: version must belong to this page
	v, err := h.pages.GetVersion(c.Context(), versionID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "version not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if v.PageID != pageID {
		return httpx.NotFound(c, "version not found")
	}
	uidCopy := uid
	p, err := h.pages.Restore(c.Context(), versionID, &uidCopy)
	if err != nil {
		return httpx.Internal(c, "restore failed: "+err.Error())
	}
	_ = h.pages.PruneOldVersions(c.Context(), pageID, 50)
	return httpx.OK(c, p)
}

func (h *Handler) Duplicate(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.pages.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "page not found")
	}
	p, err := h.pages.Duplicate(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "duplicate failed: "+err.Error())
	}
	return httpx.Created(c, p)
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.pages.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "page not found")
	}
	if err := h.pages.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}
