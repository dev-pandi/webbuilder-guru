package products

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Product is a sellable item. Designed to be payment-ready:
// - price stored in smallest unit (rupiah) as int — no float precision loss
// - metadata_json untuk extension (SKU payment gateway, varian, attribute)
// - stock NULL = unlimited
type Product struct {
	ID          uuid.UUID       `json:"id"`
	SiteID      uuid.UUID       `json:"site_id"`
	Slug        string          `json:"slug"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Price       int64           `json:"price"`
	Currency    string          `json:"currency"`
	Stock       *int            `json:"stock,omitempty"`
	ImageURL    string          `json:"image_url"`
	Gallery     json.RawMessage `json:"gallery"`
	Category    string          `json:"category"`
	Status      string          `json:"status"` // active | draft | archived
	Metadata    json.RawMessage `json:"metadata"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var (
	ErrNotFound  = errors.New("product not found")
	ErrSlugTaken = errors.New("product slug already used in this site")
)

const cols = `id, site_id, slug, name, description, price, currency, stock,
    image_url, gallery_json, category, status, metadata_json,
    created_at, updated_at`

func scan(p *Product) []any {
	return []any{
		&p.ID, &p.SiteID, &p.Slug, &p.Name, &p.Description, &p.Price, &p.Currency, &p.Stock,
		&p.ImageURL, &p.Gallery, &p.Category, &p.Status, &p.Metadata,
		&p.CreatedAt, &p.UpdatedAt,
	}
}

func (r *Repo) CountBySite(ctx context.Context, siteID uuid.UUID) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM products WHERE site_id = $1`, siteID).Scan(&n)
	return n, err
}

type CreateInput struct {
	Slug        string
	Name        string
	Description string
	Price       int64
	Currency    string
	Stock       *int
	ImageURL    string
	Gallery     json.RawMessage
	Category    string
	Status      string
	Metadata    json.RawMessage
}

func (r *Repo) Create(ctx context.Context, siteID uuid.UUID, in CreateInput) (*Product, error) {
	if in.Currency == "" {
		in.Currency = "IDR"
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if len(in.Gallery) == 0 {
		in.Gallery = json.RawMessage(`[]`)
	}
	if len(in.Metadata) == 0 {
		in.Metadata = json.RawMessage(`{}`)
	}
	var p Product
	err := r.pool.QueryRow(ctx, `
		INSERT INTO products (site_id, slug, name, description, price, currency, stock,
		    image_url, gallery_json, category, status, metadata_json)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		RETURNING `+cols+`
	`, siteID, in.Slug, in.Name, in.Description, in.Price, in.Currency, in.Stock,
		in.ImageURL, in.Gallery, in.Category, in.Status, in.Metadata,
	).Scan(scan(&p)...)
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

type UpdateInput struct {
	Slug        *string
	Name        *string
	Description *string
	Price       *int64
	Currency    *string
	Stock       *int   // pointer-to-int doesn't distinguish "set to NULL" vs "unset". Use ClearStock for NULL.
	ClearStock  bool   // if true, sets stock to NULL
	ImageURL    *string
	Gallery     json.RawMessage
	Category    *string
	Status      *string
	Metadata    json.RawMessage
}

func (r *Repo) Update(ctx context.Context, id uuid.UUID, in UpdateInput) (*Product, error) {
	// Build dynamic UPDATE with COALESCE for nullable scalars. Two stock cases:
	// - ClearStock true: explicit set NULL
	// - Stock != nil: set to value
	// - both unset: COALESCE keeps existing
	stockExpr := "stock"
	args := []any{id}
	if in.ClearStock {
		stockExpr = "NULL"
	} else if in.Stock != nil {
		args = append(args, *in.Stock)
		stockExpr = fmt.Sprintf("$%d", len(args))
	}

	args = append(args, in.Slug, in.Name, in.Description, in.Price, in.Currency,
		in.ImageURL, jsonOrNil(in.Gallery), in.Category, in.Status, jsonOrNil(in.Metadata))

	q := fmt.Sprintf(`
		UPDATE products SET
		    slug          = COALESCE($2, slug),
		    name          = COALESCE($3, name),
		    description   = COALESCE($4, description),
		    price         = COALESCE($5, price),
		    currency      = COALESCE($6, currency),
		    stock         = %s,
		    image_url     = COALESCE($7, image_url),
		    gallery_json  = COALESCE($8, gallery_json),
		    category      = COALESCE($9, category),
		    status        = COALESCE($10, status),
		    metadata_json = COALESCE($11, metadata_json),
		    updated_at    = now()
		WHERE id = $1
		RETURNING `+cols+`
	`, stockExpr)

	var p Product
	err := r.pool.QueryRow(ctx, q, args...).Scan(scan(&p)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if pgErrCode(err) == "23505" {
		return nil, ErrSlugTaken
	}
	return &p, err
}

func (r *Repo) Get(ctx context.Context, id uuid.UUID) (*Product, error) {
	var p Product
	err := r.pool.QueryRow(ctx, `SELECT `+cols+` FROM products WHERE id = $1`, id).Scan(scan(&p)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) GetBySiteSlug(ctx context.Context, siteID uuid.UUID, slug string) (*Product, error) {
	var p Product
	err := r.pool.QueryRow(ctx,
		`SELECT `+cols+` FROM products WHERE site_id = $1 AND slug = $2`,
		siteID, slug,
	).Scan(scan(&p)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &p, err
}

func (r *Repo) Delete(ctx context.Context, id uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM products WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func orderSQL(sort string) string {
	switch sort {
	case "price_asc":
		return "price ASC, created_at DESC"
	case "price_desc":
		return "price DESC, created_at DESC"
	case "name_asc":
		return "name ASC"
	case "name_desc":
		return "name DESC"
	case "oldest":
		return "created_at ASC"
	case "newest", "":
		return "created_at DESC"
	}
	return "created_at DESC"
}

// ListPage returns one page of products for a site.
// `statusFilter` accepts "active", "draft", "archived", or "" for all.
func (r *Repo) ListPage(ctx context.Context, siteID uuid.UUID, like, statusFilter, sort string, limit, offset int) ([]Product, int, error) {
	statusClause := ""
	args := []any{siteID, like}
	if statusFilter != "" {
		statusClause = " AND status = $3"
		args = append(args, statusFilter)
	}

	var total int
	countArgs := append([]any{}, args...)
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM products WHERE site_id = $1 AND (LOWER(name) LIKE $2 OR LOWER(slug) LIKE $2)`+statusClause,
		countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	limitClause := fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	q := fmt.Sprintf(`
		SELECT `+cols+`
		FROM products
		WHERE site_id = $1 AND (LOWER(name) LIKE $2 OR LOWER(slug) LIKE $2)%s
		ORDER BY %s%s
	`, statusClause, orderSQL(sort), limitClause)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Product{}
	for rows.Next() {
		var p Product
		if err := rows.Scan(scan(&p)...); err != nil {
			return nil, 0, err
		}
		out = append(out, p)
	}
	return out, total, rows.Err()
}

func jsonOrNil(v json.RawMessage) any {
	if len(v) == 0 {
		return nil
	}
	return v
}

func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
