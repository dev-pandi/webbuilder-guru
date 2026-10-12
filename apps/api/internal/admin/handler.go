package admin

import (
	"context"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/mail"
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
	mailer    mail.Sender            // nil = notif email skipped
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// SetMailer inject mailer untuk notif reseller approve/suspend. Nil-safe.
func (h *Handler) SetMailer(m mail.Sender) { h.mailer = m }

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

// updateUserProfileReq — pointer fields = partial update (COALESCE di SQL).
// Mirror auth.updateMeReq tapi dengan subset yang relevant untuk admin fix
// (nama, kontak, alamat, NIK). Role + email + password NOT di sini —
// pakai endpoint khusus (role→UpdateUserRole, email/pass→reset flow).
type updateUserProfileReq struct {
	Name        *string `json:"name,omitempty"`
	PhoneNumber *string `json:"phone_number,omitempty"`
	Address     *string `json:"address,omitempty"`
	City        *string `json:"city,omitempty"`
	State       *string `json:"state,omitempty"`
	PostalCode  *string `json:"postal_code,omitempty"`
	Nik         *string `json:"nik,omitempty"`
}

// UpdateUserProfile — PATCH /api/v1/admin/users/:id/profile.
// Admin edit field kontak user untuk memperbaiki data yang bikin EPP
// contact:create gagal (mis. em-dash non-ASCII di field provinsi).
// Validasi sama dengan /auth/me PATCH — reject karakter non-ASCII di
// name/address/city/state (EPP PostalInfo type="int" wajib ASCII).
func (h *Handler) UpdateUserProfile(c *fiber.Ctx) error {
	if h.authRepo == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "auth_repo_missing",
			"Admin update user profile butuh authRepo ter-wire.")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req updateUserProfileReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}

	trim := func(p *string) *string {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		return &v
	}
	req.Name = trim(req.Name)
	req.PhoneNumber = trim(req.PhoneNumber)
	req.Address = trim(req.Address)
	req.City = trim(req.City)
	req.State = trim(req.State)
	req.PostalCode = trim(req.PostalCode)
	req.Nik = trim(req.Nik)

	// Mirror validasi auth.UpdateMe — ASCII + length + format checks.
	if req.Name != nil {
		if len(*req.Name) > 128 {
			return httpx.BadRequest(c, "nama terlalu panjang (max 128)")
		}
		if *req.Name != "" && !auth.IsASCIIPrintable(*req.Name) {
			return httpx.BadRequest(c, "nama hanya boleh huruf/angka standar (tanpa karakter aksen atau emoji)")
		}
	}
	if req.PhoneNumber != nil {
		if len(*req.PhoneNumber) > 32 {
			return httpx.BadRequest(c, "nomor HP terlalu panjang (max 32)")
		}
		if *req.PhoneNumber != "" && !auth.ValidPhone(*req.PhoneNumber) {
			return httpx.BadRequest(c, "nomor HP minimal 7 digit (contoh: +62 812 3456 7890)")
		}
	}
	if req.Address != nil {
		if len(*req.Address) > 255 {
			return httpx.BadRequest(c, "alamat terlalu panjang (max 255)")
		}
		if *req.Address != "" && !auth.IsASCIIPrintable(*req.Address) {
			return httpx.BadRequest(c, "alamat hanya boleh karakter ASCII (tanpa aksen atau emoji)")
		}
	}
	if req.City != nil {
		if len(*req.City) > 128 {
			return httpx.BadRequest(c, "kota terlalu panjang (max 128)")
		}
		if *req.City != "" && !auth.IsASCIIPrintable(*req.City) {
			return httpx.BadRequest(c, "nama kota hanya boleh karakter ASCII")
		}
	}
	if req.State != nil {
		if len(*req.State) > 128 {
			return httpx.BadRequest(c, "provinsi terlalu panjang (max 128)")
		}
		if *req.State != "" && !auth.IsASCIIPrintable(*req.State) {
			return httpx.BadRequest(c, "nama provinsi hanya boleh karakter ASCII (mis. em-dash '—', aksen)")
		}
	}
	if req.PostalCode != nil {
		if len(*req.PostalCode) > 16 {
			return httpx.BadRequest(c, "kode pos terlalu panjang (max 16)")
		}
		if *req.PostalCode != "" && !auth.ValidPostalCode(*req.PostalCode) {
			return httpx.BadRequest(c, "kode pos harus 4-10 digit angka")
		}
	}
	if req.Nik != nil && *req.Nik != "" {
		if len(*req.Nik) != 16 {
			return httpx.BadRequest(c, "NIK harus 16 digit")
		}
		for _, r := range *req.Nik {
			if r < '0' || r > '9' {
				return httpx.BadRequest(c, "NIK harus angka saja")
			}
		}
	}

	u, err := h.authRepo.UpdateProfile(c.Context(), id, auth.ProfileUpdate{
		Name:        req.Name,
		PhoneNumber: req.PhoneNumber,
		Address:     req.Address,
		City:        req.City,
		State:       req.State,
		PostalCode:  req.PostalCode,
		Nik:         req.Nik,
	})
	if err != nil {
		return httpx.Internal(c, "update profile failed: "+err.Error())
	}

	// Audit: catat field apa saja yang diubah (bukan nilai, demi privacy).
	changed := []string{}
	add := func(field string, p *string) {
		if p != nil {
			changed = append(changed, field)
		}
	}
	add("name", req.Name)
	add("phone_number", req.PhoneNumber)
	add("address", req.Address)
	add("city", req.City)
	add("state", req.State)
	add("postal_code", req.PostalCode)
	add("nik", req.Nik)
	h.logAudit(c.Context(), auth.UserIDFrom(c), audit.EventAdminUserUpdated, "user", id.String(), map[string]any{
		"fields_changed": changed,
	})

	return httpx.OK(c, u)
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
