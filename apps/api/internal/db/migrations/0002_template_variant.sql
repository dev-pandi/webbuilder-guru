-- +goose Up

ALTER TABLE templates ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT '';

-- Drop the unused early-seed rows so the new builtin generator can upsert with
-- the new <category>-<variant> slug scheme without conflicts.
DELETE FROM templates WHERE slug IN ('school-classic','umkm-toko','portfolio-personal','teacher-profile','blog-magazine');

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_variant ON templates(variant);

-- +goose Down

DROP INDEX IF EXISTS idx_templates_variant;
DROP INDEX IF EXISTS idx_templates_category;
ALTER TABLE templates DROP COLUMN IF EXISTS variant;
