package banners

import (
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	repo  *Repo
	sites *sites.Repo
	audit *audit.Repo // optional — nil-safe; kalau nil skip audit log
}

func NewHandler(r *Repo, s *sites.Repo) *Handler { return &Handler{repo: r, sites: s} }

// SetAuditRepo — inject audit logger post-construction. Dipanggil di main.go
// setelah auditRepo dibangun (audit di-wire ke banyak handler).
func (h *Handler) SetAuditRepo(a *audit.Repo) { h.audit = a }

const (
	maxTitleLen  = 120
	maxAltLen    = 200
	maxURLLen    = 2000
)

type createReq struct {
	InternalTitle string  `json:"internal_title"`
	ImageURL      string  `json:"image_url"`
	TargetURL     string  `json:"target_url"`
	AltText       string  `json:"alt_text"`
	SortOrder     int     `json:"sort_order"`
	StartAt       *string `json:"start_at"` // RFC3339 or null
	EndAt         *string `json:"end_at"`
	TeacherActive *bool   `json:"teacher_active"`
}

type updateReq struct {
	InternalTitle *string `json:"internal_title"`
	ImageURL      *string `json:"image_url"`
	TargetURL     *string `json:"target_url"`
	AltText       *string `json:"alt_text"`
	SortOrder     *int    `json:"sort_order"`
	StartAt       *string `json:"start_at"`
	EndAt         *string `json:"end_at"`
	ClearStart    bool    `json:"clear_start"`
	ClearEnd      bool    `json:"clear_end"`
	TeacherActive *bool   `json:"teacher_active"`
}

func parseTime(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func validURL(s string) bool {
	if len(s) == 0 || len(s) > maxURLLen {
		return false
	}
	u, err := url.Parse(s)
	if err != nil {
		return false
	}
	return u.Scheme == "http" || u.Scheme == "https"
}

// --- Teacher endpoints ---

// GET /api/v1/sites/:id/banners
func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	items, err := h.repo.ListBySite(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	// Attach effective_status client-side hint.
	type view struct {
		Banner
		EffectiveStatus string `json:"effective_status"`
	}
	out := make([]view, 0, len(items))
	now := time.Now()
	for _, b := range items {
		out = append(out, view{Banner: b, EffectiveStatus: b.EffectiveStatus(now)})
	}
	return httpx.OK(c, out)
}

// POST /api/v1/sites/:id/banners
func (h *Handler) Create(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.InternalTitle = strings.TrimSpace(req.InternalTitle)
	req.ImageURL = strings.TrimSpace(req.ImageURL)
	req.TargetURL = strings.TrimSpace(req.TargetURL)
	req.AltText = strings.TrimSpace(req.AltText)
	if req.InternalTitle == "" || len(req.InternalTitle) > maxTitleLen {
		return httpx.BadRequest(c, "internal_title required (max 120)")
	}
	if !validURL(req.ImageURL) {
		return httpx.BadRequest(c, "image_url must be http(s)")
	}
	if !validURL(req.TargetURL) {
		return httpx.BadRequest(c, "target_url must be http(s)")
	}
	if req.AltText == "" || len(req.AltText) > maxAltLen {
		return httpx.BadRequest(c, "alt_text required (max 200)")
	}
	startAt, err := parseTime(strDef(req.StartAt))
	if err != nil {
		return httpx.BadRequest(c, "start_at must be RFC3339")
	}
	endAt, err := parseTime(strDef(req.EndAt))
	if err != nil {
		return httpx.BadRequest(c, "end_at must be RFC3339")
	}
	if startAt != nil && endAt != nil && endAt.Before(*startAt) {
		return httpx.BadRequest(c, "end_at must be after start_at")
	}
	active := true
	if req.TeacherActive != nil {
		active = *req.TeacherActive
	}
	b, err := h.repo.Create(c.Context(), CreateInput{
		SiteID: siteID, OwnerUserID: uid,
		InternalTitle: req.InternalTitle, ImageURL: req.ImageURL, TargetURL: req.TargetURL,
		AltText: req.AltText, SortOrder: req.SortOrder,
		StartAt: startAt, EndAt: endAt, TeacherActive: active,
	})
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, b)
}

