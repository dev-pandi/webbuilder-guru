package auth

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const providerEID = "eid"

// EIDProfile — data profil e.id yang sudah dinormalisasi handler. Field
// kosong berarti tidak tersedia atau tidak lolos validasi kontak.
type EIDProfile struct {
	Email    string
	FullName string
	Phone    string
	Address  string
	Tier     int
}

// UpsertEIDUser — login sekaligus daftar. Urutan: identitas e.id yang sudah
// tertaut → user dengan email sama (ditautkan) → user baru tanpa password.
// Nama/HP/alamat dari e.id hanya mengisi kolom yang masih kosong supaya
// data kontak yang sudah diisi user tidak tertimpa.
func (r *Repo) UpsertEIDUser(ctx context.Context, p EIDProfile) (*User, error) {
	u, err := r.upsertEIDUser(ctx, p)
	// Dua login pertama yang bersamaan untuk email yang sama: yang kalah
	// kena unique violation, dan percobaan kedua akan menemukan baris pemenang.
	if pgErrCode(err) == "23505" {
		return r.upsertEIDUser(ctx, p)
	}
	return u, err
}

func (r *Repo) upsertEIDUser(ctx context.Context, p EIDProfile) (*User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var userID uuid.UUID
	err = tx.QueryRow(ctx,
		`SELECT user_id FROM user_identities WHERE provider = $1 AND subject = $2`,
		providerEID, p.Email,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, p.Email).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(ctx,
				`INSERT INTO users (email, password_hash, name) VALUES ($1, NULL, '') RETURNING id`,
				p.Email,
			).Scan(&userID)
		}
		if err != nil {
			return nil, err
		}
		if _, err = tx.Exec(ctx, `
			INSERT INTO user_identities (user_id, provider, subject, email, tier)
			VALUES ($1, $2, $3, $3, $4)`,
			userID, providerEID, p.Email, p.Tier,
		); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}

	var u User
	// Tier ≥ 1 = e.id sudah memverifikasi email/HP; tier 0 tetap boleh masuk,
	// hanya email-nya tidak ditandai terverifikasi.
	err = tx.QueryRow(ctx, `
		UPDATE users SET
			name         = CASE WHEN name = ''         THEN $2 ELSE name END,
			phone_number = CASE WHEN phone_number = '' THEN $3 ELSE phone_number END,
			address      = CASE WHEN address = ''      THEN $4 ELSE address END,
			email_verified_at = CASE WHEN email_verified_at IS NULL AND $5 >= 1
			                         THEN now() ELSE email_verified_at END,
			updated_at   = now()
		WHERE id = $1
		RETURNING `+scanUserCols,
		userID, p.FullName, p.Phone, p.Address, p.Tier,
	).Scan(scanUser(&u)...)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE user_identities SET tier = $3, last_login_at = now(), updated_at = now()
		WHERE provider = $1 AND subject = $2`,
		providerEID, p.Email, p.Tier,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &u, nil
}
