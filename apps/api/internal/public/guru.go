package public

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/webbuilder/api/internal/articles"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/learning"
	"github.com/webbuilder/api/internal/responses"
)

// GuruHandler — endpoints publik untuk website guru + portal directory.
// Terpisah dari public.Handler yang generic (produk/blog/template preview).
type GuruHandler struct {
	pool     *pgxpool.Pool
	articles *articles.Repo
	learning *learning.Repo
	resp     *responses.Repo
}

func NewGuruHandler(pool *pgxpool.Pool, a *articles.Repo, l *learning.Repo, r *responses.Repo) *GuruHandler {
	return &GuruHandler{pool: pool, articles: a, learning: l, resp: r}
}

// GET /public/sites/:id/articles?rubric=&limit=20
// Only published. If rubric specified, filter to that rubric.
func (h *GuruHandler) ListArticles(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rubric := strings.TrimSpace(c.Query("rubric"))
	if rubric != "" && !articles.IsValidRubric(rubric) {
		return httpx.BadRequest(c, "invalid rubric")
	}
	items, _, err := h.articles.ListPage(c.Context(), id, "%", rubric, "published", "published_desc", limit, 0)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	// Enrich with approved response count (kartu tulisan).
	type view struct {
		articles.Article
		ResponseCount int64 `json:"response_count"`
	}
	out := make([]view, 0, len(items))
	for _, a := range items {
		var count int64
		if a.CommentsEnabled {
			count, _ = h.resp.CountApprovedByArticle(c.Context(), a.ID)
		}
		out = append(out, view{Article: a, ResponseCount: count})
	}
	return httpx.OK(c, out)
}

// GET /public/sites/:id/articles/:rubric/:slug
func (h *GuruHandler) ArticleByRubricSlug(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	rubric := strings.TrimSpace(c.Params("rubric"))
	slug := strings.TrimSpace(c.Params("slug"))
	if !articles.IsValidRubric(rubric) {
		return httpx.NotFound(c, "article not found")
	}
	a, err := h.articles.GetBySiteRubricSlug(c.Context(), id, rubric, slug)
	if errors.Is(err, articles.ErrNotFound) {
		return httpx.NotFound(c, "article not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if a.Status != "published" {
		return httpx.NotFound(c, "article not found")
	}
	// Bump view count with fingerprint dedupe.
	fp := fingerprint(c)
	_, _ = h.articles.IncrementView(c.Context(), a.ID, id, fp, 60)
	// Attach approved response count (kalau comments enabled).
	var respCount int64
	if a.CommentsEnabled {
		respCount, _ = h.resp.CountApprovedByArticle(c.Context(), a.ID)
	}
	return httpx.OK(c, fiber.Map{
		"article":        a,
		"response_count": respCount,
	})
}

// GET /public/sites/:id/articles/:article_id/responses
// Only approved. Requires article.comments_enabled = true.
func (h *GuruHandler) ListArticleResponses(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
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
	if a.SiteID != id || a.Status != "published" {
		return httpx.NotFound(c, "article not found")
	}
	if !a.CommentsEnabled {
		return httpx.OK(c, []responses.PublicView{})
	}
	limit, _ := strconv.Atoi(c.Query("limit", "200"))
	items, err := h.resp.ListApprovedByArticle(c.Context(), articleID, limit)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}

// GET /public/sites/:id/latest-articles?limit=6
// "Tulisan Terbaru" untuk Beranda.
func (h *GuruHandler) LatestArticles(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "6"))
	items, err := h.articles.LatestPublished(c.Context(), id, limit)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}

// GET /public/sites/:id/stats — "Jejak Website Saya".
func (h *GuruHandler) SiteStats(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	s, err := h.articles.SiteStats(c.Context(), id)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, s)
}

// GET /public/sites/:id/learning-materials?limit=20
func (h *GuruHandler) ListLearningMaterials(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	items, _, err := h.learning.ListPage(c.Context(), id, "%", "published", "published_desc", limit, 0)
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, items)
}

