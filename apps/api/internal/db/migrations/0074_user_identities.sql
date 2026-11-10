-- Identitas login dari penyedia eksternal (saat ini e.id). Tabel umum,
-- bukan kolom oauth_<provider>_sub per penyedia seperti Google di 0009.
-- subject = ID dari penyedia; e.id belum mengirim ID permanen, jadi sementara
-- diisi email dan cukup diganti tanpa mengubah skema kalau ID-nya tersedia.

-- +goose Up
CREATE TABLE IF NOT EXISTS user_identities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider      TEXT NOT NULL,
    subject       TEXT NOT NULL,
    email         TEXT NOT NULL DEFAULT '',
    tier          INT,
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities (user_id);

-- +goose Down
DROP TABLE IF EXISTS user_identities;
