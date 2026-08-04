-- +goose Up
-- wallet_topups: add payment_url + instructions kolom.
-- 0043 sudah include kolom ini, tapi DB yang sudah apply 0043 sebelum edit
-- tidak dapet. ALTER IF NOT EXISTS bikin idempotent — no-op untuk fresh
-- install, apply untuk legacy.
ALTER TABLE wallet_topups
    ADD COLUMN IF NOT EXISTS payment_url  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS instructions TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE wallet_topups
    DROP COLUMN IF EXISTS instructions,
    DROP COLUMN IF EXISTS payment_url;
