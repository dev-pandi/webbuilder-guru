-- +goose Up
-- Slug uniqueness sekarang PER-USER, bukan global.
--
-- Konteks: dulu slug jadi URL sub-domain (`<slug>.<host>`), jadi wajib global
-- unique. Setelah free-subdomain flow dihapus (1 domain = 1 situs), slug
-- cuma internal identifier (export folder, sitemap key) — user A dan user B
-- boleh punya slug "myshop" masing-masing tanpa konflik.
--
-- Migration: drop constraint global `sites_slug_key` (auto-generated Postgres),
-- bikin composite unique index `(user_id, slug)`. Existing data safe kalau
-- tidak ada duplikat cross-user (probability rendah — slug lama global-unique).
--
-- Kalau ada duplicate cross-user setelah migration, index creation gagal.
-- Handle manual di operator level (unlikely for MVP dataset).

ALTER TABLE sites DROP CONSTRAINT IF EXISTS sites_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sites_user_id_slug ON sites(user_id, slug);

-- +goose Down
DROP INDEX IF EXISTS uq_sites_user_id_slug;
-- NB: cannot re-add global unique kalau data user sudah kolisi. Kalau butuh
-- rollback, dedup manual dulu.
ALTER TABLE sites ADD CONSTRAINT sites_slug_key UNIQUE (slug);
