-- +goose Up

-- Aduan konten (judi online, pornografi, penipuan, dst.) dari publik, plus
-- kemampuan admin menangguhkan situs atau domain.
--
-- Nomor 0072, bukan 0069: DB dev/test yang pernah menjalankan branch umkm
-- sudah mencatat versi 69-71 (drop_guru_templates, orders, ...). Goose
-- menganggap versi yang sudah tercatat sebagai sudah diterapkan, jadi file
-- bernomor 0069 di sini akan dilewati diam-diam dan tabelnya tak pernah ada.

CREATE TABLE IF NOT EXISTS abuse_reports (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- URL apa adanya dari pelapor (bukti), dan host ternormalisasi
    -- (lowercase, tanpa www.) untuk pencarian + pencocokan situs.
    reported_url     TEXT NOT NULL,
    reported_host    TEXT NOT NULL,
    category         TEXT NOT NULL,
    description      TEXT NOT NULL,
    reporter_name    TEXT NOT NULL DEFAULT '',
    reporter_email   TEXT NOT NULL,
    reporter_ip      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'baru',
    -- Dicocokkan saat aduan masuk supaya admin langsung tahu situs mana;
    -- NULL kalau host bukan milik platform ini.
    site_id          UUID REFERENCES sites(id) ON DELETE SET NULL,
    admin_note       TEXT NOT NULL DEFAULT '',
    handled_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    handled_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT abuse_reports_category_valid CHECK (category IN (
        'judi_online', 'pornografi', 'penipuan', 'phishing_malware',
        'sara_kebencian', 'hoaks', 'hak_cipta', 'lainnya'
    )),
    CONSTRAINT abuse_reports_status_valid CHECK (status IN (
        'baru', 'ditinjau', 'ditindak', 'ditolak'
    ))
);

CREATE INDEX IF NOT EXISTS idx_abuse_reports_status_created
    ON abuse_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_host
    ON abuse_reports(reported_host);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_site
    ON abuse_reports(site_id) WHERE site_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS abuse_report_files (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id    UUID NOT NULL REFERENCES abuse_reports(id) ON DELETE CASCADE,
    storage_key  TEXT NOT NULL,
    filename     TEXT NOT NULL,
    mime_type    TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abuse_report_files_report
    ON abuse_report_files(report_id);

-- Penangguhan disimpan di kolom terpisah, BUKAN dengan menimpa `status`:
-- sites.status = draft/published milik pemilik, registered_domains.status =
-- siklus registry (active/expired). Menimpa keduanya akan merusak alur
-- publish, perpanjangan, dan dashboard; kolom terpisah juga membuat
-- pencabutan penangguhan cukup dengan mengosongkannya.
ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS suspended_by      UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE registered_domains
    ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS suspended_by      UUID REFERENCES users(id) ON DELETE SET NULL;

-- +goose Down

ALTER TABLE registered_domains
    DROP COLUMN IF EXISTS suspended_by,
    DROP COLUMN IF EXISTS suspended_reason,
    DROP COLUMN IF EXISTS suspended_at;
ALTER TABLE sites
    DROP COLUMN IF EXISTS suspended_by,
    DROP COLUMN IF EXISTS suspended_reason,
    DROP COLUMN IF EXISTS suspended_at;
DROP TABLE IF EXISTS abuse_report_files;
DROP TABLE IF EXISTS abuse_reports;
