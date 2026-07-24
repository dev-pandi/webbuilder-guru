-- +goose Up
-- Cloudflare account config — dipakai untuk auto-attach domain baru ke
-- Cloudflare (create zone + push assigned NS ke registrar) sehingga
-- domain langsung online + di-CDN + di-SSL tanpa manual setup user.
--
-- Multi-config supported (mis. beberapa akun CF untuk load balancing atau
-- billing separation). `is_default=true` di-pick otomatis saat auto-attach.
-- Unique partial index memastikan hanya SATU config default aktif.
--
-- api_token disimpan plain text — konsisten dengan REGISTRAR_API_KEY yang
-- juga plain di env. Akses restricted via admin route + JWT role=admin.
CREATE TABLE IF NOT EXISTS cloudflare_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    api_token   TEXT NOT NULL,
    account_id  TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cloudflare_configs_default
    ON cloudflare_configs (is_default) WHERE is_default = true;

-- +goose Down
DROP INDEX IF EXISTS uq_cloudflare_configs_default;
DROP TABLE IF EXISTS cloudflare_configs;
