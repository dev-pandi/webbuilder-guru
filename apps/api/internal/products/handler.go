package products

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
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Price       int64           `json:"price"`
	Currency    string          `json:"currency"`
	Stock       *int            `json:"stock"`
	ImageURL    string          `json:"image_url"`
	Gallery     json.RawMessage `json:"gallery"`
	Category    string          `json:"category"`
	Status      string          `json:"status"`
	Metadata    json.RawMessage `json:"metadata"`
}

type updateReq struct {
	Slug        *string         `json:"slug"`
	Name        *string         `json:"name"`
	Description *string         `json:"description"`
	Price       *int64          `json:"price"`
	Currency    *string         `json:"currency"`
	Stock       *int            `json:"stock"`
	ClearStock  bool            `json:"clear_stock"`
	ImageURL    *string         `json:"image_url"`
	Gallery     json.RawMessage `json:"gallery"`
	Category    *string         `json:"category"`
	Status      *string         `json:"status"`
	Metadata    json.RawMessage `json:"metadata"`
}

func validStatus(s string) bool {
	return s == "" || s == "active" || s == "draft" || s == "archived"
}

// GET /api/v1/sites/:id/products
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
	status := c.Query("status")
	if !validStatus(status) {
		return httpx.BadRequest(c, "invalid status filter")
	}
	items, total, err := h.repo.ListPage(c.Context(), siteID, p.LikePattern(), status, p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// POST /api/v1/sites/:id/products
func (h *Handler) Create(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	site, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c))
	if err != nil {
		return httpx.NotFound(c, "site not found")
	}
	// Quota
	if site.QuotaMaxProducts > 0 {
		count, err := h.repo.CountBySite(c.Context(), siteID)
		if err != nil {
			return httpx.Internal(c, "quota check failed")
		}
		if count >= site.QuotaMaxProducts {
			return httpx.Forbidden(c, "product quota reached")
		}
	}
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Name = strings.TrimSpace(req.Name)
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug invalid (a-z, 0-9, hyphen)")
	}
	if req.Name == "" {
		return httpx.BadRequest(c, "name required")
	}
	if req.Price < 0 {
		return httpx.BadRequest(c, "price must be >= 0")
	}
	if !validStatus(req.Status) {
		return httpx.BadRequest(c, "invalid status")
	}
	p, err := h.repo.Create(c.Context(), siteID, CreateInput{
		Slug: req.Slug, Name: req.Name, Description: req.Description,
		Price: req.Price, Currency: req.Currency, Stock: req.Stock,
		ImageURL: req.ImageURL, Gallery: req.Gallery, Category: req.Category,
		Status: req.Status, Metadata: req.Metadata,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used in this site")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, p)
}

// GET /api/v1/products/:id
func (h *Handler) Get(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	p, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "product not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), p.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "product not found")
	}
	return httpx.OK(c, p)
}

// PATCH /api/v1/products/:id
func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "product not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "product not found")
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
	if req.Status != nil && !validStatus(*req.Status) {
		return httpx.BadRequest(c, "invalid status")
	}
	if req.Price != nil && *req.Price < 0 {
		return httpx.BadRequest(c, "price must be >= 0")
	}
	p, err := h.repo.Update(c.Context(), id, UpdateInput{
		Slug: req.Slug, Name: req.Name, Description: req.Description,
		Price: req.Price, Currency: req.Currency, Stock: req.Stock, ClearStock: req.ClearStock,
		ImageURL: req.ImageURL, Gallery: req.Gallery, Category: req.Category,
		Status: req.Status, Metadata: req.Metadata,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used")
	}
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "product not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, p)
}

// DELETE /api/v1/products/:id
func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "product not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "product not found")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}
