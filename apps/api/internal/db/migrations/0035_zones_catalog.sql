-- +goose Up
-- Zone catalog — admin definisi TLD apa yang di-support platform.
-- Authoritative di web builder DB; operator kontrol full lewat /admin/zones.
--
-- Setiap TLD punya rules:
--   require_document   — user harus upload KTP/NPWP untuk register di zone ini
--   auto_approved      — dokumen auto-approve (skip admin review workflow)
--   nik_auto_approved  — cukup NIK di form (tanpa dokumen fisik) → auto-approved
--   min_years/max_years — batas registrasi period per zone
--
-- Cross-check di CheckDomain: kalau zone tidak `active`, tidak di-expose ke
-- user meskipun EPP registry masih support (kontrol full di operator).
CREATE TABLE IF NOT EXISTS zones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tld                 TEXT NOT NULL UNIQUE,           -- 'id', 'co.id', 'com'
    label               TEXT NOT NULL,                   -- '.id', '.co.id'
    active              BOOLEAN NOT NULL DEFAULT true,
    require_document    BOOLEAN NOT NULL DEFAULT false,  -- .id family = true
    auto_approved       BOOLEAN NOT NULL DEFAULT true,   -- .id = false (admin approve)
    nik_auto_approved   BOOLEAN NOT NULL DEFAULT false,  -- .id family = true (NIK cukup)
    min_years           INT NOT NULL DEFAULT 1 CHECK (min_years >= 1),
    max_years           INT NOT NULL DEFAULT 10 CHECK (max_years >= min_years AND max_years <= 100),
    sort_order          INT NOT NULL DEFAULT 0,           -- untuk UI ordering (rendah dulu)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_zones_active_sort ON zones(active, sort_order) WHERE active = true;

-- Seed default zones PANDI. Admin bisa edit/disable/tambah nanti.
INSERT INTO zones (tld, label, require_document, auto_approved, nik_auto_approved, sort_order) VALUES
    ('id',       '.id',       true,  false, true,  10),
    ('co.id',    '.co.id',    true,  false, false, 20),
    ('web.id',   '.web.id',   false, true,  false, 30),
    ('biz.id',   '.biz.id',   false, true,  false, 40),
    ('my.id',    '.my.id',    false, true,  false, 50),
    ('or.id',    '.or.id',    true,  false, false, 60),
    ('sch.id',   '.sch.id',   true,  false, false, 70),
    ('ac.id',    '.ac.id',    true,  false, false, 80),
    ('go.id',    '.go.id',    true,  false, false, 90),
    ('desa.id',  '.desa.id',  true,  false, false, 100),
    ('ponpes.id','.ponpes.id',true,  false, false, 110)
ON CONFLICT (tld) DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS idx_zones_active_sort;
DROP TABLE IF EXISTS zones;
