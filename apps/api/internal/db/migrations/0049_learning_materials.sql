-- +goose Up

-- learning_materials: menu "Pembelajaran" di website guru.
-- Spec §19 & §23: mirip artikel tapi tanpa views, tanpa tanggapan, tanpa
-- info kelas. Tidak masuk statistik "Jejak Website Saya".

CREATE TABLE IF NOT EXISTS learning_materials (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    slug              TEXT NOT NULL,
    title             TEXT NOT NULL,
    excerpt           TEXT NOT NULL DEFAULT '',
    body_md           TEXT NOT NULL DEFAULT '',
    cover_image_url   TEXT NOT NULL DEFAULT '',
    tags_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
    summary           TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'draft',   -- draft | published
    seo_title         TEXT NOT NULL DEFAULT '',
    seo_description   TEXT NOT NULL DEFAULT '',
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, slug),
    CONSTRAINT learning_materials_status_valid CHECK (status IN ('draft','published'))
);

CREATE INDEX IF NOT EXISTS idx_learning_materials_site_status
    ON learning_materials(site_id, status);
CREATE INDEX IF NOT EXISTS idx_learning_materials_site_published
    ON learning_materials(site_id, published_at DESC NULLS LAST);

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS quota_max_learning_materials INT NOT NULL DEFAULT 200;

-- +goose Down

ALTER TABLE sites DROP COLUMN IF EXISTS quota_max_learning_materials;
DROP INDEX IF EXISTS idx_learning_materials_site_published;
DROP INDEX IF EXISTS idx_learning_materials_site_status;
DROP TABLE IF EXISTS learning_materials;
