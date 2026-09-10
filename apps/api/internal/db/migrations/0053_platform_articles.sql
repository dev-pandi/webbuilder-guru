-- +goose Up

-- platform_articles: artikel platform-level (blog marketing / knowledge base).
-- Berbeda dari `articles` per-site (rubrik guru): ini konten yang tampil di
-- homepage utama (marketing landing page). Dikelola admin, dibaca publik
-- tanpa auth. Konsep: newsroom / help center / thought leadership platform.

CREATE TABLE IF NOT EXISTS platform_articles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug              TEXT NOT NULL UNIQUE,
    title             TEXT NOT NULL,
    excerpt           TEXT NOT NULL DEFAULT '',
    body_md           TEXT NOT NULL DEFAULT '',
    cover_image_url   TEXT NOT NULL DEFAULT '',
    category          TEXT NOT NULL DEFAULT 'umum',
    -- category enum-like: umum, tutorial, cerita, tips, panduan, pengumuman
    author_name       TEXT NOT NULL DEFAULT 'Tim Web Builder',
    tags_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
    status            TEXT NOT NULL DEFAULT 'draft',      -- draft | published
    featured          BOOLEAN NOT NULL DEFAULT false,     -- pin di homepage top
    reading_time_min  INT NOT NULL DEFAULT 0,
    view_count        BIGINT NOT NULL DEFAULT 0,
    seo_title         TEXT NOT NULL DEFAULT '',
    seo_description   TEXT NOT NULL DEFAULT '',
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT platform_articles_status_valid CHECK (status IN ('draft','published'))
);

CREATE INDEX IF NOT EXISTS idx_platform_articles_status_published
    ON platform_articles(status, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_platform_articles_category
    ON platform_articles(category, status);
CREATE INDEX IF NOT EXISTS idx_platform_articles_featured
    ON platform_articles(featured, published_at DESC NULLS LAST)
    WHERE featured = true AND status = 'published';

-- +goose Down

DROP INDEX IF EXISTS idx_platform_articles_featured;
DROP INDEX IF EXISTS idx_platform_articles_category;
DROP INDEX IF EXISTS idx_platform_articles_status_published;
DROP TABLE IF EXISTS platform_articles;
