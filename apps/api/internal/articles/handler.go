package articles

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	repo  *Repo
	sites *sites.Repo
}

func NewHandler(r *Repo, s *sites.Repo) *Handler { return &Handler{repo: r, sites: s} }

var slugRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$`)

type createReq struct {
	Rubric          string          `json:"rubric"`
	Slug            string          `json:"slug"`
	Title           string          `json:"title"`
	Excerpt         string          `json:"excerpt"`
	BodyMD          string          `json:"body_md"`
	CoverImageURL   string          `json:"cover_image_url"`
	Tags            json.RawMessage `json:"tags"`
	Status          string          `json:"status"`
	CommentsEnabled *bool           `json:"comments_enabled"`
	ReadingTimeMin  int             `json:"reading_time_min"`
	SEOTitle        string          `json:"seo_title"`
	SEODescription  string          `json:"seo_description"`
}

type updateReq struct {
	Slug            *string         `json:"slug"`
	Title           *string         `json:"title"`
	Excerpt         *string         `json:"excerpt"`
	BodyMD          *string         `json:"body_md"`
	CoverImageURL   *string         `json:"cover_image_url"`
	Tags            json.RawMessage `json:"tags"`
	Status          *string         `json:"status"`
	CommentsEnabled *bool           `json:"comments_enabled"`
	ReadingTimeMin  *int            `json:"reading_time_min"`
	SEOTitle        *string         `json:"seo_title"`
	SEODescription  *string         `json:"seo_description"`
}

// GET /api/v1/sites/:id/articles?rubric=&status=
func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	p := httpx.ParsePagination(c)
	rubric := strings.TrimSpace(c.Query("rubric"))
	if rubric != "" && !IsValidRubric(rubric) {
		return httpx.BadRequest(c, "invalid rubric")
	}
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "draft" && status != "published" {
		return httpx.BadRequest(c, "invalid status")
	}
	items, total, err := h.repo.ListPage(c.Context(), siteID, p.LikePattern(), rubric, status, p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// POST /api/v1/sites/:id/articles
func (h *Handler) Create(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	site, err := h.sites.GetOwned(c.Context(), siteID, uid)
	if err != nil {
		return httpx.NotFound(c, "site not found")
	}
	// Quota check — sites.QuotaMaxArticles column added by migration 0048.
	// Kalau kolom belum di-load ke struct sites.Site, kita skip; itu opsional.
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Title = strings.TrimSpace(req.Title)
	req.Rubric = strings.ToLower(strings.TrimSpace(req.Rubric))
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug invalid")
	}
	if req.Title == "" {
		return httpx.BadRequest(c, "title required")
	}
	if !IsValidRubric(req.Rubric) {
		return httpx.BadRequest(c, "invalid rubric")
	}
	// Default: comments_enabled = true kalau tidak dikirim.
	commentsEnabled := true
	if req.CommentsEnabled != nil {
		commentsEnabled = *req.CommentsEnabled
	}
	_ = site // reserved for future quota check
	a, err := h.repo.Create(c.Context(), siteID, CreateInput{
		Rubric: req.Rubric, Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt,
		BodyMD: req.BodyMD, CoverImageURL: req.CoverImageURL, Tags: req.Tags,
		Status: req.Status, CommentsEnabled: commentsEnabled,
		ReadingTimeMin: req.ReadingTimeMin, SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used in this rubric")
	}
	if errors.Is(err, ErrInvalidRub) {
		return httpx.BadRequest(c, "invalid rubric")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, a)
}

// GET /api/v1/articles/:id
func (h *Handler) Get(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	a, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), a.SiteID, uid); err != nil {
		return httpx.NotFound(c, "article not found")
	}
	return httpx.OK(c, a)
}

// PATCH /api/v1/articles/:id
func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "article not found")
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
	// Forum rule: reject explicit false. Spec §16.
	if req.CommentsEnabled != nil && !*req.CommentsEnabled && IsForumRubric(existing.Rubric) {
		return httpx.BadRequest(c, "comments cannot be disabled on forum-diskusi")
	}
	a, err := h.repo.Update(c.Context(), id, UpdateInput{
		Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt, BodyMD: req.BodyMD,
		CoverImageURL: req.CoverImageURL, Tags: req.Tags, Status: req.Status,
		CommentsEnabled: req.CommentsEnabled, ReadingTimeMin: req.ReadingTimeMin,
		SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used in this rubric")
	}
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if errors.Is(err, ErrInvalidStat) {
		return httpx.BadRequest(c, "invalid status")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, a)
}

// POST /api/v1/articles/:id/publish
func (h *Handler) Publish(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "article not found")
	}
	status := "published"
	a, err := h.repo.Update(c.Context(), id, UpdateInput{Status: &status})
	if err != nil {
		return httpx.Internal(c, "publish failed")
	}
	return httpx.OK(c, a)
}

// DELETE /api/v1/articles/:id
func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "article not found")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// GET /api/v1/sites/:id/stats — Jejak Website Saya.
func (h *Handler) Stats(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	s, err := h.repo.SiteStats(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "stats failed")
	}
	return httpx.OK(c, s)
}
