package admin

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/reseller"
	"github.com/webbuilder/api/internal/templates"
)

type Handler struct {
	repo      *Repo
	authRepo  *auth.Repo             // dipakai reseller management (list/approve/suspend)
	audit     *audit.Repo            // nil = audit disabled (silent no-op)
	reseller  *reseller.Repo         // nil = detail counts kosong
	purchases *domain_purchase.Repo  // nil = domain tab kosong
	templates *templates.Repo        // nil = template CRUD 503
	storage   assets.Storage         // nil = admin upload endpoint 503
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// SetAuthRepo inject auth repo untuk reseller management. Optional — kalau
// nil, endpoint reseller-management return 503 (feature disabled). Simplifies
// backward-compat + gradual rollout Phase 1.
func (h *Handler) SetAuthRepo(r *auth.Repo) { h.authRepo = r }

// SetAudit inject audit repo untuk record admin actions (Phase 7). Nil = no-op.
func (h *Handler) SetAudit(r *audit.Repo) { h.audit = r }

// SetReseller inject reseller repo untuk detail-page endpoints. Nil-safe.
func (h *Handler) SetReseller(r *reseller.Repo) { h.reseller = r }

// SetPurchases inject domain purchase repo untuk domain tab di detail page.
func (h *Handler) SetPurchases(p *domain_purchase.Repo) { h.purchases = p }

// SetStorage inject asset storage untuk admin-scoped uploads (template
// thumbnail dsb). Nil-safe.
func (h *Handler) SetStorage(s assets.Storage) { h.storage = s }

// logAudit — helper fire-and-forget. Kalau audit nil, no-op. Kalau gagal
// insert, sudah di-warn di repo.Log — kita tidak block admin action.
func (h *Handler) logAudit(ctx context.Context, actor uuid.UUID, event, targetType, targetID string, meta map[string]any) {
	if h.audit == nil {
		return
	}
	var actorID *uuid.UUID
	if actor != uuid.Nil {
		actorID = &actor
	}
	_ = h.audit.Log(ctx, audit.Params{
		ActorID:    actorID,
		Event:      event,
		TargetType: targetType,
		TargetID:   targetID,
		Metadata:   meta,
	})
}

// ---------- Users ----------

func (h *Handler) ListUsers(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	items, total, err := h.repo.ListUsersPage(c.Context(), p.LikePattern(), p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list users failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

type updateRoleReq struct {
	Role string `json:"role"`
}

// GetUser — GET /api/v1/admin/users/:id
// Full user detail + counts. Password hash + oauth sub NOT returned.
func (h *Handler) GetUser(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	u, err := h.repo.GetUserDetail(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "user tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}
	return httpx.OK(c, u)
}

// ListUserSites — GET /api/v1/admin/users/:id/sites
// Daftar situs yang di-own user tsb. Untuk tab "Situs" di detail page.
func (h *Handler) ListUserSites(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	items, err := h.repo.ListUserSites(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, items)
}

func (h *Handler) UpdateUserRole(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req updateRoleReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Role != "user" && req.Role != "admin" {
		return httpx.BadRequest(c, "role must be 'user' or 'admin'")
	}
	if err := h.repo.UpdateUserRole(c.Context(), id, req.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "user not found")
		}
		return httpx.Internal(c, "update role failed")
	}
	evt := audit.EventAdminUserPromoted
	if req.Role != "admin" {
		evt = audit.EventAdminUserDemoted
	}
	h.logAudit(c.Context(), auth.UserIDFrom(c), evt, "user", id.String(), map[string]any{
		"new_role": req.Role,
	})
	return httpx.OK(c, fiber.Map{"ok": true})
}

func (h *Handler) DeleteUser(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	// Don't allow deleting yourself.
	if cl := auth.ClaimsFrom(c); cl != nil && cl.UserID == id {
		return httpx.BadRequest(c, "cannot delete yourself")
	}
	if err := h.repo.DeleteUser(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "user not found")
		}
		return httpx.Internal(c, "delete failed")
	}
	h.logAudit(c.Context(), auth.UserIDFrom(c), audit.EventAdminUserDeleted, "user", id.String(), nil)
	return httpx.OK(c, fiber.Map{"ok": true})
}

// ---------- Sites ----------

func (h *Handler) ListSites(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	items, total, err := h.repo.ListSitesPage(c.Context(), p.LikePattern(), p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list sites failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

type updateQuotaReq struct {
	QuotaMaxPages        *int   `json:"quota_max_pages"`
	QuotaMaxStorageBytes *int64 `json:"quota_max_storage_bytes"`
	QuotaMaxProducts     *int   `json:"quota_max_products"`
	QuotaMaxBlogPosts    *int   `json:"quota_max_blog_posts"`
}

func (h *Handler) UpdateSiteQuota(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req updateQuotaReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.QuotaMaxPages == nil && req.QuotaMaxStorageBytes == nil &&
		req.QuotaMaxProducts == nil && req.QuotaMaxBlogPosts == nil {
		return httpx.BadRequest(c, "at least one quota field required")
	}
	if req.QuotaMaxPages != nil && *req.QuotaMaxPages < 1 {
		return httpx.BadRequest(c, "quota_max_pages must be >= 1")
	}
	if req.QuotaMaxStorageBytes != nil && *req.QuotaMaxStorageBytes < 1024 {
		return httpx.BadRequest(c, "quota_max_storage_bytes must be >= 1024")
	}
	if req.QuotaMaxProducts != nil && *req.QuotaMaxProducts < 0 {
		return httpx.BadRequest(c, "quota_max_products must be >= 0")
	}
	if req.QuotaMaxBlogPosts != nil && *req.QuotaMaxBlogPosts < 0 {
		return httpx.BadRequest(c, "quota_max_blog_posts must be >= 0")
	}
	if err := h.repo.UpdateSiteQuota(c.Context(), id,
		req.QuotaMaxPages, req.QuotaMaxStorageBytes,
		req.QuotaMaxProducts, req.QuotaMaxBlogPosts,
	); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "site not found")
		}
		return httpx.Internal(c, "update quota failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

func (h *Handler) DeleteSite(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.DeleteSite(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "site not found")
		}
		return httpx.Internal(c, "delete failed")
	}
	h.logAudit(c.Context(), auth.UserIDFrom(c), audit.EventAdminSiteDeleted, "site", id.String(), nil)
	return httpx.OK(c, fiber.Map{"ok": true})
}

// ---------- Stats ----------

func (h *Handler) Stats(c *fiber.Ctx) error {
	s, err := h.repo.PlatformStats(c.Context())
	if err != nil {
		return httpx.Internal(c, "stats failed")
	}
	return httpx.OK(c, s)
}
