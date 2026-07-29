-- +goose Up
-- Site collaborator ACL (plan-reseller-roles.md 4.5).
--
-- Use case:
--   1. Reseller/agent editor akses ke site milik client (post-handoff)
--   2. Future: team roles (owner + editor + viewer di 1 site milik satu user)
--
-- Backward compat: seed row 'owner' untuk semua existing sites — supaya query
-- yang pakai site_members buat check ownership tetap match old data.

CREATE TABLE IF NOT EXISTS site_members (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id    UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       TEXT NOT NULL,
        -- 'owner'  → sites.user_id, exactly one per site
        -- 'editor' → full edit access (block editor, publish, dst.)
        -- 'viewer' → read-only (future for analytics dashboards)
    added_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_site_members_user_id ON site_members(user_id);
CREATE INDEX IF NOT EXISTS idx_site_members_role ON site_members(site_id, role);

-- Seed 'owner' rows dari semua sites existing supaya query yang JOIN
-- site_members bisa langsung match. Idempotent — ON CONFLICT DO NOTHING
-- kalau migration re-run.
INSERT INTO site_members (site_id, user_id, role, added_at)
    SELECT id, user_id, 'owner', created_at
      FROM sites
     WHERE NOT EXISTS (
        SELECT 1 FROM site_members sm
         WHERE sm.site_id = sites.id AND sm.user_id = sites.user_id
     );

-- +goose Down
DROP INDEX IF EXISTS idx_site_members_role;
DROP INDEX IF EXISTS idx_site_members_user_id;
DROP TABLE IF EXISTS site_members;
