package admin

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/mail"
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

// resellerDetail — payload lengkap untuk admin panel detail page.
// Extends resellerListItem dengan profil lengkap + counts agregat + timeline.
// Password hash tetap TIDAK di-return.
type resellerDetail struct {
	resellerListItem
	Address    string  `json:"address,omitempty"`
	State      string  `json:"state,omitempty"`
	PostalCode string  `json:"postal_code,omitempty"`
	Nik        string  `json:"nik,omitempty"`
	// Counts agregat — dipakai stat tile di detail page.
	Counts *resellerDetailCounts `json:"counts,omitempty"`
}

type resellerDetailCounts struct {
	Clients        int64 `json:"clients"`
	Agents         int64 `json:"agents"`
	ActiveDomains  int64 `json:"active_domains"`
	PendingDomains int64 `json:"pending_domains"`
}

// GetReseller — GET /api/v1/admin/resellers/:id
// Return detail lengkap 1 reseller + count agregat (klien, agent, domain).
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
	// Base slim payload + profile fields.
	detail := resellerDetail{
		resellerListItem: toResellerListItem(u),
		Address:          u.Address,
		State:            u.State,
		PostalCode:       u.PostalCode,
		Nik:              u.Nik,
	}
	// Counts — best-effort. Kalau salah satu fail, tetap return partial data
	// supaya admin bisa lihat identitas dulu (counts optional untuk decision).
	if h.reseller != nil && h.purchases != nil {
		var counts resellerDetailCounts
		if n, err := h.reseller.CountClientsForReseller(c.Context(), id); err == nil {
			counts.Clients = n
		}
		if n, err := h.reseller.CountAgentsForReseller(c.Context(), id); err == nil {
			counts.Agents = n
		}
		if actors, err := h.reseller.ListActorIDs(c.Context(), id); err == nil && len(actors) > 0 {
			if stats, err := h.purchases.GetResellerStats(c.Context(), actors); err == nil && stats != nil {
				counts.ActiveDomains = stats.ActiveDomains
				counts.PendingDomains = stats.PendingJobs
			}
		}
		detail.Counts = &counts
	}
	return httpx.OK(c, detail)
}

// ListResellerClients — GET /api/v1/admin/resellers/:id/clients
// Client yang di-manage reseller tsb atau agent-agent di bawahnya.
func (h *Handler) ListResellerClients(c *fiber.Ctx) error {
	if h.reseller == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "reseller_disabled",
			"Reseller feature belum di-wire.")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	rows, err := h.reseller.ListClientsForReseller(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, rows)
}

// ListResellerAgents — GET /api/v1/admin/resellers/:id/agents
func (h *Handler) ListResellerAgents(c *fiber.Ctx) error {
	if h.reseller == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "reseller_disabled",
			"Reseller feature belum di-wire.")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	rows, err := h.reseller.ListAgentsByReseller(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, rows)
}

