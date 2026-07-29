-- +goose Up
-- Extend templates untuk admin CRUD panel + preview flow (plan-admin-templates.md).
--
-- Kolom baru:
--   status                  = 'draft' | 'published' | 'archived'
--                             draft = admin sedang build, tidak muncul di list public
--                             published = live, muncul di wizard client + /templates
--                             archived = deprecated, hidden dari list tapi existing
--                             site tetap jalan (site sudah snapshot theme+pages saat create)
--   source                  = 'builtin' | 'admin'
--                             builtin = dari BuiltinTemplates() di source code, tidak
--                             boleh di-DELETE dari UI (restore saat startup). Boleh
--                             di-edit tapi warning: perubahan overwritten saat restart.
--                             admin  = full CRUD via /admin/templates
--   created_by / updated_by = FK ke users(id) untuk audit (nullable — legacy row)
--   updated_at              = touched saat admin PATCH (tidak auto-managed di CreatedAt)
--   preview_screenshot_url  = auto-gen screenshot (Phase 5+). MVP kosong. Kolom
--                             `preview_url` existing tetap dipakai untuk manual thumbnail.
--
-- Backfill: semua existing template = builtin (di-seed dari source code).
-- Migration idempotent — ADD COLUMN IF NOT EXISTS.

ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS status                 TEXT NOT NULL DEFAULT 'published',
    ADD COLUMN IF NOT EXISTS source                 TEXT NOT NULL DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_by             UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS preview_screenshot_url TEXT NOT NULL DEFAULT '';

-- Backfill: existing row saat migration jalan = built-in (seeded dari source code).
-- Update pakai template_at NULL guard supaya jalan hanya sekali (row baru yang
-- di-create via admin panel default `source='admin'` dari DEFAULT clause).
UPDATE templates SET source = 'builtin' WHERE source = 'admin' AND created_by IS NULL;

-- Index kombinasi status+source untuk dashboard admin filter.
CREATE INDEX IF NOT EXISTS idx_templates_status_source ON templates(status, source);
-- Index status saja untuk public list yang selalu filter by status='published'.
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status) WHERE status = 'published';

-- +goose Down
DROP INDEX IF EXISTS idx_templates_status;
DROP INDEX IF EXISTS idx_templates_status_source;
ALTER TABLE templates
    DROP COLUMN IF EXISTS preview_screenshot_url,
    DROP COLUMN IF EXISTS updated_by,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS status;
