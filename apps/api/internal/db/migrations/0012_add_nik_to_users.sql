-- +goose Up
-- NIK dibutuhkan untuk registrasi domain .id (WHOIS/EPP contact object).
-- Default '' supaya user existing tidak perlu backfill; wajib diisi hanya
-- saat user hendak beli .id domain (dicek di purchase handler).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nik TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS nik;
