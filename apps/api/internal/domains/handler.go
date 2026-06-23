package domains

import (
	"errors"

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

func NewHandler(repo *Repo, s *sites.Repo) *Handler { return &Handler{repo: repo, sites: s} }

type addReq struct {
	Hostname string `json:"hostname"`
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
	out, err := h.repo.ListBySite(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, out)
}

func (h *Handler) Add(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	var req addReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	host := NormalizeHost(req.Hostname)
	if !ValidHost(host) {
		return httpx.BadRequest(c, "invalid hostname")
	}
	d, err := h.repo.Create(c.Context(), siteID, host)
	if errors.Is(err, ErrTaken) {
		return httpx.Conflict(c, "hostname already claimed")
	}
	if errors.Is(err, ErrLimit) {
		return httpx.Forbidden(c, "domain limit reached")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, d)
}

func (h *Handler) Verify(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	d, err := h.repo.GetByID(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "domain not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), d.SiteID, uid); err != nil {
		return httpx.NotFound(c, "domain not found")
	}
	// Best-effort DNS check: just ensure hostname resolves to at least one A record.
	// In production this should compare to the platform's IP allowlist.
	ips, err := ResolveA(c.Context(), d.Hostname)
	if err != nil || len(ips) == 0 {
		_ = h.repo.MarkFailed(c.Context(), id)
		return httpx.BadRequest(c, "DNS A record not found for "+d.Hostname)
	}
	if err := h.repo.MarkVerified(c.Context(), id); err != nil {
		return httpx.Internal(c, "verify failed")
	}
	d.Status = "verified"
	return httpx.OK(c, d)
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	d, err := h.repo.GetByID(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "domain not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), d.SiteID, uid); err != nil {
		return httpx.NotFound(c, "domain not found")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}
