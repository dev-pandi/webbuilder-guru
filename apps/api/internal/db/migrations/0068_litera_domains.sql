-- +goose Up
-- Cache hostname yang sudah didaftarkan ke Litera CORS allowlist.
-- Tanpa ini kita tidak tahu domain mana yang sudah pernah di-register, dan
-- doc Litera melarang retry berulang saat 403 (>=5 dalam 10 menit =
-- AUTO_MINT_SUSPENDED yang hanya bisa dipulihkan manual via wallet signature).
CREATE TABLE IF NOT EXISTS litera_domains (
    hostname      TEXT PRIMARY KEY,
    status        TEXT NOT NULL DEFAULT 'pending',
    auto_approved BOOLEAN NOT NULL DEFAULT false,
    last_error    TEXT NOT NULL DEFAULT '',
    registered_at TIMESTAMPTZ,
    checked_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS litera_domains;
