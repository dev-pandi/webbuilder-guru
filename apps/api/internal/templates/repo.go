package templates

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Template struct {
	ID          uuid.UUID       `json:"id"`
	Slug        string          `json:"slug"`
	Category    string          `json:"category"`
	Variant     string          `json:"variant"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	PreviewURL  string          `json:"preview_url"`
	Theme       json.RawMessage `json:"theme"`
	Pages       json.RawMessage `json:"pages"`
	IsPremium   bool            `json:"is_premium"`
	CreatedAt   time.Time       `json:"created_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("not found")

func (r *Repo) List(ctx context.Context) ([]Template, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, slug, category, variant, name, description, preview_url, theme_json, pages_json, is_premium, created_at
		FROM templates ORDER BY category, variant, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Template{}
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.Slug, &t.Category, &t.Variant, &t.Name, &t.Description, &t.PreviewURL, &t.Theme, &t.Pages, &t.IsPremium, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *Repo) GetBySlug(ctx context.Context, slug string) (*Template, error) {
	var t Template
	err := r.pool.QueryRow(ctx, `
		SELECT id, slug, category, variant, name, description, preview_url, theme_json, pages_json, is_premium, created_at
		FROM templates WHERE slug = $1
	`, slug).Scan(&t.ID, &t.Slug, &t.Category, &t.Variant, &t.Name, &t.Description, &t.PreviewURL, &t.Theme, &t.Pages, &t.IsPremium, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &t, err
}

// ApplyMode controls what ApplyToSite changes.
type ApplyMode string

const (
	// ApplyModeTheme only swaps theme tokens (colors/fonts/radius). Pages untouched.
	ApplyModeTheme ApplyMode = "theme"
	// ApplyModeAppend swaps theme AND inserts template pages whose slugs aren't taken.
	ApplyModeAppend ApplyMode = "append"
	// ApplyModeReplace swaps theme AND wipes existing pages, then inserts template pages.
	ApplyModeReplace ApplyMode = "replace"
)

// ApplyResult reports what ApplyToSite did, for UI feedback.
type ApplyResult struct {
	Mode          ApplyMode `json:"mode"`
	Template      string    `json:"template_slug"`
	PagesInserted int       `json:"pages_inserted"`
	PagesSkipped  int       `json:"pages_skipped"`
	PagesRemoved  int       `json:"pages_removed"`
}

// ApplyToSite swaps the theme of an existing site to another template's, and
// optionally seeds template pages. Runs in a transaction — partial failures
// roll back. Caller must verify ownership before calling.
func (r *Repo) ApplyToSite(ctx context.Context, siteID uuid.UUID, slug string, mode ApplyMode) (*ApplyResult, error) {
	tpl, err := r.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Always swap theme + link site to the new template id.
	if _, err := tx.Exec(ctx,
		`UPDATE sites SET theme_json = $1, template_id = $2, updated_at = now() WHERE id = $3`,
		tpl.Theme, tpl.ID, siteID,
	); err != nil {
		return nil, err
	}

	res := &ApplyResult{Mode: mode, Template: tpl.Slug}

	switch mode {
	case ApplyModeTheme:
		// nothing else
	case ApplyModeAppend, ApplyModeReplace:
		// parse template pages JSON
		var tplPages []struct {
			Slug   string          `json:"slug"`
			Title  string          `json:"title"`
			IsHome bool            `json:"is_home"`
			Tree   json.RawMessage `json:"tree"`
			SEO    json.RawMessage `json:"seo"`
		}
		if len(tpl.Pages) > 0 {
			_ = json.Unmarshal(tpl.Pages, &tplPages)
		}

		if mode == ApplyModeReplace {
			ct, err := tx.Exec(ctx, `DELETE FROM pages WHERE site_id = $1`, siteID)
			if err != nil {
				return nil, err
			}
			res.PagesRemoved = int(ct.RowsAffected())
		}

		// Existing slug set — for "append" we skip collisions.
		existing := map[string]bool{}
		hasHome := false
		if mode == ApplyModeAppend {
			rows, err := tx.Query(ctx, `SELECT slug, is_home FROM pages WHERE site_id = $1`, siteID)
			if err != nil {
				return nil, err
			}
			for rows.Next() {
				var s string
				var h bool
				if err := rows.Scan(&s, &h); err != nil {
					rows.Close()
					return nil, err
				}
				existing[s] = true
				if h {
					hasHome = true
				}
			}
			rows.Close()
		}

		for _, p := range tplPages {
			if p.Slug == "" {
				continue
			}
			if mode == ApplyModeAppend && existing[p.Slug] {
				res.PagesSkipped++
				continue
			}
			tree := p.Tree
			if len(tree) == 0 {
				tree = json.RawMessage(`{}`)
			}
			seo := p.SEO
			if len(seo) == 0 {
				seo = json.RawMessage(`{}`)
			}
			isHome := p.IsHome
			// Don't promote two homes when appending into a site that already has one.
			if mode == ApplyModeAppend && hasHome {
				isHome = false
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO pages (site_id, slug, title, tree_json, seo_json, is_home)
				VALUES ($1, $2, $3, $4, $5, $6)
			`, siteID, p.Slug, p.Title, tree, seo, isHome); err != nil {
				return nil, err
			}
			res.PagesInserted++
		}
	default:
		return nil, errors.New("invalid mode")
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return res, nil
}

// Seed populates the 15 built-in templates (5 categories × 3 variants each).
// Idempotent: re-running upserts by slug.
func (r *Repo) Seed(ctx context.Context) error {
	for _, t := range BuiltinTemplates() {
		theme, err := json.Marshal(t.Theme)
		if err != nil {
			return err
		}
		pages, err := json.Marshal(t.Pages)
		if err != nil {
			return err
		}
		_, err = r.pool.Exec(ctx, `
			INSERT INTO templates (slug, category, variant, name, description, preview_url, theme_json, pages_json)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (slug) DO UPDATE SET
			    category    = EXCLUDED.category,
			    variant     = EXCLUDED.variant,
			    name        = EXCLUDED.name,
			    description = EXCLUDED.description,
			    preview_url = EXCLUDED.preview_url,
			    theme_json  = EXCLUDED.theme_json,
			    pages_json  = EXCLUDED.pages_json
		`, t.Slug, t.Category, t.Variant, t.Name, t.Description, t.PreviewURL, theme, pages)
		if err != nil {
			return err
		}
	}
	return nil
}
