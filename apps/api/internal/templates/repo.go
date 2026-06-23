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
		SELECT id, slug, category, name, description, preview_url, theme_json, pages_json, is_premium, created_at
		FROM templates ORDER BY category, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Template{}
	for rows.Next() {
		var t Template
		if err := rows.Scan(&t.ID, &t.Slug, &t.Category, &t.Name, &t.Description, &t.PreviewURL, &t.Theme, &t.Pages, &t.IsPremium, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *Repo) GetBySlug(ctx context.Context, slug string) (*Template, error) {
	var t Template
	err := r.pool.QueryRow(ctx, `
		SELECT id, slug, category, name, description, preview_url, theme_json, pages_json, is_premium, created_at
		FROM templates WHERE slug = $1
	`, slug).Scan(&t.ID, &t.Slug, &t.Category, &t.Name, &t.Description, &t.PreviewURL, &t.Theme, &t.Pages, &t.IsPremium, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &t, err
}

// Seed inserts templates from seed.json on startup if missing (idempotent by slug).
func (r *Repo) Seed(ctx context.Context) error {
	var seed []struct {
		Slug        string          `json:"slug"`
		Category    string          `json:"category"`
		Name        string          `json:"name"`
		Description string          `json:"description"`
		PreviewURL  string          `json:"preview_url"`
		Theme       json.RawMessage `json:"theme"`
		Pages       json.RawMessage `json:"pages"`
	}
	if err := json.Unmarshal(SeedJSON, &seed); err != nil {
		return err
	}
	for _, t := range seed {
		_, err := r.pool.Exec(ctx, `
			INSERT INTO templates (slug, category, name, description, preview_url, theme_json, pages_json)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (slug) DO UPDATE SET
			    category = EXCLUDED.category,
			    name = EXCLUDED.name,
			    description = EXCLUDED.description,
			    preview_url = EXCLUDED.preview_url,
			    theme_json = EXCLUDED.theme_json,
			    pages_json = EXCLUDED.pages_json
		`, t.Slug, t.Category, t.Name, t.Description, t.PreviewURL, t.Theme, t.Pages)
		if err != nil {
			return err
		}
	}
	return nil
}
