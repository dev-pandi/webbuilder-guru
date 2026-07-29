-- +goose Up
-- Reseller-level pricing (plan-reseller-roles.md 16.3).
-- Layer 2 dari 3-tier pricing.
--
-- Reseller set 2 tier price per-TLD:
--   agent_*  = kulakan agent (agent bayar reseller segini out-of-system)
--   client_* = reseller direct-charge client (kalau reseller tanpa agent)
--
-- Split register vs renew — strategi umum:
--   - Register agent murah = akuisisi lead
--   - Renew client mahal = revenue recurring

CREATE TABLE IF NOT EXISTS reseller_price_lists (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reseller_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tld                   TEXT NOT NULL,
    agent_register_price  INT NOT NULL,   -- kulakan agent untuk register domain baru
    agent_renew_price     INT NOT NULL,   -- kulakan agent untuk renew
    client_register_price INT NOT NULL,   -- reseller direct-charge client (register)
    client_renew_price    INT NOT NULL,   -- reseller direct-charge client (renew)
    currency              TEXT NOT NULL DEFAULT 'IDR',
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (reseller_id, tld)
);
CREATE INDEX IF NOT EXISTS idx_reseller_price_lists_reseller_id ON reseller_price_lists(reseller_id);

-- +goose Down
DROP INDEX IF EXISTS idx_reseller_price_lists_reseller_id;
DROP TABLE IF EXISTS reseller_price_lists;
