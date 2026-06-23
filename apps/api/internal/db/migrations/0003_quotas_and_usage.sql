-- +goose Up

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS quota_max_pages         INT    NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS quota_max_storage_bytes BIGINT NOT NULL DEFAULT 104857600;

CREATE TABLE IF NOT EXISTS site_usage_snapshots (
    id            BIGSERIAL PRIMARY KEY,
    site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    pages_count   INT  NOT NULL DEFAULT 0,
    assets_count  INT  NOT NULL DEFAULT 0,
    storage_bytes BIGINT NOT NULL DEFAULT 0,
    captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_site_usage_snapshots_site_time
    ON site_usage_snapshots(site_id, captured_at DESC);

-- +goose Down

DROP TABLE IF EXISTS site_usage_snapshots;
ALTER TABLE sites DROP COLUMN IF EXISTS quota_max_storage_bytes;
ALTER TABLE sites DROP COLUMN IF EXISTS quota_max_pages;
