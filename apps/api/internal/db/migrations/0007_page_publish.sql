-- +goose Up

-- Draft/published split per page. Before this migration, `tree_json` was
-- both the working draft AND the live data — any save was instantly visible.
-- Now: `tree_json` = draft (editor edits this), `published_tree_json` = live
-- snapshot copied at publish time. Public renderer reads the published copy
-- (with COALESCE fallback to draft for back-compat with existing rows).

ALTER TABLE pages
    ADD COLUMN IF NOT EXISTS published_tree_json JSONB,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Seed: any page already in the DB before this rollout has implicitly been
-- "live" — initialise its published snapshot from the draft so the renderer
-- doesn't suddenly show empty pages right after migration.
UPDATE pages
   SET published_tree_json = tree_json,
       published_at = now()
 WHERE published_tree_json IS NULL;

CREATE INDEX IF NOT EXISTS idx_pages_published_at ON pages(published_at) WHERE published_at IS NOT NULL;

-- +goose Down

DROP INDEX IF EXISTS idx_pages_published_at;
ALTER TABLE pages
    DROP COLUMN IF EXISTS published_at,
    DROP COLUMN IF EXISTS published_tree_json;