func strDef(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// PATCH /api/v1/banners/:id — teacher update. Cannot touch admin_enabled.
func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "banner not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "banner not found")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.InternalTitle != nil {
		s := strings.TrimSpace(*req.InternalTitle)
		if s == "" || len(s) > maxTitleLen {
			return httpx.BadRequest(c, "internal_title invalid")
		}
		req.InternalTitle = &s
	}
	if req.ImageURL != nil && !validURL(*req.ImageURL) {
		return httpx.BadRequest(c, "image_url invalid")
	}
	if req.TargetURL != nil && !validURL(*req.TargetURL) {
		return httpx.BadRequest(c, "target_url invalid")
	}
	if req.AltText != nil {
		s := strings.TrimSpace(*req.AltText)
		if s == "" || len(s) > maxAltLen {
			return httpx.BadRequest(c, "alt_text invalid")
		}
		req.AltText = &s
	}
	var startAt, endAt *time.Time
	if !req.ClearStart && req.StartAt != nil {
		t, err := parseTime(*req.StartAt)
		if err != nil {
			return httpx.BadRequest(c, "start_at must be RFC3339")
		}
		startAt = t
	}
	if !req.ClearEnd && req.EndAt != nil {
		t, err := parseTime(*req.EndAt)
		if err != nil {
			return httpx.BadRequest(c, "end_at must be RFC3339")
		}
		endAt = t
	}
	b, err := h.repo.Update(c.Context(), id, UpdateInput{
		InternalTitle: req.InternalTitle, ImageURL: req.ImageURL, TargetURL: req.TargetURL,
		AltText: req.AltText, SortOrder: req.SortOrder,
		StartAt: startAt, EndAt: endAt,
		ClearStart: req.ClearStart, ClearEnd: req.ClearEnd,
		TeacherActive: req.TeacherActive,
	})
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "banner not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, b)
}

// DELETE /api/v1/banners/:id
func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "banner not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwned(c.Context(), existing.SiteID, uid); err != nil {
		return httpx.NotFound(c, "banner not found")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// --- Admin endpoints ---

// GET /api/v1/admin/banners?status=admin_enabled|admin_disabled&page=&page_size=
func (h *Handler) AdminList(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	status := strings.TrimSpace(c.Query("status"))
	items, total, err := h.repo.AdminListPage(c.Context(), status, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	// Attach effective_status for admin UI.
	type view struct {
		AdminView
		EffectiveStatus string `json:"effective_status"`
	}
	now := time.Now()
	out := make([]view, 0, len(items))
	for _, av := range items {
		out = append(out, view{AdminView: av, EffectiveStatus: av.EffectiveStatus(now)})
	}
	return httpx.OK(c, httpx.MakePaginated(out, p, total))
}

type adminSetReq struct {
	Enabled bool   `json:"enabled"`
	Reason  string `json:"reason"`
}

// POST /api/v1/admin/banners/:id/enable and /disable
func (h *Handler) AdminSetEnabled(c *fiber.Ctx) error {
	adminID := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req adminSetReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if !req.Enabled && len(req.Reason) > 500 {
		return httpx.BadRequest(c, "reason too long (max 500)")
	}
	b, err := h.repo.SetAdminEnabled(c.Context(), id, req.Enabled, adminID, req.Reason)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "banner not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	// Audit trail — spec §27 disarankan simpan admin + waktu + alasan.
	// Fire-and-forget: kegagalan audit tidak block moderation response.
	if h.audit != nil {
		event := audit.EventAdminBannerEnabled
		if !req.Enabled {
			event = audit.EventAdminBannerDisabled
		}
		_ = h.audit.Log(c.Context(), audit.Params{
			ActorID:    &adminID,
			Event:      event,
			TargetType: "banner",
			TargetID:   id.String(),
			Metadata: map[string]any{
				"site_id":        b.SiteID.String(),
				"owner_user_id":  b.OwnerUserID.String(),
				"internal_title": b.InternalTitle,
				"reason":         req.Reason,
			},
			IP:        c.IP(),
			UserAgent: c.Get("User-Agent"),
		})
	}
	return httpx.OK(c, b)
}

// PublicListBySite — GET /public/sites/:id/promotion-banners
// Returns eligible banners only.
func (h *Handler) PublicListBySite(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	items, err := h.repo.ListEligibleBySite(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}

// PublicListForPortal — GET /public/portal/promotion-banners?limit=30
func (h *Handler) PublicListForPortal(c *fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "30"))
	items, err := h.repo.ListEligibleForPortal(c.Context(), limit)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}
