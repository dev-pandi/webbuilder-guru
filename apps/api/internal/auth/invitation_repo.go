package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Invitation — 1 row user_invitations. Token raw hanya di-return saat Create
// (untuk email link); subsequent lookups pakai hash comparison.
type Invitation struct {
	ID           uuid.UUID
	Email        string
	InvitedRole  string     // 'agent' | 'client'
	InvitedBy    uuid.UUID
	TargetUserID *uuid.UUID // NULL untuk agent invite (user baru); non-nil untuk client invite
	TokenHash    string
	ExpiresAt    time.Time
	AcceptedAt   *time.Time
	CreatedAt    time.Time
}

// CreateInvitation issue token + insert row. Return raw token (untuk email)
// + Invitation struct (hash-only, buat audit).
//
// TTL default 7 hari — cukup untuk kirim email + reminder. Kalau expired,
// user request ulang via reseller portal (bikin invitation baru).
func (r *Repo) CreateInvitation(
	ctx context.Context,
	email, invitedRole string,
	invitedBy uuid.UUID,
	targetUserID *uuid.UUID,
	ttl time.Duration,
) (string, *Invitation, error) {
	if ttl <= 0 {
		ttl = 7 * 24 * time.Hour
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", nil, errors.New("email wajib")
	}
	switch invitedRole {
	case RoleAgent, RoleClient:
	default:
		return "", nil, errors.New("invited_role harus 'agent' atau 'client'")
	}

	raw, hash, err := GenerateOpaqueToken()
	if err != nil {
		return "", nil, err
	}

	var inv Invitation
	err = r.pool.QueryRow(ctx, `
		INSERT INTO user_invitations (email, invited_role, invited_by, target_user_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, email, invited_role, invited_by, target_user_id, token_hash, expires_at, accepted_at, created_at
	`, email, invitedRole, invitedBy, targetUserID, hash, time.Now().Add(ttl)).Scan(
		&inv.ID, &inv.Email, &inv.InvitedRole, &inv.InvitedBy, &inv.TargetUserID,
		&inv.TokenHash, &inv.ExpiresAt, &inv.AcceptedAt, &inv.CreatedAt,
	)
	if err != nil {
		return "", nil, err
	}
	return raw, &inv, nil
}

