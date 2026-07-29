-- +goose Up
-- Track siapa yang trigger purchase (bukan cuma owner) — plan-reseller-roles.md 4.4.
--
-- Semantic:
--   - user_id       = owner domain (invoice ke sini kalau billing model B)
--   - purchased_by  = actor yang trigger (reseller/agent atas nama client)
--   - Kalau self-purchase (client beli sendiri), purchased_by = user_id atau NULL
--
-- Untuk existing rows: purchased_by = NULL (self-purchase, tidak affect logic).
-- Renew via wallet reseller nanti akan set purchased_by = reseller_id.

ALTER TABLE domain_purchases
    ADD COLUMN IF NOT EXISTS purchased_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_domain_purchases_purchased_by ON domain_purchases(purchased_by)
    WHERE purchased_by IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_domain_purchases_purchased_by;
ALTER TABLE domain_purchases DROP COLUMN IF EXISTS purchased_by;
