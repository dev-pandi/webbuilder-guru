-- +goose Up
-- kind = "register" (new domain) atau "renew" (extend existing domain).
-- Sinkron dengan registrar_domain_jobs.kind di registrar-api. Default
-- "register" biar row lama (semua register) tidak perlu backfill manual.
--
-- Kenapa track renew di web builder juga (bukan hanya di registrar)?
--   - Frontend polling status pakai endpoint yang sama (/purchases/:job_id)
--   - Dashboard "Domain sedang diproses" kartu bisa expose renew job juga
--   - Reason field yang di-cache berguna untuk audit trail
ALTER TABLE domain_purchases
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'register';
CREATE INDEX IF NOT EXISTS idx_domain_purchases_kind ON domain_purchases(kind);

-- +goose Down
DROP INDEX IF EXISTS idx_domain_purchases_kind;
ALTER TABLE domain_purchases DROP COLUMN IF EXISTS kind;
