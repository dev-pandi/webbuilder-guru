package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID              uuid.UUID
	Email           string
	PasswordHash    string
	Name            string
	Role            string
	CreatedAt       time.Time
	EmailVerifiedAt *time.Time
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("not found")
var ErrEmailTaken = errors.New("email already registered")

func (r *Repo) CreateUser(ctx context.Context, email, hash, name string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)
		 RETURNING id, email, password_hash, name, role, created_at, email_verified_at`,
		email, hash, name,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.EmailVerifiedAt)
	if err != nil {
		// 23505 = unique_violation
		if pgErrCode(err) == "23505" {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return &u, nil
}

func (r *Repo) GetByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, name, role, created_at, email_verified_at FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.EmailVerifiedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// SetRole updates a user's role (used by EnsureAdmin bootstrap).
func (r *Repo) SetRole(ctx context.Context, userID uuid.UUID, role string) error {
	_, err := r.pool.Exec(ctx, `UPDATE users SET role = $1, updated_at = now() WHERE id = $2`, role, userID)
	return err
}

// EnsureAdmin upserts a user with role='admin'. If the email exists, the
// password stays unchanged (re-run-safe); if not, the user is created.
func (r *Repo) EnsureAdmin(ctx context.Context, email, passwordHash, name string) (*User, error) {
	if u, err := r.GetByEmail(ctx, email); err == nil {
		if u.Role != "admin" {
			if err := r.SetRole(ctx, u.ID, "admin"); err != nil {
				return nil, err
			}
			u.Role = "admin"
		}
		return u, nil
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	var u User
	err := r.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name, role)
		VALUES ($1, $2, $3, 'admin')
		RETURNING id, email, password_hash, name, role, created_at, email_verified_at
	`, email, passwordHash, name).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.EmailVerifiedAt)
	return &u, err
}

func (r *Repo) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, password_hash, name, role, created_at, email_verified_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Name, &u.Role, &u.CreatedAt, &u.EmailVerifiedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// Refresh token = random 32B, stored as sha256 hash.
func GenerateRefreshToken() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return
}

func HashRefreshToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func (r *Repo) StoreRefreshToken(ctx context.Context, userID uuid.UUID, hash string, ttl time.Duration) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hash, time.Now().Add(ttl),
	)
	return err
}

func (r *Repo) RotateRefreshToken(ctx context.Context, oldHash, newHash string, ttl time.Duration) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	var revoked *time.Time
	var expires time.Time
	err = tx.QueryRow(ctx,
		`SELECT user_id, revoked_at, expires_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
		oldHash,
	).Scan(&userID, &revoked, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}
	if revoked != nil || time.Now().After(expires) {
		return uuid.Nil, ErrNotFound
	}
	if _, err := tx.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, oldHash,
	); err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, newHash, time.Now().Add(ttl),
	); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return userID, nil
}

func (r *Repo) RevokeRefreshToken(ctx context.Context, hash string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
		hash,
	)
	return err
}

// --- Password reset + email verification tokens ---
//
// Both tables share a shape: opaque hex token, sha256 hash stored, single-use
// (used_at), TTL via expires_at. Keeping methods symmetric also keeps the
// handler shape symmetric.

// GenerateOpaqueToken returns a fresh (raw, sha256-hex) pair. 32 bytes = enough
// entropy that brute-forcing a single valid token is infeasible.
func GenerateOpaqueToken() (raw, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(b)
	h := sha256.Sum256([]byte(raw))
	hash = hex.EncodeToString(h[:])
	return
}

// HashOpaqueToken hashes a token presented by the client for table lookup.
// Defined separately so call sites read clearly.
func HashOpaqueToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// StorePasswordResetToken inserts a single-use token. Caller decides TTL.
func (r *Repo) StorePasswordResetToken(ctx context.Context, userID uuid.UUID, hash string, ttl time.Duration) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hash, time.Now().Add(ttl),
	)
	return err
}

// ConsumePasswordResetToken validates and atomically marks a reset token used,
// then updates the user's password hash — all in one transaction so a token
// cannot be replayed if multiple resets fire concurrently.
func (r *Repo) ConsumePasswordResetToken(ctx context.Context, hash, newPasswordHash string) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	var used *time.Time
	var expires time.Time
	err = tx.QueryRow(ctx,
		`SELECT user_id, used_at, expires_at FROM password_reset_tokens WHERE token_hash = $1 FOR UPDATE`,
		hash,
	).Scan(&userID, &used, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}
	if used != nil || time.Now().After(expires) {
		return uuid.Nil, ErrNotFound
	}
	if _, err := tx.Exec(ctx,
		`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1`, hash,
	); err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
		newPasswordHash, userID,
	); err != nil {
		return uuid.Nil, err
	}
	// Defence-in-depth: revoke every active refresh token for this user so a
	// stolen-cookie attacker can't keep a session past a password change.
	if _, err := tx.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now()
		 WHERE user_id = $1 AND revoked_at IS NULL`, userID,
	); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return userID, nil
}

// StoreEmailVerificationToken inserts a single-use verification token.
func (r *Repo) StoreEmailVerificationToken(ctx context.Context, userID uuid.UUID, hash string, ttl time.Duration) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hash, time.Now().Add(ttl),
	)
	return err
}

// ConsumeEmailVerificationToken marks the token used and flips email_verified_at.
func (r *Repo) ConsumeEmailVerificationToken(ctx context.Context, hash string) (uuid.UUID, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer tx.Rollback(ctx)

	var userID uuid.UUID
	var used *time.Time
	var expires time.Time
	err = tx.QueryRow(ctx,
		`SELECT user_id, used_at, expires_at FROM email_verification_tokens WHERE token_hash = $1 FOR UPDATE`,
		hash,
	).Scan(&userID, &used, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}
	if used != nil || time.Now().After(expires) {
		return uuid.Nil, ErrNotFound
	}
	if _, err := tx.Exec(ctx,
		`UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = $1`, hash,
	); err != nil {
		return uuid.Nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE users SET email_verified_at = now(), updated_at = now()
		 WHERE id = $1 AND email_verified_at IS NULL`, userID,
	); err != nil {
		return uuid.Nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return userID, nil
}

// pgErrCode extracts the SQLSTATE from a pgx error without importing pgconn at call sites.
func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
