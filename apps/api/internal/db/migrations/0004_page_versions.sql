-- +goose Up

CREATE TABLE IF NOT EXISTS page_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id     UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    title       TEXT NOT NULL DEFAULT '',
    tree_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    seo_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_versions_page_id_created ON page_versions(page_id, created_at DESC);

-- +goose Down

DROP TABLE IF EXISTS page_versions;
