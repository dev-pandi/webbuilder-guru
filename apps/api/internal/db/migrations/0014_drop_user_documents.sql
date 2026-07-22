-- +goose Up
-- Rollback dari migration 0013. Dokumen sensitif (KTP/NPWP) sekarang
-- disimpan HANYA di aplikasi registrar (single source of truth) — web
-- builder cuma proxy multipart upload saat user attach dokumen ke domain
-- purchase yang butuh. Alasan pindah:
--   - Menghindari duplikasi PII (data KTP di 2 tempat = 2x compliance risk)
--   - Registrar sudah punya storage + tabel documents lengkap
--   - Menghilangkan sync problem (delete di web builder tidak menghapus
--     copy di registrar, dan sebaliknya)
DROP TABLE IF EXISTS user_documents;

-- +goose Down
-- Tidak dibuat ulang; kalau butuh library dokumen di web builder di masa
-- depan, buat migration baru dengan schema yang sesuai desain saat itu.
