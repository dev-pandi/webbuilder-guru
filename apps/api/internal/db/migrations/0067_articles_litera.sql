-- +goose Up

-- articles.litera_* — kolom integrasi Litera NFT publishing (per artikel).
-- Guru enable toggle di form editor. Setelah publish, backend register ke
-- Litera API dan simpan intent_id. litera_register_error untuk soft-fail
-- retry (artikel tetap published walau register ke Litera gagal).

ALTER TABLE articles
    ADD COLUMN IF NOT EXISTS litera_enabled               BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS litera_intent_id             TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS litera_registered_at         TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS litera_unlockable_url        TEXT        NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS litera_unlockable_description TEXT       NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS litera_quiz_json             JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS litera_register_error        TEXT        NOT NULL DEFAULT '';

-- Index untuk admin dashboard: list artikel yang Litera-enabled, sort by
-- registered_at. Partial index supaya hanya baris relevan yang disertakan.
CREATE INDEX IF NOT EXISTS idx_articles_litera_enabled
    ON articles(litera_registered_at DESC NULLS LAST)
    WHERE litera_enabled = true;

-- +goose Down

DROP INDEX IF EXISTS idx_articles_litera_enabled;
ALTER TABLE articles DROP COLUMN IF EXISTS litera_register_error;
ALTER TABLE articles DROP COLUMN IF EXISTS litera_quiz_json;
ALTER TABLE articles DROP COLUMN IF EXISTS litera_unlockable_description;
ALTER TABLE articles DROP COLUMN IF EXISTS litera_unlockable_url;
ALTER TABLE articles DROP COLUMN IF EXISTS litera_registered_at;
ALTER TABLE articles DROP COLUMN IF EXISTS litera_intent_id;
ALTER TABLE articles DROP COLUMN IF EXISTS litera_enabled;
