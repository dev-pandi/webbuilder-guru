-- +goose Up
-- Partial unique index untuk cegah data anomali cross-tenant leak di
-- renderer. `domain_purchases.domain` bukan globally unique (transaction log:
-- register + N renew per domain), tapi HARUS unique untuk kombinasi:
--   (domain, kind='register', status='active', site_id NOT NULL)
--
-- Ini mem-enforce di DB level bahwa 1 domain aktif hanya boleh attach ke 1
-- site. Kalau future insert coba violate, PostgreSQL tolak dengan constraint
-- error. Melindungi dari:
--   - Race condition di attach flow (dua request concurrent)
--   - Data restore / manual SQL yang tidak melewati handler
--   - Bug regression yang lupa cleanup orphan sebelum re-attach
--
-- Query renderer (sites.GetByHost) sekarang deterministic — subquery ambil
-- 1 site_id via COALESCE. Constraint ini defense-in-depth di layer bawah.
--
-- CONCURRENTLY tidak dipakai karena Goose default single-transaction.
-- Kalau tabel besar (>100k rows), consider run manual dengan CONCURRENTLY
-- sebelum apply migration ini.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dp_active_register_per_domain
    ON domain_purchases (domain)
    WHERE status = 'active'
      AND kind = 'register'
      AND site_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_dp_active_register_per_domain;
