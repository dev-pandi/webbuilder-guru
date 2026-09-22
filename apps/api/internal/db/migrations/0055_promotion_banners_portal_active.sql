-- +goose Up
-- portal_active — flag banner mana yang di-select oleh guru untuk tampil di
-- Ruang Promosi di landing page portal (§6). Beda dengan `teacher_active`:
--   teacher_active = ditampilkan di website pribadi guru itu sendiri
--   portal_active  = ditampilkan di aggregate portal landing (bikinweb.pandi.id)
-- Setiap guru MAKSIMUM 1 banner portal_active — supaya fair display quota per
-- guru + banner rotasi jelas siapa yang tampil.
ALTER TABLE promotion_banners
    ADD COLUMN IF NOT EXISTS portal_active BOOLEAN NOT NULL DEFAULT false;

-- Partial unique: at most 1 portal_active per site. Kalau insert/update coba
-- bikin 2 aktif di site sama, Postgres reject. Handler backend juga auto-
-- clear yang lain sebelum set (biar UX toggle radio-like).
CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_banners_site_portal_unique
    ON promotion_banners (site_id)
    WHERE portal_active = true;

-- Index untuk portal query — filter dominan.
CREATE INDEX IF NOT EXISTS idx_promotion_banners_portal_active
    ON promotion_banners (portal_active)
    WHERE portal_active = true;

-- +goose Down
DROP INDEX IF EXISTS idx_promotion_banners_portal_active;
DROP INDEX IF EXISTS idx_promotion_banners_site_portal_unique;
ALTER TABLE promotion_banners DROP COLUMN IF EXISTS portal_active;
