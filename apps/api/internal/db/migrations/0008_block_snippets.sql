-- +goose Up

-- Block snippets — user-saved reusable blocks. The user crafts a Hero (or any
-- single block) with their preferred props/layout/themeOverride, saves it as
-- a named snippet, and reuses it on other pages without re-editing.
--
-- Scope per-user (not per-site) so snippets transfer across the user's whole
-- portfolio. Future enhancement: optional `is_public` flag to publish snippets
-- to a marketplace — schema-compatible since extending columns is free.
CREATE TABLE IF NOT EXISTS block_snippets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    block_type  TEXT NOT NULL,           -- e.g. "Hero", denormalised for filtering
    block_json  JSONB NOT NULL,          -- full BlockData ({ type, props, layout, themeOverride })
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_block_snippets_user ON block_snippets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_block_snippets_type ON block_snippets(user_id, block_type);

-- +goose Down

DROP INDEX IF EXISTS idx_block_snippets_type;
DROP INDEX IF EXISTS idx_block_snippets_user;
DROP TABLE IF EXISTS block_snippets;
