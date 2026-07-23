-- +goose Up
-- expiry_notice_sent_at menandai kapan email peringatan expire terakhir dikirim
-- untuk row ini. NULL = belum pernah dikirim. Notifier akan re-send kalau
-- kolom < now() - 7 days (weekly reminder sampai user renew atau domain lewat).
--
-- Alasan per-row bukan per-domain: query paling sederhana + akur; renewal
-- akan membuat row baru (kind=renew) dengan expires_at baru, sehingga
-- notifier otomatis pindah target ke row terbaru per domain.
ALTER TABLE domain_purchases
    ADD COLUMN IF NOT EXISTS expiry_notice_sent_at TIMESTAMPTZ;

-- Partial index untuk row yang eligible (active + register/renew + belum expired).
-- Notifier scan mempergunakan ini + filter expires_at range.
CREATE INDEX IF NOT EXISTS idx_domain_purchases_expiry_notice
    ON domain_purchases (expires_at)
    WHERE status = 'active' AND expires_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_domain_purchases_expiry_notice;
ALTER TABLE domain_purchases DROP COLUMN IF EXISTS expiry_notice_sent_at;
