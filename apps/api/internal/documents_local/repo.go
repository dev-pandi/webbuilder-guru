// repo.go — CRUD tipis untuk tabel `documents`. Blob file di-simpan di
// assets.Storage; repo hanya track metadata + pointer (storage_key).

package documents_local

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("document not found")

type Document struct {
	ID         uuid.UUID `json:"id"`
	UserID     uuid.UUID `json:"user_id"`
	CategoryID int16     `json:"category_id"`
	Filename   string    `json:"filename"`
	StorageKey string    `json:"storage_key"`
	MimeType   string    `json:"mime_type"`
	SizeBytes  int64     `json:"size_bytes"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Repo struct {
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) *Repo { return &Repo{pool: pool} }

const cols = `id, user_id, category_id, filename, storage_key, mime_type, size_bytes, created_at, updated_at`

func scanRow(row pgx.Row, d *Document) error {
	return row.Scan(&d.ID, &d.UserID, &d.CategoryID, &d.Filename,
		&d.StorageKey, &d.MimeType, &d.SizeBytes, &d.CreatedAt, &d.UpdatedAt)
}

func (r *Repo) Create(ctx context.Context, d *Document) error {
	q := `INSERT INTO documents (user_id, category_id, filename, storage_key, mime_type, size_bytes)
	      VALUES ($1, $2, $3, $4, $5, $6)
	      RETURNING ` + cols
	return scanRow(r.pool.QueryRow(ctx, q,
		d.UserID, d.CategoryID, d.Filename, d.StorageKey, d.MimeType, d.SizeBytes), d)
}

// GetByID — scoped by user_id. Return ErrNotFound kalau tidak match owner.
func (r *Repo) GetByID(ctx context.Context, id, userID uuid.UUID) (*Document, error) {
	q := `SELECT ` + cols + ` FROM documents WHERE id = $1 AND user_id = $2`
	var d Document
	if err := scanRow(r.pool.QueryRow(ctx, q, id, userID), &d); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

// ListByUser — semua dokumen user, terbaru dulu. Optional filter category_id
// (0 = all).
func (r *Repo) ListByUser(ctx context.Context, userID uuid.UUID, categoryID int16) ([]Document, error) {
	var (
		rows pgx.Rows
		err  error
	)
	if categoryID > 0 {
		q := `SELECT ` + cols + ` FROM documents
		      WHERE user_id = $1 AND category_id = $2
		      ORDER BY created_at DESC`
		rows, err = r.pool.Query(ctx, q, userID, categoryID)
	} else {
		q := `SELECT ` + cols + ` FROM documents
		      WHERE user_id = $1
		      ORDER BY created_at DESC`
		rows, err = r.pool.Query(ctx, q, userID)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Document, 0)
	for rows.Next() {
		var d Document
		if err := scanRow(rows, &d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *Repo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	q := `DELETE FROM documents WHERE id = $1 AND user_id = $2`
	ct, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
