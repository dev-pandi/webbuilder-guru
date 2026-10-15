package learning

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
	Slug           string          `json:"slug"`
	Title          string          `json:"title"`
	Excerpt        string          `json:"excerpt"`
	BodyMD         string          `json:"body_md"`
	CoverImageURL  string          `json:"cover_image_url"`
	Tags           json.RawMessage `json:"tags"`
	Summary        string          `json:"summary"`
	Status         string          `json:"status"`
	SEOTitle       string          `json:"seo_title"`
	SEODescription string          `json:"seo_description"`
	ParentID       *string         `json:"parent_id"` // "" / null = top-level
	SortOrder      int             `json:"sort_order"`
	Emoji          string          `json:"emoji"`
}

// updateReq — pointer field = "disetel kalau non-nil".
// ParentID pakai raw json.RawMessage supaya kita bisa bedakan "field tidak
// dikirim" (ParentIDRaw == nil) vs "dikirim null" (ParentIDRaw == "null")
// vs "dikirim uuid".
type updateReq struct {
	Slug           *string         `json:"slug"`
	Title          *string         `json:"title"`
	Excerpt        *string         `json:"excerpt"`
	BodyMD         *string         `json:"body_md"`
	CoverImageURL  *string         `json:"cover_image_url"`
	Tags           json.RawMessage `json:"tags"`
	Summary        *string         `json:"summary"`
	Status         *string         `json:"status"`
	SEOTitle       *string         `json:"seo_title"`
	SEODescription *string         `json:"seo_description"`
	ParentIDRaw    json.RawMessage `json:"parent_id"`
	SortOrder      *int            `json:"sort_order"`
	Emoji          *string         `json:"emoji"`
}

// parseParentID — convert "" / "null" / null → (nil, true=set). UUID valid →
// (&uuid, true). Field tidak ada → (nil, false). Error kalau string tidak
// valid UUID.
func parseParentID(raw json.RawMessage) (*uuid.UUID, bool, error) {
	if len(raw) == 0 {
		return nil, false, nil
	}
	s := strings.TrimSpace(string(raw))
	if s == "null" || s == `""` {
		return nil, true, nil
	}
	// Expect JSON string "uuid".
	var str string
	if err := json.Unmarshal(raw, &str); err != nil {
		return nil, false, err
	}
	str = strings.TrimSpace(str)
	if str == "" {
		return nil, true, nil
	}
	id, err := uuid.Parse(str)
	if err != nil {
		return nil, false, err
	}
	return &id, true, nil
}

func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	p := httpx.ParsePagination(c)
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "draft" && status != "published" {
		return httpx.BadRequest(c, "invalid status")
	}
	items, total, err := h.repo.ListPage(c.Context(), siteID, p.LikePattern(), status, p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

func (h *Handler) Create(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Title = strings.TrimSpace(req.Title)
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug invalid")
	}
	if req.Title == "" {
		return httpx.BadRequest(c, "title required")
	}
	var parentID *uuid.UUID
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		pid, err := uuid.Parse(strings.TrimSpace(*req.ParentID))
		if err != nil {
			return httpx.BadRequest(c, "invalid parent_id")
		}
		parentID = &pid
	}
	m, err := h.repo.Create(c.Context(), siteID, CreateInput{
		Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt, BodyMD: req.BodyMD,
		CoverImageURL: req.CoverImageURL, Tags: req.Tags, Summary: req.Summary,
		Status: req.Status, SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
		ParentID: parentID, SortOrder: req.SortOrder, Emoji: req.Emoji,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used")
	}
	if errors.Is(err, ErrInvalidParent) {
		return httpx.BadRequest(c, "parent harus materi top-level yang sama site")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, m)
}

func (h *Handler) Get(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	m, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), m.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "material not found")
	}
	return httpx.OK(c, m)
}

func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "material not found")
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
	parentID, parentSet, err := parseParentID(req.ParentIDRaw)
	if err != nil {
		return httpx.BadRequest(c, "invalid parent_id")
	}
	m, err := h.repo.Update(c.Context(), id, UpdateInput{
		Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt, BodyMD: req.BodyMD,
		CoverImageURL: req.CoverImageURL, Tags: req.Tags, Summary: req.Summary,
		Status: req.Status, SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
		ParentIDSet: parentSet, ParentID: parentID, SortOrder: req.SortOrder,
		Emoji: req.Emoji,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used")
	}
	if errors.Is(err, ErrInvalidParent) {
		return httpx.BadRequest(c, "parent harus materi top-level yang sama site")
	}
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, m)
}

func (h *Handler) Publish(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "material not found")
	}
	status := "published"
	m, err := h.repo.Update(c.Context(), id, UpdateInput{Status: &status})
	if err != nil {
		return httpx.Internal(c, "publish failed")
	}
	return httpx.OK(c, m)
}

// ListParents — GET /sites/:id/learning/parents
// Returns top-level materi (parent_id NULL) untuk editor dropdown.
func (h *Handler) ListParents(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	items, err := h.repo.ListParents(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "list parents failed")
	}
	return httpx.OK(c, items)
}

// Reorder — POST /learning/:id/reorder {direction: "up"|"down"}
// Swap sort_order dengan sibling tetangga (sesama parent). Idempotent kalau
// sudah di posisi ujung.
type reorderReq struct {
	Direction string `json:"direction"`
}

func (h *Handler) Reorder(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "material not found")
	}
	var req reorderReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Direction != "up" && req.Direction != "down" {
		return httpx.BadRequest(c, "direction harus 'up' atau 'down'")
	}
	if err := h.repo.SwapOrder(c.Context(), existing, req.Direction); err != nil {
		return httpx.Internal(c, "reorder failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "material not found")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}