// ListResellerDomains — GET /api/v1/admin/resellers/:id/domains
// Semua purchase yang di-trigger oleh reseller ini atau agent-nya (portfolio).
func (h *Handler) ListResellerDomains(c *fiber.Ctx) error {
	if h.reseller == nil || h.purchases == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "reseller_disabled",
			"Feature belum di-wire.")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	actors, err := h.reseller.ListActorIDs(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "actor lookup failed")
	}
	rows, err := h.purchases.ListByPurchasers(c.Context(), actors, 500)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	// Purchase struct belum punya JSON tag; marshal default pakai PascalCase
	// yang tidak match frontend contract. Transform ke tagged local struct
	// (pattern sama dengan domain_purchase handler.AdminListPurchases).
	type row struct {
		ID          string  `json:"id"`
		Domain      string  `json:"domain"`
		UserID      string  `json:"user_id"`
		PurchasedBy *string `json:"purchased_by,omitempty"`
		Kind        string  `json:"kind"`
		Status      string  `json:"status"`
		Years       int     `json:"years"`
		ExpiresAt   *string `json:"expires_at,omitempty"`
		CreatedAt   string  `json:"created_at"`
	}
	out := make([]row, 0, len(rows))
	for i := range rows {
		it := &rows[i]
		r := row{
			ID:        it.ID.String(),
			Domain:    it.Domain,
			UserID:    it.UserID.String(),
			Kind:      it.Kind,
			Status:    it.Status,
			Years:     it.Years,
			CreatedAt: it.CreatedAt.UTC().Format(time.RFC3339),
		}
		if it.PurchasedBy != nil {
			s := it.PurchasedBy.String()
			r.PurchasedBy = &s
		}
		if it.ExpiresAt != nil {
			s := it.ExpiresAt.UTC().Format(time.RFC3339)
			r.ExpiresAt = &s
		}
		out = append(out, r)
	}
	return httpx.OK(c, out)
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
	// Audit: capture admin action (approve / suspend). Actor = current admin.
	evt := audit.EventResellerApproved
	if status == auth.ResellerStatusSuspended {
		evt = audit.EventResellerSuspended
	}
	h.logAudit(c.Context(), auth.UserIDFrom(c), evt, "user", u.ID.String(), map[string]any{
		"email":         u.Email,
		"display_name":  u.ResellerDisplayName,
		"status_before": status, // status target adalah status akhir
	})
	// Fire notif email (fire-and-forget goroutine — status update tidak boleh
	// gagal karena SMTP lambat/down). Kalau mailer nil, skip diam-diam.
	if h.mailer != nil {
		go sendResellerStatusEmail(h.mailer, u.Email, u.Name, u.ResellerDisplayName, status)
	}
	return httpx.OK(c, toResellerListItem(u))
}

// sendResellerStatusEmail — kirim notif approved/suspended ke reseller.
// Non-blocking (dipanggil di goroutine) supaya SMTP latency tidak block
// response admin. Timeout 10s dari context baru.
func sendResellerStatusEmail(m mail.Sender, email, name, businessName, status string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var subject, body string
	if status == auth.ResellerStatusActive {
		subject = "Akun Reseller Web Builder Aktif ✓"
		body = "Halo " + displayName(name, email) + ",\n\n" +
			"Kabar baik! Aplikasi reseller Anda sudah di-approve oleh tim kami.\n" +
			"Nama bisnis: " + businessName + "\n\n" +
			"Silakan login untuk mulai:\n" +
			"  - Undang agent ke tim Anda\n" +
			"  - Daftarkan klien + beli domain atas nama mereka\n" +
			"  - Kelola pricing per-TLD di dashboard reseller\n\n" +
			"Best regards,\nTim Web Builder"
	} else if status == auth.ResellerStatusSuspended {
		subject = "Akun Reseller Anda Di-suspend"
		body = "Halo " + displayName(name, email) + ",\n\n" +
			"Kami menghentikan sementara akun reseller Anda untuk sementara.\n" +
			"Nama bisnis: " + businessName + "\n\n" +
			"Login berikutnya akan diblokir. Klien + situs Anda tetap ada,\n" +
			"tapi tidak bisa dikelola dari akun ini sampai admin re-approve.\n\n" +
			"Kalau Anda merasa ini kesalahan, hubungi support kami untuk klarifikasi.\n\n" +
			"Best regards,\nTim Web Builder"
	} else {
		return // status lain (mis. pending_approval) — tidak notify.
	}

	if err := m.Send(ctx, mail.Message{
		To:      email,
		Subject: subject,
		Body:    body,
	}); err != nil {
		slog.Warn("reseller status email failed", "email", email, "status", status, "err", err)
	}
}

// displayName — pakai Name kalau non-empty, fallback ke email.
func displayName(name, email string) string {
	if strings.TrimSpace(name) != "" {
		return name
	}
	return email
}
