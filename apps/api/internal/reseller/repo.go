// Package reseller — repo + handler untuk operasi reseller/agent portal.
// Data isolation: semua query wajib scope by manager_id (reseller/agent yang
// login) supaya cross-tenant leak tidak mungkin.
package reseller

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ClientAssignment — 1 row client_assignments.
type ClientAssignment struct {
	ID           uuid.UUID
	ManagerID    uuid.UUID
	ClientID     uuid.UUID
	ManagerRole  string // 'reseller' | 'agent'
	AccessStatus string // 'setup' | 'active' | 'revoked'
	CreatedAt    time.Time
	HandedOffAt  *time.Time
	RevokedAt    *time.Time
}

// ClientRow — payload untuk list-clients query dengan JOIN users (biar
// frontend bisa langsung display email + nama tanpa second-fetch).
type ClientRow struct {
	Assignment ClientAssignment
	Email      string
	Name       string
	CreatedAt  time.Time
	EmailVerified bool
}

// AgentRow — payload untuk list-agents. Agent = user role='agent' yang
// parent_reseller_id-nya = reseller yang login.
type AgentRow struct {
	ID              uuid.UUID
	Email           string
	Name            string
	CreatedAt       time.Time
	EmailVerifiedAt *time.Time
}

type Repo struct{ pool *pgxpool.Pool }

func NewRepo(p *pgxpool.Pool) *Repo { return &Repo{pool: p} }

var ErrNotFound = errors.New("not found")

// CreateAssignment insert 1 row (manager → client). UNIQUE constraint di DB
// prevent duplicate; kalau conflict return ErrAlreadyAssigned.
var ErrAlreadyAssigned = errors.New("client already assigned to this manager")

// AccessStatus constants — mirror string enum di DB.
const (
	AccessStatusSetup   = "setup"
	AccessStatusActive  = "active"
	AccessStatusRevoked = "revoked"
)

func (r *Repo) CreateAssignment(ctx context.Context, managerID, clientID uuid.UUID, managerRole string) (*ClientAssignment, error) {
	var a ClientAssignment
	err := r.pool.QueryRow(ctx, `
		INSERT INTO client_assignments (manager_id, client_id, manager_role, access_status)
		VALUES ($1, $2, $3, 'setup')
		RETURNING id, manager_id, client_id, manager_role, access_status, created_at, handed_off_at, revoked_at
	`, managerID, clientID, managerRole).Scan(
		&a.ID, &a.ManagerID, &a.ClientID, &a.ManagerRole, &a.AccessStatus,
		&a.CreatedAt, &a.HandedOffAt, &a.RevokedAt,
	)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return nil, ErrAlreadyAssigned
		}
		return nil, err
	}
	return &a, nil
}

// HasActiveAssignment — implementasi interface `domain_purchase.AssignmentChecker`.
// Return nil kalau valid, error non-nil (ErrNotFound) kalau tidak ada.
func (r *Repo) HasActiveAssignment(ctx context.Context, managerID, clientID uuid.UUID) error {
	_, err := r.FindActiveAssignmentBetween(ctx, managerID, clientID)
	return err
}

// FindActiveAssignmentBetween cek apakah managerID benar mengelola clientID.
// Return ErrNotFound kalau tidak ada / sudah revoked. Access status 'setup'
// (belum accept invite) tetap dianggap valid — reseller boleh beli domain
// duluan sebelum client aktifkan akun.
func (r *Repo) FindActiveAssignmentBetween(ctx context.Context, managerID, clientID uuid.UUID) (*ClientAssignment, error) {
	var a ClientAssignment
	err := r.pool.QueryRow(ctx, `
		SELECT id, manager_id, client_id, manager_role, access_status, created_at, handed_off_at, revoked_at
		  FROM client_assignments
		 WHERE manager_id = $1 AND client_id = $2 AND access_status != 'revoked'
		 ORDER BY created_at DESC LIMIT 1
	`, managerID, clientID).Scan(
		&a.ID, &a.ManagerID, &a.ClientID, &a.ManagerRole, &a.AccessStatus,
		&a.CreatedAt, &a.HandedOffAt, &a.RevokedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &a, err
}

// FindActiveAssignment cari assignment (client_id ke manager_id apapun).
// Dipakai check "email client sudah managed reseller lain?" — kalau ada
// dan bukan self, return conflict.
func (r *Repo) FindActiveAssignmentByClient(ctx context.Context, clientID uuid.UUID) (*ClientAssignment, error) {
	var a ClientAssignment
	err := r.pool.QueryRow(ctx, `
		SELECT id, manager_id, client_id, manager_role, access_status, created_at, handed_off_at, revoked_at
		  FROM client_assignments
		 WHERE client_id = $1 AND access_status != 'revoked'
		 ORDER BY created_at DESC LIMIT 1
	`, clientID).Scan(
		&a.ID, &a.ManagerID, &a.ClientID, &a.ManagerRole, &a.AccessStatus,
		&a.CreatedAt, &a.HandedOffAt, &a.RevokedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &a, err
}

// ListClientsByManager — reseller/agent lihat klien yang mereka kelola.
// Filter status 'setup'/'active' default (exclude revoked).
func (r *Repo) ListClientsByManager(ctx context.Context, managerID uuid.UUID) ([]ClientRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT ca.id, ca.manager_id, ca.client_id, ca.manager_role, ca.access_status,
		       ca.created_at, ca.handed_off_at, ca.revoked_at,
		       u.email, u.name, u.created_at, u.email_verified_at IS NOT NULL
		  FROM client_assignments ca
		  JOIN users u ON u.id = ca.client_id
		 WHERE ca.manager_id = $1 AND ca.access_status != 'revoked'
		 ORDER BY ca.created_at DESC
	`, managerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ClientRow
	for rows.Next() {
		var r ClientRow
		if err := rows.Scan(
			&r.Assignment.ID, &r.Assignment.ManagerID, &r.Assignment.ClientID,
			&r.Assignment.ManagerRole, &r.Assignment.AccessStatus,
			&r.Assignment.CreatedAt, &r.Assignment.HandedOffAt, &r.Assignment.RevokedAt,
			&r.Email, &r.Name, &r.CreatedAt, &r.EmailVerified,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListAgentsByReseller — reseller lihat agent yang di bawah mereka.
// Filter opsional pending (belum email_verified = belum accept invite).
func (r *Repo) ListAgentsByReseller(ctx context.Context, resellerID uuid.UUID) ([]AgentRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, email, name, created_at, email_verified_at
		  FROM users
		 WHERE role = 'agent' AND parent_reseller_id = $1
		 ORDER BY created_at DESC
	`, resellerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AgentRow
	for rows.Next() {
		var a AgentRow
		if err := rows.Scan(&a.ID, &a.Email, &a.Name, &a.CreatedAt, &a.EmailVerifiedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// pgErrCode helper — reuse pattern dari auth package.
func pgErrCode(err error) string {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState()
	}
	return ""
}
