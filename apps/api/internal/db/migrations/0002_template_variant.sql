ALTER TABLE templates ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT '';

-- Drop the unused JSONB columns from the older seed shape and rebuild
-- the unique key so existing rows with slugs like "school-classic" don't
-- conflict when the new builtin generator upserts "school-modern" etc.
-- (Safe to drop because seeding is idempotent and re-inserts everything.)
DELETE FROM templates WHERE slug IN ('school-classic','umkm-toko','portfolio-personal','teacher-profile','blog-magazine');

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_variant ON templates(variant);
