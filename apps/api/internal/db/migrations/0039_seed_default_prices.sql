-- +goose Up
-- Seed default retail prices untuk 11 PANDI TLD yang sudah di-seed di zones
-- catalog (migration 0035). Nilai realistic estimate — admin harus review +
-- adjust via /admin/pricing setelah initial deploy.
--
-- Reference PANDI 2024 harga umum reseller:
--   .id            — Rp 250.000 / tahun (paling umum, corporate)
--   .co.id         — Rp 250.000 / tahun (corporate, butuh dokumen)
--   .web.id        — Rp 75.000 / tahun (personal, no doc)
--   .biz.id        — Rp 75.000 / tahun
--   .my.id         — Rp 75.000 / tahun
--   .or.id         — Rp 100.000 / tahun (organization)
--   .sch.id        — Rp 55.000 / tahun (education, subsidized)
--   .ac.id         — Rp 100.000 / tahun (academic)
--   .go.id         — Rp 55.000 / tahun (government, typically restricted)
--   .desa.id       — Rp 55.000 / tahun (village)
--   .ponpes.id     — Rp 55.000 / tahun (pondok pesantren)
--
-- IDR minor unit (Rupiah utuh, no decimals). Kalau harga PANDI berubah,
-- admin update via /admin/pricing endpoint (tidak butuh migration).
--
-- Wholesale price NULL by default — belum ada data sync dari registrar
-- (kalau operator masih pakai pandi_wrapper mode, admin bisa fetch via
-- /admin/pricing/registrar-tlds → import ke wholesale_*).
--
-- ON CONFLICT DO NOTHING → idempotent. Admin yang sudah customize price
-- tidak akan ke-overwrite kalau migration re-run.
INSERT INTO platform_prices (tld, retail_register_price, retail_renew_price) VALUES
    ('id',        250000, 250000),
    ('co.id',     250000, 250000),
    ('web.id',     75000,  75000),
    ('biz.id',     75000,  75000),
    ('my.id',      75000,  75000),
    ('or.id',     100000, 100000),
    ('sch.id',     55000,  55000),
    ('ac.id',     100000, 100000),
    ('go.id',      55000,  55000),
    ('desa.id',    55000,  55000),
    ('ponpes.id',  55000,  55000)
ON CONFLICT (tld) DO NOTHING;

-- +goose Down
-- Hanya hapus row yang seed-nya cocok dengan default — cegah wipe custom
-- price yang admin sudah customize. Kalau admin ubah value, row skip delete.
DELETE FROM platform_prices WHERE tld = 'id'       AND retail_register_price = 250000 AND retail_renew_price = 250000;
DELETE FROM platform_prices WHERE tld = 'co.id'    AND retail_register_price = 250000 AND retail_renew_price = 250000;
DELETE FROM platform_prices WHERE tld = 'web.id'   AND retail_register_price =  75000 AND retail_renew_price =  75000;
DELETE FROM platform_prices WHERE tld = 'biz.id'   AND retail_register_price =  75000 AND retail_renew_price =  75000;
DELETE FROM platform_prices WHERE tld = 'my.id'    AND retail_register_price =  75000 AND retail_renew_price =  75000;
DELETE FROM platform_prices WHERE tld = 'or.id'    AND retail_register_price = 100000 AND retail_renew_price = 100000;
DELETE FROM platform_prices WHERE tld = 'sch.id'   AND retail_register_price =  55000 AND retail_renew_price =  55000;
DELETE FROM platform_prices WHERE tld = 'ac.id'    AND retail_register_price = 100000 AND retail_renew_price = 100000;
DELETE FROM platform_prices WHERE tld = 'go.id'    AND retail_register_price =  55000 AND retail_renew_price =  55000;
DELETE FROM platform_prices WHERE tld = 'desa.id'  AND retail_register_price =  55000 AND retail_renew_price =  55000;
DELETE FROM platform_prices WHERE tld = 'ponpes.id' AND retail_register_price = 55000 AND retail_renew_price =  55000;
