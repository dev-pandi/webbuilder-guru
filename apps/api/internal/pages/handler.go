package pages

import (
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	pages  *Repo
	sites  *sites.Repo
	issuer *auth.TokenIssuer // optional — only needed for preview tokens
}

func NewHandler(pages *Repo, sitesRepo *sites.Repo, issuer *auth.TokenIssuer) *Handler {
	return &Handler{pages: pages, sites: sitesRepo, issuer: issuer}
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

// PreviewToken issues a short-lived HMAC token granting anonymous read access
// to a SINGLE page's DRAFT tree. Used by the editor's "Pratinjau" button so
// the author can share an unpublished page with reviewers via a temporary URL.
// Token TTL is 1 hour — long enough for normal review sessions, short enough
// to mitigate accidental leaks.
func (h *Handler) PreviewToken(c *fiber.Ctx) error {
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
	if h.issuer == nil {
		return httpx.Internal(c, "preview disabled")
	}
	tok, exp, err := h.issuer.IssuePreview(id, time.Hour)
	if err != nil {
		return httpx.Internal(c, "token gen failed")
	}
	return httpx.OK(c, fiber.Map{
		"token":      tok,
		"expires_at": exp.UTC(),
		// Path-only — caller composes the full URL with their renderer host.
		"path": "/_preview/" + tok,
	})
}

// PreviewByToken serves the DRAFT page tree to anyone holding a valid signed
// token. Anonymous endpoint — auth is the token itself. Token + audience
// validated via HMAC; no DB lookup of the token (stateless). Bundles the
// owning site (id/name/theme) so the renderer can apply theme + font in one
// roundtrip.
func (h *Handler) PreviewByToken(c *fiber.Ctx) error {
	if h.issuer == nil {
		return httpx.NotFound(c, "preview disabled")
	}
	tok := c.Params("token")
	if tok == "" {
		return httpx.BadRequest(c, "token required")
	}
	claims, err := h.issuer.ParsePreview(tok)
	if err != nil {
		return httpx.Unauthorized(c, "token tidak valid atau kadaluarsa")
	}
	p, err := h.pages.Get(c.Context(), claims.PageID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "page not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	site, err := h.sites.GetByID(c.Context(), p.SiteID)
	if err != nil {
		return httpx.Internal(c, "site load failed")
	}
	return httpx.OK(c, fiber.Map{
		"page": p,
		"site": fiber.Map{
			"id":    site.ID,
			"name":  site.Name,
			"theme": site.Theme,
		},
	})
}

// Publish promotes the current draft to live. Caller must own the page's site.
// Idempotent — calling twice without intervening edits is a no-op replay.
func (h *Handler) Publish(c *fiber.Ctx) error {
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
	p, err := h.pages.Publish(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "publish failed")
	}
	return httpx.OK(c, p)
}

// Schedule sets scheduled_publish_at. Body: { "at": "<RFC3339>" }. Timestamp
// harus di future (>= now + 30 detik untuk kasih margin worker cycle).
// Manual publish otomatis clear jadwal (di repo).
func (h *Handler) Schedule(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req struct {
		At string `json:"at"`
	}
	if err := c.BodyParser(&req); err != nil || strings.TrimSpace(req.At) == "" {
		return httpx.BadRequest(c, "field `at` (RFC3339) wajib")
	}
	at, err := time.Parse(time.RFC3339, req.At)
	if err != nil {
		return httpx.BadRequest(c, "format `at` harus RFC3339 (contoh: 2026-08-15T14:00:00+07:00)")
	}
	// Margin 30 detik supaya kalau user set "sekarang" tidak race dengan
	// worker cycle. Kalau mau immediate, pakai /publish endpoint.
	if at.Before(time.Now().Add(30 * time.Second)) {
		return httpx.BadRequest(c, "waktu jadwal harus minimal 30 detik dari sekarang")
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
	p, err := h.pages.Schedule(c.Context(), id, at)
	if err != nil {
		return httpx.Internal(c, "schedule failed")
	}
	return httpx.OK(c, p)
}

// Unschedule clears scheduled_publish_at tanpa ubah publish state.
func (h *Handler) Unschedule(c *fiber.Ctx) error {
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
	p, err := h.pages.Unschedule(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "unschedule failed")
	}
	return httpx.OK(c, p)
}

// Unpublish removes the live snapshot. Page survives as draft.
func (h *Handler) Unpublish(c *fiber.Ctx) error {
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
	if err := h.pages.Unpublish(c.Context(), id); err != nil {
		return httpx.Internal(c, "unpublish failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
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
