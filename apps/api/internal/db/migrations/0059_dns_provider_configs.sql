-- +goose Up
-- Step 2 of DNS multi-provider: introduce the unified provider config table.
-- Keeps `cloudflare_configs` alive (vestigial) so the existing cloudflare.Repo
-- continues to work until Step 5 wires the new dns_providers package.
--
-- Model:
--  - `kind` identifies the backend (cloudflare | dnscloud).
--  - `priority` orders active configs during factory resolution (lower first).
--  - `is_active` toggles enablement without delete (preserves audit + lets
--    operator gracefully drain by disabling but keeping existing zones).
--  - `is_default` kept for backward-compat with existing CF single-default
--    semantics. Partial unique index enforces one default PER KIND, not
--    globally — operator can mark one default CF and one default DNSCloud.
CREATE TABLE IF NOT EXISTS dns_provider_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            TEXT NOT NULL CHECK (kind IN ('cloudflare','dnscloud')),
    name            TEXT NOT NULL,
    api_token       TEXT NOT NULL,
    account_id      TEXT NOT NULL DEFAULT '',   -- CF: account UUID; DNSCloud: empty
    is_default      BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    priority        INTEGER NOT NULL DEFAULT 100,
    zone_quota      INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited; soft cap for alert
    zones_count     INTEGER NOT NULL DEFAULT 0, -- cached; synced periodically
    last_health_at  TIMESTAMPTZ,
    last_health_ok  BOOLEAN,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One default PER KIND, not global. Lets operator mark default-CF +
-- default-DNSCloud independently; factory's priority logic picks across kinds.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dns_provider_configs_default_per_kind
    ON dns_provider_configs (kind) WHERE is_default = true;

-- Factory lookup: order by priority within the active set. Filtered partial
-- index keeps the hot path small (admin rarely marks configs inactive).
CREATE INDEX IF NOT EXISTS ix_dns_provider_configs_priority
    ON dns_provider_configs (priority) WHERE is_active = true;

-- Backfill from existing cloudflare_configs. Default CF config gets priority=1
-- so it keeps winning factory resolution until operator sets up DNSCloud.
-- Non-default CF rows get priority=100 (effectively "available if default
-- unhealthy", though Step 1 factory ignores priority yet).
INSERT INTO dns_provider_configs (
    id, kind, name, api_token, account_id,
    is_default, is_active, priority,
    created_at, updated_at
)
SELECT
    id, 'cloudflare', name, api_token, account_id,
    is_default, true,
    CASE WHEN is_default THEN 1 ELSE 100 END,
    created_at, updated_at
FROM cloudflare_configs
ON CONFLICT (id) DO NOTHING;

-- --- site_byo_domains: generic DNS fields -----------------------------------
-- Rename the Cloudflare-specific column to its generic name. All existing
-- rows (none in prod yet, but migration is idempotent for staging) keep their
-- data. Field name in Go struct updated in Step 2 code changes.
ALTER TABLE site_byo_domains
    RENAME COLUMN cloudflare_zone_id TO dns_zone_id;

-- Which backend owns this row's zone. Must be set BEFORE delete routing can
-- pick the right adapter; stored at create time, immutable thereafter (switch
-- provider = delete + re-connect per product decision).
ALTER TABLE site_byo_domains
    ADD COLUMN IF NOT EXISTS dns_provider TEXT NOT NULL DEFAULT 'cloudflare'
        CHECK (dns_provider IN ('cloudflare','dnscloud'));

-- Sticky config id — factory must resolve to THIS exact config for lifecycle
-- ops on this row. Priority changes do NOT migrate zones to different accounts.
-- Nullable because older rows (pre-Step 2) have no explicit config; factory
-- treats NULL as "use any active config of the right kind".
ALTER TABLE site_byo_domains
    ADD COLUMN IF NOT EXISTS dns_provider_config_id UUID
        REFERENCES dns_provider_configs(id) ON DELETE SET NULL;

-- Backfill: existing BYO rows (if any) were created via CF default config.
UPDATE site_byo_domains SET dns_provider_config_id = (
    SELECT id FROM dns_provider_configs
     WHERE kind = 'cloudflare' AND is_default = true
     LIMIT 1
)
WHERE dns_provider_config_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_site_byo_domains_provider_config
    ON site_byo_domains (dns_provider_config_id)
    WHERE dns_provider_config_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS ix_site_byo_domains_provider_config;
ALTER TABLE site_byo_domains DROP COLUMN IF EXISTS dns_provider_config_id;
ALTER TABLE site_byo_domains DROP COLUMN IF EXISTS dns_provider;
ALTER TABLE site_byo_domains RENAME COLUMN dns_zone_id TO cloudflare_zone_id;
DROP INDEX IF EXISTS ix_dns_provider_configs_priority;
DROP INDEX IF EXISTS uq_dns_provider_configs_default_per_kind;
DROP TABLE IF EXISTS dns_provider_configs;
