-- +goose Up
-- domain_purchases — local tracker per user checkout attempt untuk beli domain.
-- Mirror shallow dari registrar_domain_jobs di registrar-api; source of truth
-- untuk status tetap di registrar-api, kolom local dipakai untuk:
--   - link ke sites.id setelah user create situs
--   - filter "domain sudah saya beli" tanpa hit registrar API tiap request
--   - webhook idempotency (satu job_id hanya boleh diproses sekali)
CREATE TABLE IF NOT EXISTS domain_purchases (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id          UUID REFERENCES sites(id) ON DELETE SET NULL,
    -- job_id dari registrar-api (job_<hex>), unique per (registrar, job_id).
    -- Karena web builder hanya bicara ke satu registrar, unique global aman.
    registrar_job_id TEXT NOT NULL UNIQUE,
    domain           TEXT NOT NULL,
    years            INT NOT NULL DEFAULT 1,
    status           TEXT NOT NULL DEFAULT 'pending_payment',
    reason           TEXT NOT NULL DEFAULT '',
    payment_method   TEXT NOT NULL DEFAULT '',
    payment_url      TEXT NOT NULL DEFAULT '',
    -- expires_at = tanggal domain hangus di registry (set setelah status=active).
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_domain_purchases_user_id ON domain_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_domain_purchases_status ON domain_purchases(status);

-- +goose Down
DROP TABLE IF EXISTS domain_purchases;
