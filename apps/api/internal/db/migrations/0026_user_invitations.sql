-- +goose Up
-- User invitations untuk 2 use case (plan-reseller-roles.md 4.3):
--   1. Reseller invite agent → agent buka link, set password, register user baru
--   2. Reseller/agent handoff site ke client → client buka link, activate akun
--
-- Token HMAC-signed (validate via issuer), simpan hash saja di DB (jangan
-- plaintext) — kalau DB leak, attacker tetap perlu HMAC secret untuk forge.
-- Expiry 7 hari (config, tapi default cukup untuk kirim email + reminder).

CREATE TABLE IF NOT EXISTS user_invitations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT NOT NULL,
        -- Simpan email supaya kalau target_user_id NULL (agent baru), kita tahu
        -- untuk siapa. Lowercase enforced di app layer.
    -- Peran user setelah accept
    invited_role   TEXT NOT NULL,
        -- 'agent' | 'client'
    -- Siapa yang invite
    invited_by     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Pre-created user (untuk client invite yang sudah punya row di users
    -- table sejak reseller create). NULL untuk agent invite (user baru
    -- di-buat saat accept).
    target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    -- SHA-256 hash dari token HMAC. Match saat accept.
    token_hash     TEXT NOT NULL UNIQUE,
    expires_at     TIMESTAMPTZ NOT NULL,
    accepted_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token_hash ON user_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_invitations_pending ON user_invitations(email, expires_at)
    WHERE accepted_at IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_user_invitations_pending;
DROP INDEX IF EXISTS idx_user_invitations_token_hash;
DROP INDEX IF EXISTS idx_user_invitations_email;
DROP TABLE IF EXISTS user_invitations;
