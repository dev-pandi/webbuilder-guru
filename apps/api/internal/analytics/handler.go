package analytics

import (
	"encoding/json"
	"errors"
	"strconv"
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

// --- Public: record page view (no JWT, rate-limited di router) ---

type recordReq struct {
	SiteID   string `json:"site_id"`
	PageSlug string `json:"page_slug"`
}

// RecordView — POST /public/analytics/pageview
//
// Beacon call dari renderer setiap page render. Payload minimal: site_id
// + page_slug. Backend validate site exists (cegah bot spam counter ke site
// yang tidak ada). Return 202 Accepted — fire-and-forget style.
//
// Anti-spam: rate-limit per IP di router (bot yang hammer akan miss counter
// budget). Bounded page_slug length supaya tidak jadi vektor DB attack.
func (h *Handler) RecordView(c *fiber.Ctx) error {
	var req recordReq
	// Unmarshal body mentah, bukan BodyParser: renderer kirim Content-Type
	// text/plain supaya sendBeacon lolos tanpa CORS preflight, dan BodyParser
	// menolak content type yang tidak dikenal.
	if err := json.Unmarshal(c.Body(), &req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	siteID, err := uuid.Parse(strings.TrimSpace(req.SiteID))
	if err != nil {
		return httpx.BadRequest(c, "invalid site_id")
	}
	req.PageSlug = strings.TrimSpace(req.PageSlug)
	if len(req.PageSlug) > 512 {
		return httpx.BadRequest(c, "page_slug terlalu panjang")
	}
	// Cegah counter naik untuk site yang tidak ada.
	// Pakai lookup langsung by id (bukan by user) — public endpoint.
	if _, err := h.sites.GetByID(c.Context(), siteID); err != nil {
		if errors.Is(err, sites.ErrNotFound) {
			return httpx.NotFound(c, "site not found")
		}
		return httpx.Internal(c, "site lookup failed")
	}
	if err := h.repo.RecordView(c.Context(), siteID, req.PageSlug); err != nil {
		return httpx.Internal(c, "record failed")
	}
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": fiber.Map{"ok": true}})
}

// --- Authed: get summary untuk dashboard ---

// GetSummary — GET /api/v1/sites/:id/analytics?days=30
//
// Ownership scoped ke user. Default window 30 hari; max 365.
func (h *Handler) GetSummary(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c)); err != nil {
		if errors.Is(err, sites.ErrNotFound) {
			return httpx.NotFound(c, "site not found")
		}
		return httpx.Internal(c, "site lookup failed")
	}
	days, _ := strconv.Atoi(c.Query("days", "30"))
	sum, err := h.repo.GetSummary(c.Context(), siteID, days)
	if err != nil {
		return httpx.Internal(c, "summary failed")
	}
	return httpx.OK(c, sum)
}
