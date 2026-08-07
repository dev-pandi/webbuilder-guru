-- +goose Up
-- Tambah tracking Cloudflare auto-attach status di registered_domains.
-- Sebelumnya CF attach best-effort — kalau fail cuma di-log stdout, admin tidak
-- ada visibility. Sekarang persist per-domain supaya:
--   - Admin bisa lihat status attach di UI (badge success/failed)
--   - Retry manual via tombol tanpa perlu re-register domain
--   - Diagnostic error message langsung visible tanpa dig log
ALTER TABLE registered_domains
    ADD COLUMN IF NOT EXISTS cf_attach_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS cf_attach_error  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS cf_attach_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cf_zone_id       TEXT NOT NULL DEFAULT '';

-- Status enum values di aplikasi:
--   'pending'  : belum di-attempt (initial state)
--   'success'  : zone created + NS pushed OK
--   'failed'   : ada error di zone create / NS push / DNS record
--   'skipped'  : config CF belum ada (skipped_no_config)

-- Index untuk admin filter "cari domain yang CF-nya gagal".
CREATE INDEX IF NOT EXISTS idx_registered_domains_cf_status
    ON registered_domains(cf_attach_status)
    WHERE cf_attach_status IN ('failed', 'pending');

-- +goose Down
ALTER TABLE registered_domains
    DROP COLUMN IF EXISTS cf_attach_status,
    DROP COLUMN IF EXISTS cf_attach_error,
    DROP COLUMN IF EXISTS cf_attach_at,
    DROP COLUMN IF EXISTS cf_zone_id;
