// Package snippets manages user-saved reusable block snapshots. A snippet is
// just a single BlockData (type + props + optional layout/themeOverride) named
// by the user and listed in their personal library — surfaced in the editor's
// palette dialog under a dedicated tab.
package snippets

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Snippet struct {
	ID        uuid.UUID       `json:"id"`
	UserID    uuid.UUID       `json:"user_id"`
	Name      string          `json:"name"`
	BlockType string          `json:"block_type"`
	Block     json.RawMessage `json:"block"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("snippet not found")

func (r *Repo) ListByUser(ctx context.Context, userID uuid.UUID) ([]Snippet, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, name, block_type, block_json, created_at, updated_at
		FROM block_snippets
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Snippet{}
	for rows.Next() {
		var s Snippet
		if err := rows.Scan(&s.ID, &s.UserID, &s.Name, &s.BlockType, &s.Block, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repo) Create(ctx context.Context, userID uuid.UUID, name, blockType string, block json.RawMessage) (*Snippet, error) {
	var s Snippet
	err := r.pool.QueryRow(ctx, `
		INSERT INTO block_snippets (user_id, name, block_type, block_json)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, name, block_type, block_json, created_at, updated_at
	`, userID, name, blockType, block).Scan(
		&s.ID, &s.UserID, &s.Name, &s.BlockType, &s.Block, &s.CreatedAt, &s.UpdatedAt,
	)
	return &s, err
}

// Rename updates only the snippet's display name. The block payload is treated
// as immutable — if the user wants to edit the snippet's contents they save a
// new one (much like Figma's component override flow).
func (r *Repo) Rename(ctx context.Context, id, userID uuid.UUID, name string) (*Snippet, error) {
	var s Snippet
	err := r.pool.QueryRow(ctx, `
		UPDATE block_snippets
		SET name = $3, updated_at = now()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, name, block_type, block_json, created_at, updated_at
	`, id, userID, name).Scan(
		&s.ID, &s.UserID, &s.Name, &s.BlockType, &s.Block, &s.CreatedAt, &s.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &s, err
}

func (r *Repo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `DELETE FROM block_snippets WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
