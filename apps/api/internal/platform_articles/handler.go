package platform_articles

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/httpx"
)

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

var slugRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$`)

// -------- Request DTOs --------

type createReq struct {
	Slug            string          `json:"slug"`
	Title           string          `json:"title"`
	Excerpt         string          `json:"excerpt"`
	BodyMD          string          `json:"body_md"`
	CoverImageURL   string          `json:"cover_image_url"`
	Category        string          `json:"category"`
	AuthorName      string          `json:"author_name"`
	Tags            json.RawMessage `json:"tags"`
	Status          string          `json:"status"`
	Featured        bool            `json:"featured"`
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
	Category        *string         `json:"category"`
	AuthorName      *string         `json:"author_name"`
	Tags            json.RawMessage `json:"tags"`
	Status          *string         `json:"status"`
	Featured        *bool           `json:"featured"`
	ReadingTimeMin  *int            `json:"reading_time_min"`
	SEOTitle        *string         `json:"seo_title"`
	SEODescription  *string         `json:"seo_description"`
}

// -------- Admin endpoints (JWT + role=admin) --------

// GET /api/v1/admin/platform-articles?q=&category=&status=
func (h *Handler) AdminList(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	category := strings.TrimSpace(c.Query("category"))
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "draft" && status != "published" {
		return httpx.BadRequest(c, "invalid status filter")
	}
	items, total, err := h.repo.ListPage(c.Context(), p.LikePattern(), category, status, p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// POST /api/v1/admin/platform-articles
func (h *Handler) AdminCreate(c *fiber.Ctx) error {
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Title = strings.TrimSpace(req.Title)
	req.Category = strings.ToLower(strings.TrimSpace(req.Category))
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug invalid")
	}
	if req.Title == "" {
		return httpx.BadRequest(c, "title required")
	}
	if req.Category != "" && !IsValidCategory(req.Category) {
		return httpx.BadRequest(c, "invalid category")
	}
	if req.Status != "" && req.Status != "draft" && req.Status != "published" {
		return httpx.BadRequest(c, "invalid status")
	}
	a, err := h.repo.Create(c.Context(), CreateInput{
		Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt, BodyMD: req.BodyMD,
		CoverImageURL: req.CoverImageURL, Category: req.Category, AuthorName: req.AuthorName,
		Tags: req.Tags, Status: req.Status, Featured: req.Featured,
		ReadingTimeMin: req.ReadingTimeMin, SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, a)
}

// GET /api/v1/admin/platform-articles/:id
func (h *Handler) AdminGet(c *fiber.Ctx) error {
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
	return httpx.OK(c, a)
}

// PATCH /api/v1/admin/platform-articles/:id
func (h *Handler) AdminUpdate(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
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
	if req.Category != nil && *req.Category != "" && !IsValidCategory(*req.Category) {
		return httpx.BadRequest(c, "invalid category")
	}
	if req.Status != nil && *req.Status != "draft" && *req.Status != "published" {
		return httpx.BadRequest(c, "invalid status")
	}
	a, err := h.repo.Update(c.Context(), id, UpdateInput{
		Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt, BodyMD: req.BodyMD,
		CoverImageURL: req.CoverImageURL, Category: req.Category, AuthorName: req.AuthorName,
		Tags: req.Tags, Status: req.Status, Featured: req.Featured,
		ReadingTimeMin: req.ReadingTimeMin, SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used")
	}
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, a)
}

// POST /api/v1/admin/platform-articles/:id/publish
func (h *Handler) AdminPublish(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	st := "published"
	a, err := h.repo.Update(c.Context(), id, UpdateInput{Status: &st})
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "publish failed")
	}
	return httpx.OK(c, a)
}

// DELETE /api/v1/admin/platform-articles/:id
func (h *Handler) AdminDelete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "article not found")
		}
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// -------- Public endpoints (no auth) --------

// GET /public/platform-articles?category=&limit=
func (h *Handler) PublicList(c *fiber.Ctx) error {
	category := strings.TrimSpace(c.Query("category"))
	limit := 20
	if l := c.QueryInt("limit", 20); l > 0 && l <= 100 {
		limit = l
	}
	items, err := h.repo.ListPublic(c.Context(), category, limit)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}

// GET /public/platform-articles/:slug
func (h *Handler) PublicGetBySlug(c *fiber.Ctx) error {
	slug := strings.TrimSpace(c.Params("slug"))
	a, err := h.repo.GetBySlug(c.Context(), slug)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if a.Status != "published" {
		return httpx.NotFound(c, "article not found")
	}
	// Fire-and-forget view increment. Tidak dedupe untuk MVP.
	_ = h.repo.IncrementView(c.Context(), a.ID)
	return httpx.OK(c, a)
}
