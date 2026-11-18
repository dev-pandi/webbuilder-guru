package siteseed

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Target is the site a seed is applied to.
type Target struct {
	SiteID       uuid.UUID
	OwnerID      uuid.UUID
	Slug         string
	Name         string
	Status       string
	OwnerEmail   string
	OwnerSites   int
	QuotaPages   int
	QuotaStorage int64
	QuotaArticle int
	QuotaMateri  int
}

var ErrSiteNotFound = errors.New("situs tidak ditemukan")

// FindSite accepts a site UUID, a hostname (any domain state, draft sites
// included — unlike sites.GetByHost which only serves published ones), or the
// internal site slug.
func FindSite(ctx context.Context, pool *pgxpool.Pool, ref string) (*Target, error) {
	ref = strings.ToLower(strings.TrimSpace(ref))
	var t Target
	err := pool.QueryRow(ctx, `
		WITH pick AS (
			SELECT COALESCE(
				(SELECT id FROM sites WHERE id::text = $1),
				(SELECT dp.site_id FROM domain_purchases dp
				  WHERE dp.domain = $1 AND dp.kind = 'register' AND dp.site_id IS NOT NULL
				  ORDER BY (dp.status = 'active') DESC, dp.created_at DESC LIMIT 1),
				(SELECT d.site_id FROM domains d WHERE d.hostname = $1 LIMIT 1),
				(SELECT b.site_id FROM site_byo_domains b WHERE b.hostname = $1 LIMIT 1),
				(SELECT id FROM sites WHERE slug = $1)
			) AS id
		)
		SELECT s.id, s.user_id, s.slug, s.name, s.status, u.email,
		       (SELECT count(*) FROM sites o WHERE o.user_id = s.user_id),
		       s.quota_max_pages, s.quota_max_storage_bytes,
		       s.quota_max_articles, s.quota_max_learning_materials
		  FROM pick JOIN sites s ON s.id = pick.id
		  JOIN users u ON u.id = s.user_id
	`, ref).Scan(&t.SiteID, &t.OwnerID, &t.Slug, &t.Name, &t.Status, &t.OwnerEmail,
		&t.OwnerSites, &t.QuotaPages, &t.QuotaStorage, &t.QuotaArticle, &t.QuotaMateri)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrSiteNotFound
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

type Options struct {
	// Prune deletes pages/articles/materials/banners missing from the seed —
	// but only for sections the seed actually fills, so a seed without
	// banners never wipes the site's banners.
	Prune bool
	// Draft writes page trees to the editor draft only; live stays as is.
	Draft bool
	// DryRun runs everything inside a transaction that is rolled back and
	// uploads nothing.
	DryRun bool
}

type Counts struct{ Created, Updated, Deleted int }

type Result struct {
	Pages, Articles, Materials, Banners Counts
	Files                               int
	Deleted                             []string
	Warnings                            []string
}

// Apply writes the spec to the target site in one transaction. Files are
// uploaded first (outside the tx); re-runs reuse them by content hash.
func Apply(ctx context.Context, pool *pgxpool.Pool, up Uploader, t *Target, s *Spec, opt Options) (*Result, error) {
	res := &Result{}
	if opt.DryRun {
		dr := &dryRunUploader{}
		up = dr
		defer func() { res.Files = dr.count }()
	} else if c, ok := up.(interface{ Uploaded() int }); ok {
		defer func() { res.Files = c.Uploaded() }()
	}
	if err := resolveFiles(ctx, s, up); err != nil {
		return nil, err
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	steps := []func(context.Context, pgx.Tx, *Target, *Spec, Options, *Result) error{
		applySite, applyPages, applyArticles, applyMaterials, applyBanners, applyProfile,
	}
	for _, step := range steps {
		if err := step(ctx, tx, t, s, opt, res); err != nil {
			return nil, err
		}
	}
	if t.Status != "published" {
		res.Warnings = append(res.Warnings,
			fmt.Sprintf("status situs %q: konten tersimpan, tapi situs belum tampil sampai dipublikasikan dari dashboard", t.Status))
	}
	if opt.DryRun {
		return res, nil
	}
	return res, tx.Commit(ctx)
}

func applySite(ctx context.Context, tx pgx.Tx, t *Target, s *Spec, _ Options, _ *Result) error {
	var theme any
	if len(s.Site.Theme) > 0 {
		theme = s.Site.Theme
	}
	if _, err := tx.Exec(ctx, `
		UPDATE sites
		   SET name = COALESCE(NULLIF($2, ''), name),
		       theme_json = COALESCE($3::jsonb, theme_json),
		       updated_at = now()
		 WHERE id = $1`, t.SiteID, s.Site.Name, theme); err != nil {
		return fmt.Errorf("update situs: %w", err)
	}
	if s.Site.Header == nil && s.Site.Footer == nil {
		return nil
	}

	// Merge so a seed that only defines the footer keeps the current header.
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT layout_json FROM sites WHERE id = $1`, t.SiteID).Scan(&raw); err != nil {
		return err
	}
	layout := map[string]any{}
	_ = json.Unmarshal(raw, &layout)
	if s.Site.Header != nil {
		layout["header"] = s.Site.Header
		layout["header_enabled"] = len(s.Site.Header) > 0
	}
	if s.Site.Footer != nil {
		layout["footer"] = s.Site.Footer
		layout["footer_enabled"] = len(s.Site.Footer) > 0
	}
	b, err := json.Marshal(layout)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `UPDATE sites SET layout_json = $2, updated_at = now() WHERE id = $1`, t.SiteID, b)
	return err
}

func applyPages(ctx context.Context, tx pgx.Tx, t *Target, s *Spec, opt Options, res *Result) error {
	if len(s.Pages) == 0 {
		return nil
	}
	slugs := make([]string, 0, len(s.Pages))
	for _, p := range s.Pages {
		slugs = append(slugs, p.Slug)
		if p.IsHome {
			// Single home per site; demote before upsert so the renderer never sees two.
			if _, err := tx.Exec(ctx,
				`UPDATE pages SET is_home = false WHERE site_id = $1 AND slug <> $2 AND is_home`,
				t.SiteID, p.Slug); err != nil {
				return err
			}
		}
	}

	for _, p := range s.Pages {
		tree, err := json.Marshal(map[string]any{"blocks": withGuruStyles(p.Blocks)})
		if err != nil {
			return err
		}
		seo := p.SEO
		if len(seo) == 0 {
			seo = json.RawMessage(`{}`)
		}
		title := p.Title
		if title == "" {
			title = p.Slug
		}
		var inserted bool
		err = tx.QueryRow(ctx, `
			INSERT INTO pages (site_id, slug, title, tree_json, seo_json, is_home, published_tree_json, published_at)
			VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6,
			        CASE WHEN $7::bool THEN $4::jsonb END,
			        CASE WHEN $7::bool THEN now() END)
			ON CONFLICT (site_id, slug) DO UPDATE SET
			    title      = EXCLUDED.title,
			    tree_json  = EXCLUDED.tree_json,
			    seo_json   = EXCLUDED.seo_json,
			    is_home    = EXCLUDED.is_home,
			    version    = pages.version + 1,
			    updated_at = now(),
			    published_tree_json  = CASE WHEN $7::bool THEN EXCLUDED.tree_json ELSE pages.published_tree_json END,
			    published_at         = CASE WHEN $7::bool THEN now() ELSE pages.published_at END,
			    scheduled_publish_at = CASE WHEN $7::bool THEN NULL ELSE pages.scheduled_publish_at END
			RETURNING (xmax = 0)
		`, t.SiteID, p.Slug, title, tree, seo, p.IsHome, !opt.Draft).Scan(&inserted)
		if err != nil {
			return fmt.Errorf("halaman %s: %w", p.Slug, err)
		}
		bump(&res.Pages, inserted)
	}

	if opt.Prune {
		deleted, err := collect(ctx, tx,
			`DELETE FROM pages WHERE site_id = $1 AND slug <> ALL($2) RETURNING slug`, t.SiteID, slugs)
		if err != nil {
			return err
		}
		res.Pages.Deleted += len(deleted)
		for _, d := range deleted {
			res.Deleted = append(res.Deleted, "halaman /"+d)
		}
	}
	return checkQuota(ctx, tx, `SELECT count(*) FROM pages WHERE site_id = $1`, t.SiteID, t.QuotaPages, "halaman")
}

// withGuruStyles prepends the GuruStyles block when a page uses Guru* blocks
// but forgot it — without it every Guru section renders unstyled.
func withGuruStyles(blocks []json.RawMessage) []json.RawMessage {
	usesGuru := false
	for _, b := range blocks {
		typ := blockType(b)
		if typ == "GuruStyles" {
			return blocks
		}
		if strings.HasPrefix(typ, "Guru") && !strings.HasPrefix(typ, "GuruPlus") {
			usesGuru = true
		}
	}
	if !usesGuru {
		return blocks
	}
	return append([]json.RawMessage{json.RawMessage(`{"type":"GuruStyles","props":{}}`)}, blocks...)
}

func blockType(raw json.RawMessage) string {
	var b struct {
		Type string `json:"type"`
	}
	_ = json.Unmarshal(raw, &b)
	return b.Type
}

func applyArticles(ctx context.Context, tx pgx.Tx, t *Target, s *Spec, opt Options, res *Result) error {
	if len(s.Articles) == 0 {
		return nil
	}
	keys := make([]string, 0, len(s.Articles))
	for _, a := range s.Articles {
		keys = append(keys, a.Rubric+"/"+a.Slug)
		tags, _ := json.Marshal(a.Tags)
		reading := a.ReadingTime
		if reading == 0 {
			reading = readingMinutes(a.Body)
		}
		var inserted bool
		err := tx.QueryRow(ctx, `
			INSERT INTO articles (site_id, rubric, slug, title, excerpt, body_md, cover_image_url,
			    tags_json, status, comments_enabled, reading_time_min, seo_title, seo_description, published_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			        CASE WHEN $9 = 'published' THEN COALESCE($14::timestamptz, now()) END)
			ON CONFLICT (site_id, rubric, slug) DO UPDATE SET
			    title            = EXCLUDED.title,
			    excerpt          = EXCLUDED.excerpt,
			    body_md          = EXCLUDED.body_md,
			    cover_image_url  = EXCLUDED.cover_image_url,
			    tags_json        = EXCLUDED.tags_json,
			    status           = EXCLUDED.status,
			    comments_enabled = EXCLUDED.comments_enabled,
			    reading_time_min = EXCLUDED.reading_time_min,
			    seo_title        = EXCLUDED.seo_title,
			    seo_description  = EXCLUDED.seo_description,
			    published_at     = CASE WHEN EXCLUDED.status = 'published'
			                            THEN COALESCE($14::timestamptz, articles.published_at, now()) END,
			    updated_at       = now()
			RETURNING (xmax = 0)
		`, t.SiteID, a.Rubric, a.Slug, a.Title, a.Excerpt, a.Body, a.Cover, tags, a.Status,
			a.Comments || a.Rubric == "forum-diskusi", reading, a.SEOTitle, a.SEODescription, a.PublishedAt,
		).Scan(&inserted)
		if err != nil {
			return fmt.Errorf("tulisan %s/%s: %w", a.Rubric, a.Slug, err)
		}
		bump(&res.Articles, inserted)
	}

	if opt.Prune {
		deleted, err := collect(ctx, tx, `
			DELETE FROM articles WHERE site_id = $1 AND (rubric || '/' || slug) <> ALL($2)
			RETURNING rubric || '/' || slug`, t.SiteID, keys)
		if err != nil {
			return err
		}
		res.Articles.Deleted += len(deleted)
		for _, d := range deleted {
			res.Deleted = append(res.Deleted, "tulisan /"+d+" (beserta tanggapannya)")
		}
	}
	return checkQuota(ctx, tx, `SELECT count(*) FROM articles WHERE site_id = $1`, t.SiteID, t.QuotaArticle, "tulisan")
}

func applyMaterials(ctx context.Context, tx pgx.Tx, t *Target, s *Spec, opt Options, res *Result) error {
	if len(s.Materials) == 0 {
		return nil
	}
	// Parents first so children can reference their freshly upserted IDs.
	mats := append([]MaterialSpec(nil), s.Materials...)
	sort.SliceStable(mats, func(i, j int) bool {
		return mats[i].Parent == "" && mats[j].Parent != ""
	})

	ids := map[string]uuid.UUID{}
	slugs := make([]string, 0, len(mats))
	for _, m := range mats {
		slugs = append(slugs, m.Slug)
		tags, _ := json.Marshal(m.Tags)
		var parent *uuid.UUID
		if m.Parent != "" {
			id := ids[m.Parent]
			parent = &id
		}
		var (
			id       uuid.UUID
			inserted bool
		)
		err := tx.QueryRow(ctx, `
			INSERT INTO learning_materials (site_id, slug, title, excerpt, body_md, cover_image_url,
			    tags_json, summary, status, seo_title, seo_description, parent_id, sort_order, emoji, published_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			        CASE WHEN $9 = 'published' THEN COALESCE($15::timestamptz, now()) END)
			ON CONFLICT (site_id, slug) DO UPDATE SET
			    title           = EXCLUDED.title,
			    excerpt         = EXCLUDED.excerpt,
			    body_md         = EXCLUDED.body_md,
			    cover_image_url = EXCLUDED.cover_image_url,
			    tags_json       = EXCLUDED.tags_json,
			    summary         = EXCLUDED.summary,
			    status          = EXCLUDED.status,
			    seo_title       = EXCLUDED.seo_title,
			    seo_description = EXCLUDED.seo_description,
			    parent_id       = EXCLUDED.parent_id,
			    sort_order      = EXCLUDED.sort_order,
			    emoji           = EXCLUDED.emoji,
			    published_at    = CASE WHEN EXCLUDED.status = 'published'
			                           THEN COALESCE($15::timestamptz, learning_materials.published_at, now()) END,
			    updated_at      = now()
			RETURNING id, (xmax = 0)
		`, t.SiteID, m.Slug, m.Title, m.Excerpt, m.Body, m.Cover, tags, m.Summary, m.Status,
			m.SEOTitle, m.SEODescription, parent, m.Order, m.Emoji, m.PublishedAt,
		).Scan(&id, &inserted)
		if err != nil {
			return fmt.Errorf("materi %s: %w", m.Slug, err)
		}
		ids[m.Slug] = id
		bump(&res.Materials, inserted)
	}

	if opt.Prune {
		deleted, err := collect(ctx, tx,
			`DELETE FROM learning_materials WHERE site_id = $1 AND slug <> ALL($2) RETURNING slug`, t.SiteID, slugs)
		if err != nil {
			return err
		}
		res.Materials.Deleted += len(deleted)
		for _, d := range deleted {
			res.Deleted = append(res.Deleted, "materi /pembelajaran/"+d)
		}
	}
	return checkQuota(ctx, tx, `SELECT count(*) FROM learning_materials WHERE site_id = $1`, t.SiteID, t.QuotaMateri, "materi")
}

func applyBanners(ctx context.Context, tx pgx.Tx, t *Target, s *Spec, opt Options, res *Result) error {
	if len(s.Banners) == 0 {
		return nil
	}
	existing := map[string]uuid.UUID{}
	rows, err := tx.Query(ctx, `SELECT id, internal_title FROM promotion_banners WHERE site_id = $1`, t.SiteID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var id uuid.UUID
		var title string
		if err := rows.Scan(&id, &title); err != nil {
			rows.Close()
			return err
		}
		existing[title] = id
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	titles := make([]string, 0, len(s.Banners))
	for i, b := range s.Banners {
		titles = append(titles, b.Title)
		if id, ok := existing[b.Title]; ok {
			// teacher_active is the owner's own toggle; admin moderation
			// (admin_enabled) is deliberately left untouched.
			if _, err := tx.Exec(ctx, `
				UPDATE promotion_banners
				   SET image_url = $2, target_url = $3, alt_text = $4, sort_order = $5,
				       teacher_active = true, updated_at = now()
				 WHERE id = $1`, id, b.Image, b.Href, b.Alt, i+1); err != nil {
				return fmt.Errorf("banner %q: %w", b.Title, err)
			}
			res.Banners.Updated++
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO promotion_banners (site_id, owner_user_id, internal_title, image_url,
			    target_url, alt_text, sort_order, teacher_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
			t.SiteID, t.OwnerID, b.Title, b.Image, b.Href, b.Alt, i+1); err != nil {
			return fmt.Errorf("banner %q: %w", b.Title, err)
		}
		res.Banners.Created++
	}

	if opt.Prune {
		deleted, err := collect(ctx, tx, `
			DELETE FROM promotion_banners WHERE site_id = $1 AND internal_title <> ALL($2)
			RETURNING internal_title`, t.SiteID, titles)
		if err != nil {
			return err
		}
		res.Banners.Deleted += len(deleted)
		for _, d := range deleted {
			res.Deleted = append(res.Deleted, "banner "+fmt.Sprintf("%q", d))
		}
	}
	return nil
}

func applyProfile(ctx context.Context, tx pgx.Tx, t *Target, s *Spec, _ Options, res *Result) error {
	p := s.Profile
	if p == nil {
		return nil
	}
	var social any
	if p.SocialLinks != nil {
		b, err := json.Marshal(p.SocialLinks)
		if err != nil {
			return err
		}
		social = b
	}
	if _, err := tx.Exec(ctx, `
		UPDATE users SET
		    name              = COALESCE(NULLIF($2, ''), name),
		    subject_or_field  = COALESCE(NULLIF($3, ''), subject_or_field),
		    profile_image     = COALESCE(NULLIF($4, ''), profile_image),
		    bio_short         = COALESCE(NULLIF($5, ''), bio_short),
		    bio_long          = COALESCE(NULLIF($6, ''), bio_long),
		    hero_statement    = COALESCE(NULLIF($7, ''), hero_statement),
		    quote             = COALESCE(NULLIF($8, ''), quote),
		    social_links_json = COALESCE($9::jsonb, social_links_json),
		    updated_at        = now()
		 WHERE id = $1`,
		t.OwnerID, p.Name, p.SubjectOrField, p.ProfileImage, p.BioShort, p.BioLong,
		p.HeroStatement, p.Quote, social); err != nil {
		return fmt.Errorf("profil guru: %w", err)
	}
	if t.OwnerSites > 1 {
		res.Warnings = append(res.Warnings, fmt.Sprintf(
			"profil guru disimpan di akun %s, yang juga dipakai %d situs lain miliknya", t.OwnerEmail, t.OwnerSites-1))
	}
	return nil
}

func collect(ctx context.Context, tx pgx.Tx, sql string, args ...any) ([]string, error) {
	rows, err := tx.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	sort.Strings(out)
	return out, rows.Err()
}

func checkQuota(ctx context.Context, tx pgx.Tx, sql string, siteID uuid.UUID, limit int, what string) error {
	var n int
	if err := tx.QueryRow(ctx, sql, siteID).Scan(&n); err != nil {
		return err
	}
	if limit > 0 && n > limit {
		return fmt.Errorf("kuota %s situs ini %d, seed menghasilkan %d — naikkan kuota dari admin atau pakai -prune", what, limit, n)
	}
	return nil
}

func bump(c *Counts, inserted bool) {
	if inserted {
		c.Created++
	} else {
		c.Updated++
	}
}

// readingMinutes estimates at ~200 words per minute, minimum 1.
func readingMinutes(md string) int {
	words := len(strings.FieldsFunc(md, func(r rune) bool { return unicode.IsSpace(r) }))
	m := (words + 199) / 200
	if m < 1 {
		m = 1
	}
	return m
}
