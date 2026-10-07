-- +goose Up
-- site_byo_domains — BYO .id domains attached to a site via Cloudflare NS
-- delegation. Separate from the legacy `domains` table (manual A record +
-- Caddy ACME) so the new NS-only flow doesn't carry the old assumptions.
--
-- Lifecycle: pending → verified → (drifting → suspended → disconnected) /
--            (expired). See internal/site_byo_domains/machine.go.
--
-- Model: at most 1 BYO per site (ux_site_byo_domains_site). Site primary
-- hostname (sites.primary_hostname) selects which of the anchor purchased
-- domain OR this BYO row serves canonical content; the other 301-redirects.
CREATE TABLE IF NOT EXISTS site_byo_domains (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hostname               TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','verified','drifting',
                                                'suspended','disconnected','expired')),

    -- Cloudflare zone metadata — populated at /connect time, cleared on delete.
    cloudflare_zone_id     TEXT NOT NULL DEFAULT '',
    assigned_ns            TEXT[] NOT NULL DEFAULT '{}',

    -- Lifecycle timestamps.
    expires_at             TIMESTAMPTZ,              -- from WHOIS, refreshed daily
    last_whois_at          TIMESTAMPTZ,
    last_health_at         TIMESTAMPTZ,              -- last NS lookup attempt
    verified_at            TIMESTAMPTZ,
    drift_detected_at      TIMESTAMPTZ,              -- when NS un-delegation first noticed
    suspended_at           TIMESTAMPTZ,
    disconnected_at        TIMESTAMPTZ,
    expiry_notice_sent_at  TIMESTAMPTZ,              -- dedupe + resend cooldown

    -- Audit: reseller/agent who attached on behalf of user.
    assigned_by            UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hostname is globally unique: one .id → at most one site (either purchased
-- anchor via registered_domains, or BYO here — enforced at handler layer).
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_byo_domains_hostname
    ON site_byo_domains(hostname);

-- Max 1 BYO per site. If future UX needs multiple aliases, drop this + add
-- is_primary partial unique.
CREATE UNIQUE INDEX IF NOT EXISTS ux_site_byo_domains_site
    ON site_byo_domains(site_id);

CREATE INDEX IF NOT EXISTS ix_site_byo_domains_user
    ON site_byo_domains(user_id);

CREATE INDEX IF NOT EXISTS ix_site_byo_domains_status
    ON site_byo_domains(status);

-- Scanner-friendly indexes for notifier + reconciler goroutines.
CREATE INDEX IF NOT EXISTS ix_site_byo_domains_expires
    ON site_byo_domains(expires_at)
    WHERE expires_at IS NOT NULL AND status IN ('verified','drifting');

CREATE INDEX IF NOT EXISTS ix_site_byo_domains_health
    ON site_byo_domains(last_health_at)
    WHERE status IN ('pending','verified','drifting','suspended');

-- sites.primary_hostname — explicit canonical host for the site. NULL means
-- "use the purchased anchor's hostname" (back-compat default). Renderer uses
-- this to decide which host serves content vs 301-redirects.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS primary_hostname TEXT;

-- +goose Down
ALTER TABLE sites DROP COLUMN IF EXISTS primary_hostname;
DROP TABLE IF EXISTS site_byo_domains;
