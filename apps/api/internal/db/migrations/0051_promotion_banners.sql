-- +goose Up

-- promotion_banners: Ruang Promosi Guru. Spec §11 & §27.
--   - teacher_active: dikontrol guru (toggle di dashboard)
--   - admin_enabled: dikontrol admin (override platform-level)
-- Effective visible = teacher_active AND admin_enabled AND period valid.

CREATE TABLE IF NOT EXISTS promotion_banners (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    owner_user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    internal_title         TEXT NOT NULL,
    image_url              TEXT NOT NULL,
    target_url             TEXT NOT NULL,
    alt_text               TEXT NOT NULL,
    sort_order             INT NOT NULL DEFAULT 0,
    start_at               TIMESTAMPTZ,
    end_at                 TIMESTAMPTZ,
    teacher_active         BOOLEAN NOT NULL DEFAULT true,
    admin_enabled          BOOLEAN NOT NULL DEFAULT true,
    admin_disabled_reason  TEXT NOT NULL DEFAULT '',
    admin_disabled_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_disabled_at      TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Common query pattern: eligible banners per site (portal + site).
CREATE INDEX IF NOT EXISTS idx_promotion_banners_site_sort
    ON promotion_banners(site_id, sort_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promotion_banners_effective
    ON promotion_banners(admin_enabled, teacher_active, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_promotion_banners_owner
    ON promotion_banners(owner_user_id, created_at DESC);

-- +goose Down

DROP INDEX IF EXISTS idx_promotion_banners_owner;
DROP INDEX IF EXISTS idx_promotion_banners_effective;
DROP INDEX IF EXISTS idx_promotion_banners_site_sort;
DROP TABLE IF EXISTS promotion_banners;
