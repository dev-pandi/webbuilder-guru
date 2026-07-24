-- +goose Up
-- Analytics MVP — daily-bucket page view counter per (site, page, date).
-- Cukup untuk chart 30-day trend + top pages tanpa row explosion (worst
-- case: 30 hari × 20 halaman = 600 rows per situs, sangat manageable).
--
-- Kalau nanti butuh visitor unique / referrer / bounce rate, tambah tabel
-- terpisah `analytics_sessions` — struktur ini tetap valid sebagai aggregate.
--
-- Cascade dari sites → auto cleanup saat site dihapus.
CREATE TABLE IF NOT EXISTS analytics_page_views (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    page_slug   TEXT NOT NULL DEFAULT '',  -- '' = homepage, '/blog/xxx' untuk sub-route
    date        DATE NOT NULL DEFAULT CURRENT_DATE,
    view_count  BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique per (site, date, page_slug) untuk UPSERT increment pattern.
CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_page_views_bucket
    ON analytics_page_views (site_id, date, page_slug);

-- Index untuk query range 30-day + aggregate by date.
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_site_date
    ON analytics_page_views (site_id, date DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_analytics_page_views_site_date;
DROP INDEX IF EXISTS uq_analytics_page_views_bucket;
DROP TABLE IF EXISTS analytics_page_views;
