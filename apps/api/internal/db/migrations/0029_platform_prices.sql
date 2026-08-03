-- +goose Up
-- Platform-level pricing (plan-reseller-roles.md 16.3).
-- Layer 1 dari 3-tier pricing:
--   retail_*    = yang dibayar client self-purchase via wizard
--   wholesale_* = cost per TLD (nullable — kalau NULL, admin set manual
--                 saat setup, atau derive dari reseller_price_lists)
--
-- Split register vs renew (keputusan #1 — sesuai standard industri PANDI/
-- GoDaddy/Namecheap di mana register dan renew umumnya harga beda).

CREATE TABLE IF NOT EXISTS platform_prices (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tld                      TEXT NOT NULL UNIQUE,
        -- 'co.id', 'id', 'com', 'net', dst. Lowercase enforced di app layer.
    retail_register_price    INT NOT NULL,
    retail_renew_price       INT NOT NULL,
    wholesale_register_price INT,
    wholesale_renew_price    INT,
    currency                 TEXT NOT NULL DEFAULT 'IDR',
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by               UUID REFERENCES users(id) ON DELETE SET NULL
        -- Admin yang last-updated. Untuk audit trail.
);
CREATE INDEX IF NOT EXISTS idx_platform_prices_tld ON platform_prices(tld);

-- +goose Down
DROP INDEX IF EXISTS idx_platform_prices_tld;
DROP TABLE IF EXISTS platform_prices;
