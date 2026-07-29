package admin

import (
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// resellerListItem — payload slim untuk admin panel list. Beda dari user
// biasa: tampilkan reseller_display_name + status + timeline. Password hash
// dsb TIDAK di-return (admin tidak perlu itu).
type resellerListItem struct {
	ID                  string  `json:"id"`
	Email               string  `json:"email"`
	Name                string  `json:"name"`
	ResellerDisplayName string  `json:"reseller_display_name"`
	ResellerStatus      string  `json:"reseller_status"`
	ResellerTier        string  `json:"reseller_tier"`
	PhoneNumber         string  `json:"phone_number"`
	City                string  `json:"city"`
	CreatedAt           string  `json:"created_at"`
	EmailVerifiedAt     *string `json:"email_verified_at,omitempty"`
}

func toResellerListItem(u *auth.User) resellerListItem {
	item := resellerListItem{
		ID:                  u.ID.String(),
		Email:               u.Email,
		Name:                u.Name,
		ResellerDisplayName: u.ResellerDisplayName,
		ResellerStatus:      u.ResellerStatus,
		ResellerTier:        u.ResellerTier,
		PhoneNumber:         u.PhoneNumber,
		City:                u.City,
		CreatedAt:           u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if u.EmailVerifiedAt != nil {
		s := u.EmailVerifiedAt.Format("2006-01-02T15:04:05Z07:00")
		item.EmailVerifiedAt = &s
	}
	return item
}

// ListResellers — GET /api/v1/admin/resellers?status=&search=&page=&page_size=
//
// Admin panel table. Sort default: pending dulu (perlu action), lalu active
// (terbaru dulu), lalu suspended terakhir.
func (h *Handler) ListResellers(c *fiber.Ctx) error {
	if h.authRepo == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "reseller_disabled",
			"Reseller feature belum di-wire (missing authRepo).")
	}
	status := strings.TrimSpace(c.Query("status"))
	// Validate status enum
	switch status {
	case "", auth.ResellerStatusPending, auth.ResellerStatusActive, auth.ResellerStatusSuspended:
	default:
		return httpx.BadRequest(c, "invalid status filter")
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	items, total, err := h.authRepo.ListResellers(c.Context(), auth.ResellerListFilter{
		Status: status,
		Search: c.Query("search"),
		Limit:  pageSize,
		Offset: (page - 1) * pageSize,
	})
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	out := make([]resellerListItem, 0, len(items))
	for i := range items {
		out = append(out, toResellerListItem(&items[i]))
	}
	return httpx.OK(c, httpx.MakePaginated(out, httpx.Pagination{Page: page, PageSize: pageSize}, total))
}

// GetReseller — GET /api/v1/admin/resellers/:id
// Return detail 1 reseller (semua field basic + status).
func (h *Handler) GetReseller(c *fiber.Ctx) error {
	if h.authRepo == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "reseller_disabled",
			"Reseller feature belum di-wire.")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	u, err := h.authRepo.GetResellerByID(c.Context(), id)
	if errors.Is(err, auth.ErrNotFound) {
		return httpx.NotFound(c, "reseller tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}
	return httpx.OK(c, toResellerListItem(u))
}

// ApproveReseller — POST /api/v1/admin/resellers/:id/approve
// Flip status ke 'active'. Auto verify email juga (via SetResellerStatus).
func (h *Handler) ApproveReseller(c *fiber.Ctx) error {
	return h.setResellerStatus(c, auth.ResellerStatusActive)
}

// SuspendReseller — POST /api/v1/admin/resellers/:id/suspend
// Flip status ke 'suspended'. Existing session tidak auto-revoke (defer ke
// operator kalau butuh urgent). Login berikutnya akan blocked (via
// AllowLoginForRole).
func (h *Handler) SuspendReseller(c *fiber.Ctx) error {
	return h.setResellerStatus(c, auth.ResellerStatusSuspended)
}

func (h *Handler) setResellerStatus(c *fiber.Ctx, status string) error {
	if h.authRepo == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "reseller_disabled",
			"Reseller feature belum di-wire.")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	u, err := h.authRepo.SetResellerStatus(c.Context(), id, status)
	if errors.Is(err, auth.ErrNotFound) {
		return httpx.NotFound(c, "reseller tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "status update failed")
	}
	// TODO Phase 2+: kirim email notification ke reseller (approved/suspended)
	return httpx.OK(c, toResellerListItem(u))
}