// FindInvitationByToken lookup via token hash. Return ErrNotFound kalau tidak
// ada / accepted / expired. Kita treat semua kondisi "invalid" sama supaya
// tidak leak info (token valid tapi expired vs token invalid).
func (r *Repo) FindInvitationByToken(ctx context.Context, rawToken string) (*Invitation, error) {
	hash := HashOpaqueToken(rawToken)
	var inv Invitation
	err := r.pool.QueryRow(ctx, `
		SELECT id, email, invited_role, invited_by, target_user_id, token_hash, expires_at, accepted_at, created_at
		  FROM user_invitations
		 WHERE token_hash = $1
		   AND accepted_at IS NULL
		   AND expires_at > now()
	`, hash).Scan(
		&inv.ID, &inv.Email, &inv.InvitedRole, &inv.InvitedBy, &inv.TargetUserID,
		&inv.TokenHash, &inv.ExpiresAt, &inv.AcceptedAt, &inv.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &inv, err
}

// AcceptInvitationTx — atomically:
//  1. Validate token (via hash) — reject kalau accepted/expired/tidak ada
//  2. Create/update user dengan password + role sesuai invited_role
//  3. Mark invitation accepted_at
//
// Untuk agent invite (target_user_id NULL): buat user baru dengan
// role='agent', parent_reseller_id=invited_by.
//
// Untuk client invite (target_user_id != NULL): update existing user
// dengan password (user sudah di-created di CreateClient flow, cuma set
// password + verify email + activate).
//
// Return user_id yang siap login.
func (r *Repo) AcceptInvitationTx(ctx context.Context, rawToken, passwordHash, name string) (uuid.UUID, string, error) {
	hash := HashOpaqueToken(rawToken)
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, "", err
	}
	defer tx.Rollback(ctx)

	var inv Invitation
	err = tx.QueryRow(ctx, `
		SELECT id, email, invited_role, invited_by, target_user_id, expires_at, accepted_at
		  FROM user_invitations
		 WHERE token_hash = $1 FOR UPDATE
	`, hash).Scan(&inv.ID, &inv.Email, &inv.InvitedRole, &inv.InvitedBy, &inv.TargetUserID, &inv.ExpiresAt, &inv.AcceptedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, "", ErrNotFound
	}
	if err != nil {
		return uuid.Nil, "", err
	}
	if inv.AcceptedAt != nil {
		return uuid.Nil, "", errors.New("undangan sudah pernah diterima")
	}
	if time.Now().After(inv.ExpiresAt) {
		return uuid.Nil, "", errors.New("undangan sudah kadaluarsa")
	}

	var userID uuid.UUID

	if inv.TargetUserID != nil {
		// Client invite path — user existing, set password + activate.
		if _, err := tx.Exec(ctx, `
			UPDATE users
			   SET password_hash    = $2,
			       email_verified_at = COALESCE(email_verified_at, now()),
			       name              = CASE WHEN name = '' THEN $3 ELSE name END,
			       updated_at        = now()
			 WHERE id = $1
		`, *inv.TargetUserID, passwordHash, strings.TrimSpace(name)); err != nil {
			return uuid.Nil, "", err
		}
		userID = *inv.TargetUserID
	} else {
		// Agent invite path — user baru. Role='agent', parent=invited_by.
		if inv.InvitedRole != RoleAgent {
			return uuid.Nil, "", errors.New("target_user_id kosong hanya boleh untuk agent invite")
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, name, role, parent_reseller_id, email_verified_at)
			VALUES ($1, $2, $3, 'agent', $4, now())
			RETURNING id
		`, inv.Email, passwordHash, strings.TrimSpace(name), inv.InvitedBy).Scan(&userID)
		if err != nil {
			if pgErrCode(err) == "23505" {
				return uuid.Nil, "", ErrEmailTaken
			}
			return uuid.Nil, "", err
		}
	}

	// Mark invitation accepted
	if _, err := tx.Exec(ctx,
		`UPDATE user_invitations SET accepted_at = now() WHERE id = $1`, inv.ID,
	); err != nil {
		return uuid.Nil, "", err
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, "", err
	}
	return userID, inv.InvitedRole, nil
}

// ListPendingInvitationsByInviter — reseller lihat pending invites yang
// mereka kirim (agent atau client). Filter role optional ('agent' | 'client').
func (r *Repo) ListPendingInvitationsByInviter(
	ctx context.Context, inviterID uuid.UUID, role string,
) ([]Invitation, error) {
	q := `SELECT id, email, invited_role, invited_by, target_user_id, token_hash, expires_at, accepted_at, created_at
	        FROM user_invitations
	       WHERE invited_by = $1
	         AND accepted_at IS NULL
	         AND expires_at > now()`
	args := []any{inviterID}
	if role != "" {
		q += " AND invited_role = $2"
		args = append(args, role)
	}
	q += " ORDER BY created_at DESC"

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Invitation
	for rows.Next() {
		var inv Invitation
		if err := rows.Scan(
			&inv.ID, &inv.Email, &inv.InvitedRole, &inv.InvitedBy, &inv.TargetUserID,
			&inv.TokenHash, &inv.ExpiresAt, &inv.AcceptedAt, &inv.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

// RevokeInvitation cabut invitation belum-accepted. Dipakai kalau reseller
// mau batalkan invite (mis. email salah). Idempotent — return nil kalau
// tidak ada / sudah accepted.
func (r *Repo) RevokeInvitation(ctx context.Context, id, inviterID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		DELETE FROM user_invitations
		 WHERE id = $1 AND invited_by = $2 AND accepted_at IS NULL
	`, id, inviterID)
	return err
}
