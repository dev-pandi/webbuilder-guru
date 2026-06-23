package admin

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// ---------- Users ----------

func (h *Handler) ListUsers(c *fiber.Ctx) error {
	out, err := h.repo.ListUsers(c.Context())
	if err != nil {
		return httpx.Internal(c, "list users failed")
	}
	return httpx.OK(c, out)
}

type updateRoleReq struct {
	Role string `json:"role"`
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
	return httpx.OK(c, fiber.Map{"ok": true})
}

// ---------- Sites ----------

func (h *Handler) ListSites(c *fiber.Ctx) error {
	out, err := h.repo.ListSites(c.Context())
	if err != nil {
		return httpx.Internal(c, "list sites failed")
	}
	return httpx.OK(c, out)
}

type updateQuotaReq struct {
	QuotaMaxPages        *int   `json:"quota_max_pages"`
	QuotaMaxStorageBytes *int64 `json:"quota_max_storage_bytes"`
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
	if req.QuotaMaxPages == nil && req.QuotaMaxStorageBytes == nil {
		return httpx.BadRequest(c, "at least one quota field required")
	}
	if req.QuotaMaxPages != nil && *req.QuotaMaxPages < 1 {
		return httpx.BadRequest(c, "quota_max_pages must be >= 1")
	}
	if req.QuotaMaxStorageBytes != nil && *req.QuotaMaxStorageBytes < 1024 {
		return httpx.BadRequest(c, "quota_max_storage_bytes must be >= 1024")
	}
	if err := h.repo.UpdateSiteQuota(c.Context(), id, req.QuotaMaxPages, req.QuotaMaxStorageBytes); err != nil {
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
