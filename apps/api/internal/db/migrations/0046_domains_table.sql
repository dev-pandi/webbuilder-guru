-- +goose Up
-- registered_domains — current-state per-domain aggregate untuk domain
-- yang di-register via EPP. Terpisah dari:
--   - domain_purchases (transaction log)
--   - domains (custom hostname mapping / SSL, di 0001_init.sql)
--
-- Rationale:
--   - 1 domain = 1 row (bukan double kalau ada register + renew)
--   - Query "list domain aktif user" tidak perlu dedupe di caller
--   - Field yang jarang berubah (expires_at, contact_id) di-cache di sini
--     supaya list page tidak butuh live EPP fetch per baris
--
-- domain_purchases tetap authoritative untuk history (register, renew,
-- transfer, cancel — semua transaksi tercatat di sana).
CREATE TABLE IF NOT EXISTS registered_domains (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purchased_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    name              TEXT NOT NULL UNIQUE,       -- FQDN lowercase, global unique
    contact_id        TEXT NOT NULL DEFAULT '',   -- EPP registrant handle (WB0000...)
    expires_at        TIMESTAMPTZ,
    registered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_renewed_at   TIMESTAMPTZ,
    status            TEXT NOT NULL DEFAULT 'active',
    site_id           UUID REFERENCES sites(id) ON DELETE SET NULL,
    registrar_job_id  TEXT NOT NULL DEFAULT '',   -- register job canonical
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registered_domains_user_id
    ON registered_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_registered_domains_purchased_by
    ON registered_domains(purchased_by) WHERE purchased_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_registered_domains_expiry
    ON registered_domains(expires_at) WHERE status = 'active';

-- Backfill dari domain_purchases existing. Ambil register row per-domain
-- (source of registered_at), lalu overlay expires_at dari renew terakhir
-- kalau ada (subquery).
INSERT INTO registered_domains (
    user_id, purchased_by, name, expires_at, registered_at,
    status, site_id, registrar_job_id, created_at, updated_at
)
SELECT DISTINCT ON (dp.domain)
    dp.user_id,
    dp.purchased_by,
    dp.domain,
    (
        SELECT expires_at FROM domain_purchases dpx
         WHERE dpx.domain = dp.domain
           AND dpx.status = 'active'
           AND dpx.expires_at IS NOT NULL
         ORDER BY dpx.expires_at DESC LIMIT 1
    ) AS expires_at,
    dp.created_at AS registered_at,
    dp.status,
    dp.site_id,
    dp.registrar_job_id,
    dp.created_at,
    dp.updated_at
FROM domain_purchases dp
WHERE dp.kind = 'register' AND dp.status = 'active'
ON CONFLICT (name) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS registered_domains;
