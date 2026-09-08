-- +goose Up

-- articles: 6-rubrik content type untuk website guru
-- (Ceritaku/Bacaanku/Inspirasiku/Bangsaku/Peradaban/Forum Diskusi).
--
-- Berbeda dari `blog_posts` yang generic — articles punya `rubric` enum +
-- `comments_enabled` per-tulisan (kecuali forum-diskusi wajib true, enforced
-- di handler). `view_count` denormalized untuk fast render kartu tulisan;
-- `article_view_events` (below) sebagai source of truth append-only.

CREATE TABLE IF NOT EXISTS articles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    rubric            TEXT NOT NULL,
    slug              TEXT NOT NULL,
    title             TEXT NOT NULL,
    excerpt           TEXT NOT NULL DEFAULT '',
    body_md           TEXT NOT NULL DEFAULT '',
    cover_image_url   TEXT NOT NULL DEFAULT '',
    tags_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
    status            TEXT NOT NULL DEFAULT 'draft',      -- draft | published
    comments_enabled  BOOLEAN NOT NULL DEFAULT true,
    reading_time_min  INT NOT NULL DEFAULT 0,             -- 0 = auto/hidden
    view_count        BIGINT NOT NULL DEFAULT 0,
    seo_title         TEXT NOT NULL DEFAULT '',
    seo_description   TEXT NOT NULL DEFAULT '',
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, rubric, slug),
    CONSTRAINT articles_rubric_valid CHECK (
        rubric IN ('ceritaku','bacaanku','inspirasiku','bangsaku','peradaban','forum-diskusi')
    ),
    CONSTRAINT articles_status_valid CHECK (status IN ('draft','published'))
);

CREATE INDEX IF NOT EXISTS idx_articles_site_rubric_status
    ON articles(site_id, rubric, status);
CREATE INDEX IF NOT EXISTS idx_articles_site_published
    ON articles(site_id, published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_articles_site_created
    ON articles(site_id, created_at DESC);

-- article_view_events: per-view raw counter. Batch-aggregate ke articles.view_count
-- lewat notifier/analytics job. Fingerprint kolom untuk dedupe basic
-- (IP+UA hash) supaya refresh cepat tidak double-count.
CREATE TABLE IF NOT EXISTS article_view_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id   UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    fingerprint  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_view_events_article_time
    ON article_view_events(article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_view_events_site_time
    ON article_view_events(site_id, created_at DESC);
-- Dedupe window: unique per (article, fingerprint) dalam 1 jam kita cek di app
-- level (query WHERE created_at > now()-1h) sebelum insert.

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS quota_max_articles INT NOT NULL DEFAULT 500;

-- +goose Down

ALTER TABLE sites DROP COLUMN IF EXISTS quota_max_articles;
DROP INDEX IF EXISTS idx_article_view_events_site_time;
DROP INDEX IF EXISTS idx_article_view_events_article_time;
DROP TABLE IF EXISTS article_view_events;
DROP INDEX IF EXISTS idx_articles_site_created;
DROP INDEX IF EXISTS idx_articles_site_published;
DROP INDEX IF EXISTS idx_articles_site_rubric_status;
DROP TABLE IF EXISTS articles;
