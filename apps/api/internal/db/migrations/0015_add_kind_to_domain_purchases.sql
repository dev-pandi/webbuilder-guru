-- +goose Up
-- kind = "register" (new domain) atau "renew" (extend existing domain).
-- Default "register" biar row lama tidak perlu backfill manual.
--
-- Track renew di web builder karena:
--   - Frontend polling status pakai endpoint yang sama (/purchases/:job_id)
--   - Dashboard "Domain sedang diproses" kartu bisa expose renew job juga
--   - Reason field berguna untuk audit trail
ALTER TABLE domain_purchases
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'register';
CREATE INDEX IF NOT EXISTS idx_domain_purchases_kind ON domain_purchases(kind);

-- +goose Down
DROP INDEX IF EXISTS idx_domain_purchases_kind;
ALTER TABLE domain_purchases DROP COLUMN IF EXISTS kind;
