package articles

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/litera"
	"github.com/webbuilder/api/internal/sites"
)

type Handler struct {
	repo      *Repo
	sites     *sites.Repo
	litera    *litera.Client         // nil = fitur Litera disabled
	purchases *domain_purchase.Repo  // nil = tidak ada anchor hostname fallback
}

func NewHandler(r *Repo, s *sites.Repo) *Handler { return &Handler{repo: r, sites: s} }

// SetLitera inject Litera client untuk NFT publishing. Nil-safe (publish tetap
// jalan tanpa register ke Litera kalau client nil atau config disabled).
func (h *Handler) SetLitera(c *litera.Client) { h.litera = c }

// SetPurchases inject domain_purchase repo untuk resolve anchor hostname
// fallback. Dipakai saat sites.primary_hostname kosong — ambil domain yang
// user beli sebagai hostname efektif. Nil-safe.
func (h *Handler) SetPurchases(p *domain_purchase.Repo) { h.purchases = p }

// resolveHostname — resolve effective hostname untuk site. Cascade:
//  1. sites.primary_hostname kalau non-empty (user explicitly set).
//  2. anchor domain active (via GetDomainBySite — registered_domains.status='active').
//  3. domain purchase apapun (termasuk pending) — supaya UI bisa jelasin
//     "domain masih provisioning, tunggu beberapa menit".
//  4. "" + source="none" kalau site benar-benar tidak punya domain.
//
// Return `pending=true` kalau source=anchor_pending supaya caller tidak
// pakai hostname-nya (belum resolveable di DNS) tapi tetap bisa inform user.
func (h *Handler) resolveHostname(ctx context.Context, siteID uuid.UUID) (hostname, source string, pending bool) {
	explicit, _ := h.sites.GetPrimaryHostname(ctx, siteID)
	if explicit != "" {
		return explicit, "primary_hostname", false
	}
	if h.purchases != nil {
		// Try active anchor first.
		if d, err := h.purchases.GetDomainBySite(ctx, siteID); err == nil && d != nil && d.Name != "" {
			return d.Name, "anchor_purchased", false
		}
		// Fallback: any domain purchase (pending/provisioning/etc).
		if dom, status, err := h.purchases.GetAnyBySite(ctx, siteID); err == nil && dom != "" {
			// Pending = belum active. Return hostname sebagai info tapi flag pending.
			return dom, "anchor_pending:" + status, true
		}
	}
	return "", "none", false
}

var slugRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$`)

type createReq struct {
	Rubric          string          `json:"rubric"`
	Slug            string          `json:"slug"`
	Title           string          `json:"title"`
	Excerpt         string          `json:"excerpt"`
	BodyMD          string          `json:"body_md"`
	CoverImageURL   string          `json:"cover_image_url"`
	Tags            json.RawMessage `json:"tags"`
	Status          string          `json:"status"`
	CommentsEnabled *bool           `json:"comments_enabled"`
	ReadingTimeMin  int             `json:"reading_time_min"`
	SEOTitle        string          `json:"seo_title"`
	SEODescription  string          `json:"seo_description"`
	// Litera opt-in fields
	LiteraEnabled               bool            `json:"litera_enabled"`
	LiteraUnlockableURL         string          `json:"litera_unlockable_url"`
	LiteraUnlockableDescription string          `json:"litera_unlockable_description"`
	LiteraQuizJSON              json.RawMessage `json:"litera_quiz_json"`
}

type updateReq struct {
	Slug            *string         `json:"slug"`
	Title           *string         `json:"title"`
	Excerpt         *string         `json:"excerpt"`
	BodyMD          *string         `json:"body_md"`
	CoverImageURL   *string         `json:"cover_image_url"`
	Tags            json.RawMessage `json:"tags"`
	Status          *string         `json:"status"`
	CommentsEnabled *bool           `json:"comments_enabled"`
	ReadingTimeMin  *int            `json:"reading_time_min"`
	SEOTitle        *string         `json:"seo_title"`
	SEODescription  *string         `json:"seo_description"`
	// Litera opt-in — pointer = kirim/ubah; nil = tidak diubah.
	LiteraEnabled               *bool           `json:"litera_enabled"`
	LiteraUnlockableURL         *string         `json:"litera_unlockable_url"`
	LiteraUnlockableDescription *string         `json:"litera_unlockable_description"`
	LiteraQuizJSON              json.RawMessage `json:"litera_quiz_json"`
}

// GET /api/v1/sites/:id/articles?rubric=&status=
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
	rubric := strings.TrimSpace(c.Query("rubric"))
	if rubric != "" && !IsValidRubric(rubric) {
		return httpx.BadRequest(c, "invalid rubric")
	}
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "draft" && status != "published" {
		return httpx.BadRequest(c, "invalid status")
	}
	items, total, err := h.repo.ListPage(c.Context(), siteID, p.LikePattern(), rubric, status, p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// POST /api/v1/sites/:id/articles
func (h *Handler) Create(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	site, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c))
	if err != nil {
		return httpx.NotFound(c, "site not found")
	}
	// Quota check — sites.QuotaMaxArticles column added by migration 0048.
	// Kalau kolom belum di-load ke struct sites.Site, kita skip; itu opsional.
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Title = strings.TrimSpace(req.Title)
	req.Rubric = strings.ToLower(strings.TrimSpace(req.Rubric))
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug invalid")
	}
	if req.Title == "" {
		return httpx.BadRequest(c, "title required")
	}
	if !IsValidRubric(req.Rubric) {
		return httpx.BadRequest(c, "invalid rubric")
	}
	// Default: comments_enabled = true kalau tidak dikirim.
	commentsEnabled := true
	if req.CommentsEnabled != nil {
		commentsEnabled = *req.CommentsEnabled
	}
	_ = site // reserved for future quota check
	// Validator Litera: kalau toggle on + status published, cek required fields.
	if req.LiteraEnabled && req.Status == "published" {
		if err := validateLiteraFields(req.Title, req.Excerpt, req.CoverImageURL, req.LiteraQuizJSON); err != nil {
			return httpx.BadRequest(c, err.Error())
		}
	}
	a, err := h.repo.Create(c.Context(), siteID, CreateInput{
		Rubric: req.Rubric, Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt,
		BodyMD: req.BodyMD, CoverImageURL: req.CoverImageURL, Tags: req.Tags,
		Status: req.Status, CommentsEnabled: commentsEnabled,
		ReadingTimeMin: req.ReadingTimeMin, SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
		LiteraEnabled: req.LiteraEnabled, LiteraUnlockableURL: req.LiteraUnlockableURL,
		LiteraUnlockableDescription: req.LiteraUnlockableDescription,
		LiteraQuizJSON:              req.LiteraQuizJSON,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used in this rubric")
	}
	if errors.Is(err, ErrInvalidRub) {
		return httpx.BadRequest(c, "invalid rubric")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	// Litera hook — artikel baru + status=published + enabled → async register.
	// Soft-fail: tidak block response.
	if a.Status == "published" && a.LiteraEnabled && a.LiteraIntentID == "" {
		h.maybeRegisterLitera(a)
	}
	return httpx.Created(c, a)
}

// GET /api/v1/articles/:id
func (h *Handler) Get(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	a, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), a.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "article not found")
	}
	return httpx.OK(c, a)
}

// PATCH /api/v1/articles/:id
func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "article not found")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Slug != nil {
		s := strings.ToLower(strings.TrimSpace(*req.Slug))
		if !slugRe.MatchString(s) {
			return httpx.BadRequest(c, "slug invalid")
		}
		req.Slug = &s
	}
	// Forum rule: reject explicit false. Spec §16.
	if req.CommentsEnabled != nil && !*req.CommentsEnabled && IsForumRubric(existing.Rubric) {
		return httpx.BadRequest(c, "comments cannot be disabled on forum-diskusi")
	}
	// Resolve nilai efektif setelah merge (untuk Litera validator check).
	// Pakai req kalau non-nil, fallback ke existing.
	effTitle := existing.Title
	if req.Title != nil {
		effTitle = *req.Title
	}
	effExcerpt := existing.Excerpt
	if req.Excerpt != nil {
		effExcerpt = *req.Excerpt
	}
	effCover := existing.CoverImageURL
	if req.CoverImageURL != nil {
		effCover = *req.CoverImageURL
	}
	effLiteraEnabled := existing.LiteraEnabled
	if req.LiteraEnabled != nil {
		effLiteraEnabled = *req.LiteraEnabled
	}
	effStatus := existing.Status
	if req.Status != nil {
		effStatus = *req.Status
	}
	effQuiz := existing.LiteraQuizJSON
	if len(req.LiteraQuizJSON) > 0 {
		effQuiz = req.LiteraQuizJSON
	}
	// Validator Litera: kalau toggle on + mau publish, cek required fields.
	if effLiteraEnabled && effStatus == "published" {
		if err := validateLiteraFields(effTitle, effExcerpt, effCover, effQuiz); err != nil {
			return httpx.BadRequest(c, err.Error())
		}
	}
	a, err := h.repo.Update(c.Context(), id, UpdateInput{
		Slug: req.Slug, Title: req.Title, Excerpt: req.Excerpt, BodyMD: req.BodyMD,
		CoverImageURL: req.CoverImageURL, Tags: req.Tags, Status: req.Status,
		CommentsEnabled: req.CommentsEnabled, ReadingTimeMin: req.ReadingTimeMin,
		SEOTitle: req.SEOTitle, SEODescription: req.SEODescription,
		LiteraEnabled: req.LiteraEnabled, LiteraUnlockableURL: req.LiteraUnlockableURL,
		LiteraUnlockableDescription: req.LiteraUnlockableDescription,
		LiteraQuizJSON:              req.LiteraQuizJSON,
	})
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already used in this rubric")
	}
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if errors.Is(err, ErrInvalidStat) {
		return httpx.BadRequest(c, "invalid status")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	// Litera hook — kalau transition ke published AND enabled AND belum punya
	// intent_id, async register. Juga handle "retry" case: existing failed
	// (litera_register_error != "") + user re-publish.
	needsRegister := a.Status == "published" && a.LiteraEnabled && a.LiteraIntentID == "" &&
		(existing.Status != "published" || existing.LiteraRegisterError != "" || !existing.LiteraEnabled)
	if needsRegister {
		h.maybeRegisterLitera(a)
	}
	return httpx.OK(c, a)
}

// POST /api/v1/articles/:id/publish
func (h *Handler) Publish(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "article not found")
	}
	// Validator Litera: artikel ini mau di-publish — kalau Litera enabled,
	// cek required fields. Short-circuit sebelum DB update.
	if existing.LiteraEnabled {
		if err := validateLiteraFields(existing.Title, existing.Excerpt, existing.CoverImageURL, existing.LiteraQuizJSON); err != nil {
			return httpx.BadRequest(c, err.Error())
		}
	}
	status := "published"
	a, err := h.repo.Update(c.Context(), id, UpdateInput{Status: &status})
	if err != nil {
		return httpx.Internal(c, "publish failed")
	}
	// Litera hook — async register kalau enabled + belum punya intent.
	if a.LiteraEnabled && a.LiteraIntentID == "" {
		h.maybeRegisterLitera(a)
	}
	return httpx.OK(c, a)
}

// DELETE /api/v1/articles/:id
func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	existing, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), existing.SiteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "article not found")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// GET /api/v1/sites/:id/stats — Jejak Website Saya.
func (h *Handler) Stats(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwnedOrAdmin(c.Context(), siteID, uid, auth.IsAdminFrom(c)); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	s, err := h.repo.SiteStats(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "stats failed")
	}
	return httpx.OK(c, s)
}

// ========================= LITERA INTEGRATION HOOKS =========================

// validateLiteraFields — enforce syarat Litera register saat publish.
// Required: title, excerpt (jadi description), cover_image_url. Kalau quiz
// non-kosong, pastikan struktur valid (1-3 pertanyaan, 4 opsi, correctOption
// terset).
func validateLiteraFields(title, excerpt, coverImageURL string, quizJSON json.RawMessage) error {
	var missing []string
	if strings.TrimSpace(title) == "" {
		missing = append(missing, "judul")
	}
	if strings.TrimSpace(excerpt) == "" {
		missing = append(missing, "ringkasan")
	}
	if strings.TrimSpace(coverImageURL) == "" {
		missing = append(missing, "gambar cover")
	}
	if len(missing) > 0 {
		return fmt.Errorf("field wajib untuk Litera belum diisi: %s", strings.Join(missing, ", "))
	}
	// Quiz optional — kalau kosong, skip. Kalau non-empty, validasi struktur.
	if len(quizJSON) > 0 && string(quizJSON) != "{}" && string(quizJSON) != "null" {
		var quiz litera.QuizPayload
		if err := json.Unmarshal(quizJSON, &quiz); err != nil {
			return fmt.Errorf("quiz format tidak valid")
		}
		if len(quiz.Questions) == 0 {
			return nil // treated as no quiz
		}
		if len(quiz.Questions) > 3 {
			return fmt.Errorf("maksimal 3 pertanyaan quiz")
		}
		for i, q := range quiz.Questions {
			if strings.TrimSpace(q.Question) == "" {
				return fmt.Errorf("pertanyaan ke-%d belum diisi", i+1)
			}
			if len(q.Options) != 4 {
				return fmt.Errorf("pertanyaan ke-%d harus punya 4 opsi", i+1)
			}
			for j, opt := range q.Options {
				if strings.TrimSpace(opt) == "" {
					return fmt.Errorf("pertanyaan ke-%d opsi %c kosong", i+1, 'A'+j)
				}
			}
			if q.CorrectOption != "A" && q.CorrectOption != "B" && q.CorrectOption != "C" && q.CorrectOption != "D" {
				return fmt.Errorf("pertanyaan ke-%d harus pilih jawaban benar (A/B/C/D)", i+1)
			}
		}
	}
	return nil
}

// maybeRegisterLitera — fire-and-forget goroutine untuk register ke Litera API.
// Soft-fail: artikel tetap published walau register gagal; error tersimpan di
// litera_register_error untuk admin retry manual.
func (h *Handler) maybeRegisterLitera(a *Article) {
	if h.litera == nil {
		return
	}
	go func() {
		// Context terpisah dari request — pakai background dengan timeout 60s.
		// Alasan: HTTP request parent sudah closed, tidak boleh share ctx.
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		h.registerLitera(ctx, a)
	}()
}

// registerLitera — synchronous registration; dipanggil dari goroutine di
// maybeRegisterLitera atau admin retry endpoint.
func (h *Handler) registerLitera(ctx context.Context, a *Article) {
	if h.litera == nil {
		return
	}
	// Build canonical URL dari site hostname + rubric + slug.
	site, err := h.sites.GetByID(ctx, a.SiteID)
	if err != nil {
		slog.Warn("litera register: site lookup failed", "article", a.ID, "err", err)
		_ = h.repo.MarkLiteraFailed(ctx, a.ID, "site tidak ditemukan: "+err.Error())
		return
	}
	host, src, pending := h.resolveHostname(ctx, a.SiteID)
	if host == "" {
		slog.Warn("litera register: no resolvable hostname",
			"article", a.ID, "site", a.SiteID)
		_ = h.repo.MarkLiteraFailed(ctx, a.ID,
			"site tidak terhubung ke domain apapun — harap beli domain dulu lewat halaman beli domain")
		return
	}
	if pending {
		// Domain masih provisioning — hostname belum resolveable di DNS.
		// Jangan kirim ke Litera (akan 403 CORS). Simpan info ke error field,
		// goroutine notifier atau admin retry akan kick ulang saat active.
		slog.Info("litera register: domain still pending",
			"article", a.ID, "site", a.SiteID, "status", src)
		_ = h.repo.MarkLiteraFailed(ctx, a.ID,
			"domain "+host+" masih dalam proses ("+src+") — Litera akan daftar otomatis setelah domain aktif")
		return
	}
	canonicalURL := litera.CanonicalArticleURL(host, a.Rubric, a.Slug)
	// Author = nama site (platform guru pakai nama guru sebagai nama site).
	author := site.Name

	var quiz *litera.QuizPayload
	if len(a.LiteraQuizJSON) > 0 && string(a.LiteraQuizJSON) != "{}" && string(a.LiteraQuizJSON) != "null" {
		var q litera.QuizPayload
		if err := json.Unmarshal(a.LiteraQuizJSON, &q); err == nil && len(q.Questions) > 0 {
			quiz = &q
		}
	}

	req, err := h.litera.BuildRegisterRequest(ctx,
		canonicalURL, a.Title, author, a.Excerpt, a.CoverImageURL,
		a.LiteraUnlockableURL, a.LiteraUnlockableDescription, quiz,
	)
	if err != nil {
		if errors.Is(err, litera.ErrDisabled) {
			// Config disabled — jangan tandai failed, user mungkin baru enable.
			slog.Info("litera register skipped: integration disabled",
				"article", a.ID)
			return
		}
		slog.Warn("litera register: build request failed", "article", a.ID, "err", err)
		_ = h.repo.MarkLiteraFailed(ctx, a.ID, err.Error())
		return
	}

	resp, err := h.litera.Register(ctx, req)
	if err != nil {
		slog.Warn("litera register: API call failed",
			"article", a.ID, "url", canonicalURL, "err", err)
		msg := err.Error()
		if len(msg) > 500 {
			msg = msg[:500]
		}
		_ = h.repo.MarkLiteraFailed(ctx, a.ID, msg)
		return
	}
	if err := h.repo.MarkLiteraRegistered(ctx, a.ID, resp.Data.Intent.ID); err != nil {
		slog.Error("litera register: DB mark success failed",
			"article", a.ID, "intent", resp.Data.Intent.ID, "err", err)
		return
	}
	slog.Info("litera register success",
		"article", a.ID, "intent", resp.Data.Intent.ID, "url", canonicalURL)
}

// RetryLiteraRegister — admin endpoint helper (dipanggil dari admin handler).
// Reset error flag + re-run register.
func (h *Handler) RetryLiteraRegister(ctx context.Context, id uuid.UUID) error {
	a, err := h.repo.Get(ctx, id)
	if err != nil {
		return err
	}
	if !a.LiteraEnabled {
		return fmt.Errorf("artikel tidak enable Litera")
	}
	if a.LiteraIntentID != "" {
		return fmt.Errorf("artikel sudah ter-register dengan intent %s", a.LiteraIntentID)
	}
	h.registerLitera(ctx, a)
	return nil
}

// ========================= ADMIN LITERA DASHBOARD =========================

// LiteraAdminList — GET /api/v1/admin/litera/intents
// Paginated list artikel yang litera_enabled=true. Filter status via query
// param `?status=registered|pending|failed`.
func (h *Handler) LiteraAdminList(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	status := strings.TrimSpace(c.Query("status"))
	if status != "" && status != "registered" && status != "pending" && status != "failed" {
		return httpx.BadRequest(c, "status harus registered/pending/failed")
	}
	items, total, err := h.repo.LiteraAdminList(c.Context(), p.LikePattern(), status, p.Sort, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// LiteraAdminRetry — POST /api/v1/admin/articles/:id/litera-retry
// Re-run register untuk artikel yang soft-failed. Admin-only (route protected
// di admin router).
func (h *Handler) LiteraAdminRetry(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.RetryLiteraRegister(c.Context(), id); err != nil {
		return httpx.BadRequest(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"ok": true, "message": "retry dijadwalkan"})
}

// LiteraAdminPreview — GET /api/v1/admin/articles/:id/litera-preview
// Return detail debug untuk admin: canonical URL, payload yang akan/sudah
// dikirim ke Litera, analisis error + hint perbaikan.
func (h *Handler) LiteraAdminPreview(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	a, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}

	// Fetch site + primary hostname.
	site, err := h.sites.GetByID(c.Context(), a.SiteID)
	if err != nil {
		return httpx.Internal(c, "site lookup failed")
	}
	hostname, hostnameSource, hostnamePending := h.resolveHostname(c.Context(), a.SiteID)
	hasHostname := strings.TrimSpace(hostname) != ""

	// Canonical URL — "" kalau hostname belum di-set.
	var canonicalURL string
	if hasHostname {
		canonicalURL = litera.CanonicalArticleURL(hostname, a.Rubric, a.Slug)
	}

	// Payload preview — selalu build (walau hostname belum di-set) supaya admin
	// bisa lihat apa yang AKAN dikirim ke Litera. Hostname kosong = pakai
	// placeholder di articleUrl supaya jelas ini bagian yang perlu diisi.
	var payloadPreview any
	if h.litera != nil {
		previewURL := canonicalURL
		if previewURL == "" {
			previewURL = "https://(hostname-site-belum-di-set)/" + a.Rubric + "/" + a.Slug
		}
		var quiz *litera.QuizPayload
		if len(a.LiteraQuizJSON) > 0 && string(a.LiteraQuizJSON) != "{}" && string(a.LiteraQuizJSON) != "null" {
			var q litera.QuizPayload
			if err := json.Unmarshal(a.LiteraQuizJSON, &q); err == nil && len(q.Questions) > 0 {
				quiz = &q
			}
		}
		req, err := h.litera.BuildRegisterRequest(c.Context(),
			previewURL, a.Title, site.Name, a.Excerpt, a.CoverImageURL,
			a.LiteraUnlockableURL, a.LiteraUnlockableDescription, quiz,
		)
		if err == nil {
			payloadPreview = req
		}
	}

	// Error analysis — classify + suggest fix.
	errorCategory := ""
	errorHint := ""
	if a.LiteraRegisterError != "" {
		msg := strings.ToLower(a.LiteraRegisterError)
		switch {
		case strings.Contains(msg, "domain publik") || strings.Contains(msg, "primary hostname") || strings.Contains(msg, "no primary hostname"):
			errorCategory = "site_domain"
			errorHint = "Site belum punya domain publik (primary hostname). Minta guru buka Settings site → Domain, set Primary Hostname di salah satu custom domain yang sudah verified. Ini TIDAK terkait dengan API key Litera."
		case strings.Contains(msg, "unauthorized") || strings.Contains(msg, "401"):
			errorCategory = "litera_apikey"
			errorHint = "API key Litera invalid/expired. Buka /admin/litera → tab Konfigurasi, periksa API key dari dashboard Literaa."
		case strings.Contains(msg, "domain not in cors") || strings.Contains(msg, "403"):
			errorCategory = "litera_cors"
			errorHint = "Domain site belum di-whitelist CORS Litera. Tunggu 60 detik lalu Retry — biasanya auto-approve. Kalau tetap 403, hubungi Litera support."
		case strings.Contains(msg, "rate limit") || strings.Contains(msg, "429"):
			errorCategory = "api"
			errorHint = "Rate limit Litera (60 req/menit). Tunggu beberapa saat lalu Retry."
		case strings.Contains(msg, "timeout") || strings.Contains(msg, "network") || strings.Contains(msg, "dial"):
			errorCategory = "network"
			errorHint = "Network timeout. Litera API mungkin lagi down. Retry setelah beberapa menit."
		case strings.Contains(msg, "field wajib") || strings.Contains(msg, "belum diisi"):
			errorCategory = "validation"
			errorHint = "Guru belum isi field wajib (judul/ringkasan/cover). Minta guru lengkapi di editor."
		default:
			errorCategory = "unknown"
			errorHint = "Error tidak terklasifikasi. Cek log server (correlation ID di error message)."
		}
	}

	return httpx.OK(c, fiber.Map{
		"article": fiber.Map{
			"id":                            a.ID,
			"title":                         a.Title,
			"rubric":                        a.Rubric,
			"slug":                          a.Slug,
			"excerpt":                       a.Excerpt,
			"cover_image_url":               a.CoverImageURL,
			"status":                        a.Status,
			"litera_enabled":                a.LiteraEnabled,
			"litera_intent_id":              a.LiteraIntentID,
			"litera_registered_at":          a.LiteraRegisteredAt,
			"litera_unlockable_url":         a.LiteraUnlockableURL,
			"litera_unlockable_description": a.LiteraUnlockableDescription,
			"litera_quiz_json":              json.RawMessage(a.LiteraQuizJSON),
		},
		"site": fiber.Map{
			"id":               site.ID,
			"name":             site.Name,
			"slug":             site.Slug,
			"primary_hostname": hostname,
			"has_hostname":     hasHostname,
			// Source: "primary_hostname" = user explicitly set, "anchor_purchased"
			// = fallback dari domain yang dibeli (active), "anchor_pending:<status>"
			// = domain masih dalam proses, "none" = belum ada domain apapun.
			"hostname_source":  hostnameSource,
			// hostname_pending = true kalau domain ada tapi belum fully active
			// (misal pending_provisioning). UI pakai ini untuk tampilkan info
			// "domain masih diproses, tunggu beberapa menit".
			"hostname_pending": hostnamePending,
		},
		"canonical_url":    canonicalURL,
		"payload_preview":  payloadPreview,
		"error": fiber.Map{
			"message":  a.LiteraRegisterError,
			"category": errorCategory,
			"hint":     errorHint,
		},
	})
}
