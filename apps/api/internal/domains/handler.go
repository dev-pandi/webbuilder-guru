package domains

import (
	"errors"
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

	// platformIPs is the IPv4 allowlist the user's custom-domain DNS A record
	// must resolve to. Empty list = dev mode (any A record passes — INSECURE).
	platformIPs []string
}

func NewHandler(repo *Repo, s *sites.Repo, platformIPs []string) *Handler {
	return &Handler{repo: repo, sites: s, platformIPs: platformIPs}
}

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
	// 1. DNS A record must exist.
	ips, err := ResolveA(c.Context(), d.Hostname)
	if err != nil || len(ips) == 0 {
		_ = h.repo.MarkFailed(c.Context(), id)
		return httpx.BadRequest(c, "DNS A record not found for "+d.Hostname+
			". Pastikan domain Anda diarahkan ke IP server platform.")
	}

	// 2. If platform IP allowlist is configured, at least one resolved IP
	//    must match. Without this, anyone could "claim" a domain that
	//    resolves to ANY IP (e.g. Google's), enabling Caddy to issue certs
	//    for hostnames they don't control.
	//
	//    Empty allowlist = dev mode. Production must always set PLATFORM_IPS
	//    (enforced by config.Validate).
	if len(h.platformIPs) > 0 {
		if !ipsOverlap(ips, h.platformIPs) {
			_ = h.repo.MarkFailed(c.Context(), id)
			return httpx.BadRequest(c, "DNS A record untuk "+d.Hostname+
				" tidak menunjuk ke platform kami. Resolved: "+strings.Join(ips, ", ")+
				". Pastikan arahkan A record ke salah satu: "+strings.Join(h.platformIPs, ", "))
		}
	}

	if err := h.repo.MarkVerified(c.Context(), id); err != nil {
		return httpx.Internal(c, "verify failed")
	}
	d.Status = "verified"
	return httpx.OK(c, d)
}

// ipsOverlap returns true if any IP in `got` is also in `want`.
// Both lists are compared as raw strings — DNS resolver already normalises to
// canonical IPv4 dotted form, and operators write PLATFORM_IPS the same way.
func ipsOverlap(got, want []string) bool {
	set := make(map[string]struct{}, len(want))
	for _, ip := range want {
		set[strings.TrimSpace(ip)] = struct{}{}
	}
	for _, ip := range got {
		if _, ok := set[strings.TrimSpace(ip)]; ok {
			return true
		}
	}
	return false
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
