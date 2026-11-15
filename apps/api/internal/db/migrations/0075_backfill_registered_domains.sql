-- Isi registered_domains untuk domain yang sudah sukses didaftarkan tapi
-- tidak punya baris: execute_after_payment dulu melewati penyimpanan domain
-- kalau EPP info gagal, sehingga /admin/domain (dan laporan per tanggal)
-- kekurangan domain dibanding riwayat transaksi. Pola sama dengan backfill
-- 0046; registered_at = tanggal transaksi register.

-- +goose Up
INSERT INTO registered_domains (
    user_id, purchased_by, name, expires_at, registered_at, last_renewed_at,
    status, site_id, registrar_job_id
)
SELECT DISTINCT ON (dp.domain)
    dp.user_id,
    dp.purchased_by,
    dp.domain,
    COALESCE(
        (SELECT max(dpx.expires_at) FROM domain_purchases dpx
          WHERE dpx.domain = dp.domain AND dpx.status = 'active'),
        dp.created_at + make_interval(years => dp.years + COALESCE(
            (SELECT sum(dpr.years)::int FROM domain_purchases dpr
              WHERE dpr.domain = dp.domain AND dpr.kind = 'renew' AND dpr.status = 'active'), 0))
    ),
    dp.created_at,
    (SELECT max(dpr.created_at) FROM domain_purchases dpr
      WHERE dpr.domain = dp.domain AND dpr.kind = 'renew' AND dpr.status = 'active'),
    'active',
    dp.site_id,
    dp.registrar_job_id
FROM domain_purchases dp
WHERE dp.kind = 'register' AND dp.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM registered_domains rd WHERE rd.name = dp.domain)
ORDER BY dp.domain, dp.created_at DESC
ON CONFLICT (name) DO NOTHING;

-- +goose Down
-- Baris hasil backfill tidak bisa dibedakan dari baris normal; sengaja no-op.
SELECT 1;
