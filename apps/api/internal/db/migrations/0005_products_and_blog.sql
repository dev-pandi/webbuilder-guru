-- +goose Up

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS quota_max_products    INT NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS quota_max_blog_posts  INT NOT NULL DEFAULT 100;

-- products: dirancang siap untuk integrasi payment nanti.
-- - price disimpan sebagai BIGINT dalam satuan terkecil (rupiah/sen), tidak pakai float
-- - metadata_json untuk extensibility (SKU payment, varian, attributes) tanpa migration
CREATE TABLE IF NOT EXISTS products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    slug          TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    price         BIGINT NOT NULL DEFAULT 0,
    currency      TEXT NOT NULL DEFAULT 'IDR',
    stock         INTEGER,
    image_url     TEXT NOT NULL DEFAULT '',
    gallery_json  JSONB NOT NULL DEFAULT '[]'::jsonb,
    category      TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_products_site_status  ON products(site_id, status);
CREATE INDEX IF NOT EXISTS idx_products_site_created ON products(site_id, created_at DESC);

-- blog_posts: simpan markdown source, html dirender saat dibutuhkan oleh renderer.
CREATE TABLE IF NOT EXISTS blog_posts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL,
    title           TEXT NOT NULL,
    excerpt         TEXT NOT NULL DEFAULT '',
    content_md      TEXT NOT NULL DEFAULT '',
    cover_image_url TEXT NOT NULL DEFAULT '',
    author_name     TEXT NOT NULL DEFAULT '',
    tags_json       JSONB NOT NULL DEFAULT '[]'::jsonb,
    status          TEXT NOT NULL DEFAULT 'draft',
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_blog_posts_site_status    ON blog_posts(site_id, status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_site_published ON blog_posts(site_id, published_at DESC);

-- +goose Down

DROP TABLE IF EXISTS blog_posts;
DROP TABLE IF EXISTS products;
ALTER TABLE sites DROP COLUMN IF EXISTS quota_max_blog_posts;
ALTER TABLE sites DROP COLUMN IF EXISTS quota_max_products;
