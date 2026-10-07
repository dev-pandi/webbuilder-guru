-- +goose Up
-- Step 3 of DNS multi-provider: rename Cloudflare-specific tracking columns
-- on registered_domains to generic DNS names, and add dns_provider +
-- dns_provider_config_id so the purchase flow can route to the admin-chosen
-- backend (not just CF).
--
-- Semantics unchanged:
--  - cf_attach_status  → dns_attach_status  (pending|success|failed|skipped)
--  - cf_attach_error   → dns_attach_error
--  - cf_attach_at      → dns_attach_at
--  - cf_zone_id        → dns_zone_id
--
-- New columns:
--  - dns_provider          : which backend owns the attachment ('cloudflare' default for existing rows)
--  - dns_provider_config_id: sticky FK — reconciler + retry use the same config as the original attach
ALTER TABLE registered_domains
    RENAME COLUMN cf_attach_status TO dns_attach_status;
ALTER TABLE registered_domains
    RENAME COLUMN cf_attach_error TO dns_attach_error;
ALTER TABLE registered_domains
    RENAME COLUMN cf_attach_at TO dns_attach_at;
ALTER TABLE registered_domains
    RENAME COLUMN cf_zone_id TO dns_zone_id;

ALTER TABLE registered_domains
    ADD COLUMN IF NOT EXISTS dns_provider TEXT NOT NULL DEFAULT 'cloudflare'
        CHECK (dns_provider IN ('cloudflare','dnscloud'));

ALTER TABLE registered_domains
    ADD COLUMN IF NOT EXISTS dns_provider_config_id UUID
        REFERENCES dns_provider_configs(id) ON DELETE SET NULL;

-- Rename the index to match the new column name. Keep the same filter.
DROP INDEX IF EXISTS idx_registered_domains_cf_status;
CREATE INDEX IF NOT EXISTS idx_registered_domains_dns_status
    ON registered_domains(dns_attach_status)
    WHERE dns_attach_status IN ('failed', 'pending');

-- Backfill dns_provider_config_id for existing rows that successfully
-- attached to CF: point to the default CF config so retry/reconciler can
-- find the same account.
UPDATE registered_domains SET dns_provider_config_id = (
    SELECT id FROM dns_provider_configs
     WHERE kind = 'cloudflare' AND is_default = true
     LIMIT 1
)
WHERE dns_provider_config_id IS NULL
  AND dns_zone_id <> '';

CREATE INDEX IF NOT EXISTS ix_registered_domains_provider_config
    ON registered_domains(dns_provider_config_id)
    WHERE dns_provider_config_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS ix_registered_domains_provider_config;
DROP INDEX IF EXISTS idx_registered_domains_dns_status;
CREATE INDEX IF NOT EXISTS idx_registered_domains_cf_status
    ON registered_domains(dns_attach_status)
    WHERE dns_attach_status IN ('failed', 'pending');
ALTER TABLE registered_domains DROP COLUMN IF EXISTS dns_provider_config_id;
ALTER TABLE registered_domains DROP COLUMN IF EXISTS dns_provider;
ALTER TABLE registered_domains RENAME COLUMN dns_zone_id TO cf_zone_id;
ALTER TABLE registered_domains RENAME COLUMN dns_attach_at TO cf_attach_at;
ALTER TABLE registered_domains RENAME COLUMN dns_attach_error TO cf_attach_error;
ALTER TABLE registered_domains RENAME COLUMN dns_attach_status TO cf_attach_status;
