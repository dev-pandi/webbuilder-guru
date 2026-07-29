-- +goose Up
-- Email log — audit trail untuk debugging email delivery. Wrap mailer sender
-- + insert 1 row per Send() attempt (sukses ATAU gagal).
--
-- Retention: append-only, tidak ada DELETE dari API. Purge manual kalau
-- sudah > 100k rows (SQL manual). Untuk MVP tidak perlu partition.
--
-- Sensitive: body email BISA berisi token reset password / OTP. Access
-- hanya untuk admin, dan log ini di-purge lebih agresif kalau perlu.

CREATE TABLE IF NOT EXISTS email_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_address   TEXT NOT NULL,
    subject      TEXT NOT NULL,
    body_preview TEXT NOT NULL DEFAULT '',   -- 500 char pertama supaya dashboard cepat
    driver       TEXT NOT NULL,               -- 'log' | 'smtp'
    status       TEXT NOT NULL,               -- 'sent' | 'failed'
    error        TEXT NOT NULL DEFAULT '',
    duration_ms  INT  NOT NULL DEFAULT 0,     -- untuk detect SMTP hang
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index utama: paginated timeline DESC.
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at DESC);
-- Filter by status (dashboard tab "gagal saja").
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status, created_at DESC);
-- Filter by recipient (support "kenapa email si X tidak masuk?").
CREATE INDEX IF NOT EXISTS idx_email_log_to ON email_log(LOWER(to_address), created_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_email_log_to;
DROP INDEX IF EXISTS idx_email_log_status;
DROP INDEX IF EXISTS idx_email_log_created_at;
DROP TABLE IF EXISTS email_log;