// GET /public/sites/:id/learning-materials/:slug
func (h *GuruHandler) LearningMaterialBySlug(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	m, err := h.learning.GetBySiteSlug(c.Context(), id, c.Params("slug"))
	if errors.Is(err, learning.ErrNotFound) {
		return httpx.NotFound(c, "material not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	if m.Status != "published" {
		return httpx.NotFound(c, "material not found")
	}
	return httpx.OK(c, m)
}

// --- Portal / Direktori Guru ---

// TeacherDirectoryItem — kartu guru di portal §5.1.
type TeacherDirectoryItem struct {
	SiteID          uuid.UUID `json:"site_id"`
	UserID          uuid.UUID `json:"user_id"`
	Name            string    `json:"name"`
	SubjectOrField  string    `json:"subject_or_field"`
	ProfileImage    string    `json:"profile_image"`
	Domain          string    `json:"domain"`
	TotalViews      int64     `json:"total_views"`
	CreatedAt       string    `json:"created_at"`
	IsNew           bool      `json:"is_new"`
}

// GET /public/guru?q=&sort=popular|newest&page=&page_size=
// Direktori guru: hanya site status=published dengan primary domain terpasang.
func (h *GuruHandler) TeacherDirectory(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	sort := c.Query("sort", "newest")
	orderBy := "s.created_at DESC"
	switch sort {
	case "popular":
		orderBy = "total_views DESC, s.created_at DESC"
	case "newest", "":
		orderBy = "s.created_at DESC"
	}
	like := p.LikePattern()
	// Domain lookup: pakai domain_purchases yang aktif (kolom domain_name).
	// Query dijaga stabil kalau tabel tidak ada — cukup return name/slug fallback.
	ctx := c.Context()
	total, err := h.countDirectory(ctx, like)
	if err != nil {
		return httpx.Internal(c, "count failed")
	}
	items, err := h.queryDirectory(ctx, like, orderBy, p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

func (h *GuruHandler) countDirectory(ctx context.Context, like string) (int, error) {
	var n int
	err := h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM sites s
		JOIN users u ON u.id = s.user_id
		WHERE s.status = 'published'
		  AND (LOWER(s.name) LIKE $1 OR LOWER(u.name) LIKE $1 OR LOWER(u.email) LIKE $1)
	`, like).Scan(&n)
	return n, err
}

func (h *GuruHandler) queryDirectory(ctx context.Context, like, orderBy string, limit, offset int) ([]TeacherDirectoryItem, error) {
	// Domain: pakai domain_purchases.domain_name kalau ada + status active,
	// fallback ke s.slug supaya kartu tetap punya identifier.
	rows, err := h.pool.Query(ctx, `
		SELECT
		    s.id, s.user_id,
		    COALESCE(NULLIF(u.name, ''), u.email) AS name,
		    u.subject_or_field,
		    u.profile_image,
		    COALESCE(
		        (SELECT dp.domain FROM domain_purchases dp
		           WHERE dp.site_id = s.id AND dp.status = 'active'
		           ORDER BY dp.created_at DESC LIMIT 1),
		        s.slug
		    ) AS domain,
		    COALESCE(SUM(a.view_count), 0)::bigint AS total_views,
		    s.created_at,
		    (s.created_at > now() - interval '14 days') AS is_new
		FROM sites s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN articles a ON a.site_id = s.id AND a.status = 'published'
		WHERE s.status = 'published'
		  AND (
		      LOWER(s.name) LIKE $1
		      OR LOWER(u.name) LIKE $1
		      OR LOWER(u.email) LIKE $1
		      OR LOWER(u.subject_or_field) LIKE $1
		  )
		GROUP BY s.id, u.id
		ORDER BY `+orderBy+`
		LIMIT $2 OFFSET $3
	`, like, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TeacherDirectoryItem{}
	for rows.Next() {
		var it TeacherDirectoryItem
		var createdAtRaw any
		if err := rows.Scan(&it.SiteID, &it.UserID, &it.Name, &it.SubjectOrField, &it.ProfileImage,
			&it.Domain, &it.TotalViews, &createdAtRaw, &it.IsNew); err != nil {
			return nil, err
		}
		it.CreatedAt = toStr(createdAtRaw)
		out = append(out, it)
	}
	return out, rows.Err()
}

func toStr(v any) string {
	switch x := v.(type) {
	case string:
		return x
	default:
		return ""
	}
}

// fingerprint — SHA256(IP + "|" + UA-prefix) truncated ke 16 hex chars.
// Kenapa hash:
//   1. Panjang konsisten (16 char) — tidak bloat kolom article_view_events
//   2. Tidak leak IP client raw ke DB (privacy — kalau backup DB bocor,
//      attacker tidak dapet IP:artikel mapping)
//   3. Case-insensitive (hex output)
// Note: c.IP() sudah respect X-Forwarded-For kalau TRUST_PROXY=true
// (dikonfigurasi di router.New via fiber.ProxyHeader).
func fingerprint(c *fiber.Ctx) string {
	ua := c.Get("User-Agent")
	if len(ua) > 60 {
		ua = ua[:60]
	}
	sum := sha256.Sum256([]byte(c.IP() + "|" + ua))
	return hex.EncodeToString(sum[:8]) // 16 hex chars = 64-bit
}
