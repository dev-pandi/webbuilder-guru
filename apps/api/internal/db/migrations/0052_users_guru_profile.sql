-- +goose Up

-- Extend `users` dengan field profil guru. Spec §13, §25.
-- Field ini dipakai:
--   1. Portal direktori guru (§5) — kartu guru render nama + subject_or_field
--      + profile_image
--   2. Website guru sendiri — hero_statement + quote di beranda, bio_short +
--      bio_long di halaman profil, social_links footer
--   3. Dashboard guru — /settings/profile menampilkan form edit
--
-- Semua default kosong supaya user existing tidak break. Guru isi lewat
-- dashboard, sedangkan reseller/agent bisa biarkan kosong (tidak render).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subject_or_field TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS profile_image    TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bio_short        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS bio_long         TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS hero_statement   TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS quote            TEXT NOT NULL DEFAULT '',
    -- social_links_json = array of {platform, url} entries. JSONB supaya
    -- fleksibel (tambah platform baru tanpa migration) + bisa di-query.
    ADD COLUMN IF NOT EXISTS social_links_json JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down

ALTER TABLE users
    DROP COLUMN IF EXISTS social_links_json,
    DROP COLUMN IF EXISTS quote,
    DROP COLUMN IF EXISTS hero_statement,
    DROP COLUMN IF EXISTS bio_long,
    DROP COLUMN IF EXISTS bio_short,
    DROP COLUMN IF EXISTS profile_image,
    DROP COLUMN IF EXISTS subject_or_field;
