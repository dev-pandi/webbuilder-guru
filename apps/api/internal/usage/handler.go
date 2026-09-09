package usage

import (
	"strconv"

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

// GET /api/v1/sites/:id/usage
// Computes live usage, persists a snapshot, prunes old, returns the snapshot.
func (h *Handler) Current(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	site, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c))
	if err != nil {
		return httpx.NotFound(c, "site not found")
	}
	u, err := h.repo.Compute(c.Context(), site)
	if err != nil {
		return httpx.Internal(c, "compute failed")
	}
	// Best-effort snapshot — failures here don't break the response.
	_ = h.repo.SaveSnapshot(c.Context(), u)
	_ = h.repo.PruneOldSnapshots(c.Context(), siteID, 100)
	return httpx.OK(c, u)
}

// GET /api/v1/sites/:id/usage/history?limit=30
func (h *Handler) History(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "30"))
	rows, err := h.repo.ListSnapshots(c.Context(), siteID, limit)
	if err != nil {
		return httpx.Internal(c, "history failed")
	}
	return httpx.OK(c, rows)
}
