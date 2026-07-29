package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ResellerApplication — payload sign-up reseller. Field-nya subset dari User
// karena reseller mendaftar dengan email + password + info bisnis (bukan
// invite flow). Admin approve nanti = flip reseller_status ke 'active'.
type ResellerApplication struct {
	Email               string
	PasswordHash        string
	Name                string // nama PIC (contact person)
	ResellerDisplayName string // nama bisnis (mis. "PT Ceria Digital")
	PhoneNumber         string
	Address             string
	City                string
	State               string
	PostalCode          string
	Nik                 string
}

// CreateResellerApplication buat user baru dengan role='reseller' +
// reseller_status='pending_approval'. Admin harus explicit approve sebelum
// user bisa login (login handler cek status).
//
// Kalau email sudah exists (mis. sudah punya akun client atau reseller),
// return ErrEmailTaken — user harus pakai email lain atau contact support.
func (r *Repo) CreateResellerApplication(ctx context.Context, app ResellerApplication) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `
		INSERT INTO users
			(email, password_hash, name, role, reseller_status, reseller_display_name,
			 phone_number, address, city, state, postal_code, nik)
		VALUES
			($1, $2, $3, 'reseller', 'pending_approval', $4,
			 $5, $6, $7, $8, $9, $10)
		RETURNING `+scanUserCols,
		strings.ToLower(strings.TrimSpace(app.Email)),
		app.PasswordHash,
		strings.TrimSpace(app.Name),
		strings.TrimSpace(app.ResellerDisplayName),
		strings.TrimSpace(app.PhoneNumber),
		strings.TrimSpace(app.Address),
		strings.TrimSpace(app.City),
		strings.TrimSpace(app.State),
		strings.TrimSpace(app.PostalCode),
		strings.TrimSpace(app.Nik),
	).Scan(scanUser(&u)...)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return &u, nil
}

// SetResellerStatus flip reseller_status. Admin-callable only (enforce di
// handler layer). Kalau target bukan role='reseller', return ErrNotFound.
// Auto-set email_verified_at kalau move ke 'active' (admin approval = kita
// trust bisnis-nya legit, skip separate email verification).
func (r *Repo) SetResellerStatus(ctx context.Context, userID uuid.UUID, status string) (*User, error) {
	// Guard: valid status values only.
	switch status {
	case ResellerStatusPending, ResellerStatusActive, ResellerStatusSuspended:
	default:
		return nil, errors.New("invalid reseller status")
	}
	var u User
	err := r.pool.QueryRow(ctx, `
		UPDATE users
		   SET reseller_status  = $2,
		       email_verified_at = CASE
		           WHEN $2 = 'active' AND email_verified_at IS NULL THEN now()
		           ELSE email_verified_at
		       END,
		       updated_at        = now()
		 WHERE id = $1 AND role = 'reseller'
		 RETURNING `+scanUserCols,
		userID, status,
	).Scan(scanUser(&u)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// ResellerListFilter untuk admin panel filter.
type ResellerListFilter struct {
	Status string // '' = all, else ResellerStatusPending/Active/Suspended
	Search string // match email OR reseller_display_name (LIKE %search%)
	Limit  int
	Offset int
}

// ListResellers paginated. Admin-only. Return + total count.
func (r *Repo) ListResellers(ctx context.Context, f ResellerListFilter) ([]User, int, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 20
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	where := []string{"role = 'reseller'"}
	args := []any{}
	argIdx := 1
	if f.Status != "" {
		where = append(where, "reseller_status = $"+itoa(argIdx))
		args = append(args, f.Status)
		argIdx++
	}
	if s := strings.TrimSpace(f.Search); s != "" {
		like := "%" + strings.ToLower(s) + "%"
		where = append(where, "(LOWER(email) LIKE $"+itoa(argIdx)+" OR LOWER(reseller_display_name) LIKE $"+itoa(argIdx)+")")
		args = append(args, like)
		argIdx++
	}
	clause := " WHERE " + strings.Join(where, " AND ")

	// Count
	var total int
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users`+clause, countArgs...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Rows
	args = append(args, f.Limit, f.Offset)
	rows, err := r.pool.Query(ctx,
		`SELECT `+scanUserCols+` FROM users`+clause+
			` ORDER BY CASE reseller_status WHEN 'pending_approval' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, created_at DESC`+
			` LIMIT $`+itoa(argIdx)+` OFFSET $`+itoa(argIdx+1),
		args...,
	)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(scanUser(&u)...); err != nil {
			return nil, 0, err
		}
		out = append(out, u)
	}
	return out, total, rows.Err()
}

// GetResellerByID — admin lookup 1 reseller. Return ErrNotFound kalau id
// tidak ada atau user bukan role='reseller'.
func (r *Repo) GetResellerByID(ctx context.Context, id uuid.UUID) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx,
		`SELECT `+scanUserCols+` FROM users WHERE id = $1 AND role = 'reseller'`,
		id,
	).Scan(scanUser(&u)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

// itoa mini — hindari import strconv untuk 1 fungsi.
func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	// Fallback simple (kita tidak butuh > 99 di helper ini).
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}

// Guard time import.
var _ = time.Now

// ClientPlaceholder — payload untuk create client user oleh reseller/agent
// (Phase 2). User baru: password_hash='', email_verified_at=NULL, role='client'.
// User set password later via /invite/<token>.
type ClientPlaceholder struct {
	Email       string
	Name        string
	PhoneNumber string
	Address     string
	City        string
	State       string
	PostalCode  string
	Nik         string
}

// CreateClientPlaceholder insert row user role='client' dengan password kosong.
// Dipakai reseller/agent flow di mana client belum set password sendiri.
func (r *Repo) CreateClientPlaceholder(ctx context.Context, p ClientPlaceholder) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `
		INSERT INTO users
			(email, password_hash, name, role,
			 phone_number, address, city, state, postal_code, nik)
		VALUES
			($1, '', $2, 'client', $3, $4, $5, $6, $7, $8)
		RETURNING `+scanUserCols,
		strings.ToLower(strings.TrimSpace(p.Email)),
		strings.TrimSpace(p.Name),
		strings.TrimSpace(p.PhoneNumber),
		strings.TrimSpace(p.Address),
		strings.TrimSpace(p.City),
		strings.TrimSpace(p.State),
		strings.TrimSpace(p.PostalCode),
		strings.TrimSpace(p.Nik),
	).Scan(scanUser(&u)...)
	if err != nil {
		if pgErrCode(err) == "23505" {
			return nil, ErrEmailTaken
		}
		return nil, err
	}
	return &u, nil
}
