package responses

import (
	"errors"
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/articles"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/learning"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	repo     *Repo
	sites    *sites.Repo
	articles *articles.Repo
	learning *learning.Repo
}

func NewHandler(r *Repo, s *sites.Repo, a *articles.Repo, l *learning.Repo) *Handler {
	return &Handler{repo: r, sites: s, articles: a, learning: l}
}

const (
	maxNameLen = 60
	maxBodyLen = 2000
)

// --- Dashboard endpoints (auth) ---

// GET /api/v1/sites/:id/responses?status=&sort=
func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	p := httpx.ParsePagination(c)
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && !IsValidStatus(status) {
		return httpx.BadRequest(c, "invalid status filter")
	}
	items, total, err := h.repo.ListPage(c.Context(), siteID, status, p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// POST /api/v1/responses/:id/approve
func (h *Handler) Approve(c *fiber.Ctx) error {
	return h.setStatus(c, "approved")
}

// POST /api/v1/responses/:id/reject
func (h *Handler) Reject(c *fiber.Ctx) error {
	return h.setStatus(c, "rejected")
}

func (h *Handler) setStatus(c *fiber.Ctx, status string) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "response not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	// Ownership check: only guru pemilik site yang boleh moderasi.
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "response not found")
	}
	r, err := h.repo.SetStatus(c.Context(), id, status, uid)
	if err != nil {
		return httpx.Internal(c, "moderation failed")
	}
	return httpx.OK(c, r)
}

// DELETE /api/v1/responses/:id
func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "response not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "response not found")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// --- Public endpoint (no auth) — submit tanggapan ---

type submitReq struct {
	AuthorName  string `json:"author_name"`
	AuthorRole  string `json:"author_role"`
	AuthorEmail string `json:"author_email"` // private, never exposed publicly
	Body        string `json:"body"`
	// Honeypot — user asli tidak lihat field ini (di-hide di renderer via
	// CSS + aria-hidden). Bot cenderung fill semua input yang mereka lihat
	// dari HTML source → kalau field ini terisi, kita silent-drop.
	Honeypot string `json:"_hp"`
}

// PublicSubmit — POST /public/sites/:id/articles/:article_id/responses.
// Renderer memanggil endpoint ini. Always creates status='pending', requires
// article.comments_enabled = true.
func (h *Handler) PublicSubmit(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	articleID, err := uuid.Parse(c.Params("article_id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid article id")
	}
	a, err := h.articles.Get(c.Context(), articleID)
	if errors.Is(err, articles.ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if a.SiteID != siteID {
		return httpx.NotFound(c, "article not found")
	}
	if a.Status != "published" {
		return httpx.NotFound(c, "article not found")
	}
	if !a.CommentsEnabled {
		return httpx.Forbidden(c, "Tanggapan dinonaktifkan pada tulisan ini")
	}
	var req submitReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}

	// Honeypot check — kalau bot fill _hp, return 200 "sukses" tanpa insert.
	// Bot tidak tahu di-block → tidak retry dengan variasi. Log info level
	// supaya bisa audit kalau ada spike.
	if strings.TrimSpace(req.Honeypot) != "" {
		slog.Info("response submit: honeypot triggered",
			"article_id", articleID, "site_id", siteID, "ip", c.IP())
		return httpx.Created(c, PublicView{
			ID:         uuid.Nil,
			AuthorName: strings.TrimSpace(req.AuthorName),
			AuthorRole: "pembaca",
			Body:       "",
		})
	}

	req.AuthorName = strings.TrimSpace(req.AuthorName)
	req.AuthorRole = strings.ToLower(strings.TrimSpace(req.AuthorRole))
	req.Body = strings.TrimSpace(req.Body)
	if req.AuthorName == "" || len(req.AuthorName) > maxNameLen {
		return httpx.BadRequest(c, "author_name required (max 60 chars)")
	}
	if !IsValidRole(req.AuthorRole) {
		return httpx.BadRequest(c, "author_role must be guru|siswa|orang-tua|pembaca")
	}
	if req.Body == "" || len(req.Body) > maxBodyLen {
		return httpx.BadRequest(c, "body required (max 2000 chars)")
	}
	resp, err := h.repo.Submit(c.Context(), SubmitInput{
		SiteID: siteID, ArticleID: &articleID,
		AuthorName: req.AuthorName, AuthorRole: req.AuthorRole,
		AuthorEmail: req.AuthorEmail, Body: req.Body,
		SubmitterIP: c.IP(),
	})
	if err != nil {
		return httpx.Internal(c, "submit failed")
	}
	// Return sanitized shape (no email/IP).
	return httpx.Created(c, PublicView{
		ID: resp.ID, AuthorName: resp.AuthorName, AuthorRole: resp.AuthorRole,
		Body: resp.Body, CreatedAt: resp.CreatedAt,
	})
}

// PublicSubmitMaterial — POST /public/sites/:id/learning-materials/:material_id/responses.
// Mirror PublicSubmit untuk learning materials. Materi tidak punya
// comments_enabled flag — asumsi always-on.
func (h *Handler) PublicSubmitMaterial(c *fiber.Ctx) error {
	if h.learning == nil {
		return httpx.NotFound(c, "learning not available")
	}
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	materialID, err := uuid.Parse(c.Params("material_id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid material id")
	}
	m, err := h.learning.Get(c.Context(), materialID)
	if errors.Is(err, learning.ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if m.SiteID != siteID || m.Status != "published" {
		return httpx.NotFound(c, "material not found")
	}
	var req submitReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}

	if strings.TrimSpace(req.Honeypot) != "" {
		slog.Info("response submit: honeypot triggered",
			"material_id", materialID, "site_id", siteID, "ip", c.IP())
		return httpx.Created(c, PublicView{
			ID:         uuid.Nil,
			AuthorName: strings.TrimSpace(req.AuthorName),
			AuthorRole: "pembaca",
			Body:       "",
		})
	}

	req.AuthorName = strings.TrimSpace(req.AuthorName)
	req.AuthorRole = strings.ToLower(strings.TrimSpace(req.AuthorRole))
	req.Body = strings.TrimSpace(req.Body)
	if req.AuthorName == "" || len(req.AuthorName) > maxNameLen {
		return httpx.BadRequest(c, "author_name required (max 60 chars)")
	}
	if !IsValidRole(req.AuthorRole) {
		return httpx.BadRequest(c, "author_role must be guru|siswa|orang-tua|pembaca")
	}
	if req.Body == "" || len(req.Body) > maxBodyLen {
		return httpx.BadRequest(c, "body required (max 2000 chars)")
	}
	resp, err := h.repo.Submit(c.Context(), SubmitInput{
		SiteID: siteID, LearningMaterialID: &materialID,
		AuthorName: req.AuthorName, AuthorRole: req.AuthorRole,
		AuthorEmail: req.AuthorEmail, Body: req.Body,
		SubmitterIP: c.IP(),
	})
	if err != nil {
		return httpx.Internal(c, "submit failed")
	}
	return httpx.Created(c, PublicView{
		ID: resp.ID, AuthorName: resp.AuthorName, AuthorRole: resp.AuthorRole,
		Body: resp.Body, CreatedAt: resp.CreatedAt,
	})
}
