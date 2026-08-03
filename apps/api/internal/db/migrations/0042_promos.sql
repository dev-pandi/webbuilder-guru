-- +goose Up
-- Promo codes — kupon diskon yang bisa di-apply saat purchase/renew domain.
--
-- Design:
--   - Diskon flat (fixed IDR) atau persen (0-100).
--   - Scoped ke kind: 'register', 'renew', atau 'both'.
--   - Optional TLD whitelist (kalau kosong = semua TLD).
--   - Validity window + max total uses + max per-user uses.
--   - Redemption tracked di promo_redemptions untuk enforce limits + audit.
--
-- Validation flow (di service):
--   1. code lookup (case-insensitive)
--   2. active + within valid_from/valid_until window
--   3. total redemptions < max_uses (kalau di-set)
--   4. user redemptions < max_uses_per_user (kalau di-set)
--   5. invoice.subtotal >= min_subtotal (kalau di-set)
--   6. tld di allowed_tlds (kalau di-set) + kind match applies_to
--   7. hitung discount → clamp ke subtotal (jangan negatif)
--   8. atomically: insert redemption + return discount amount
CREATE TABLE IF NOT EXISTS promo_codes (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code              TEXT NOT NULL UNIQUE,           -- uppercase, alphanumeric + dash
    description       TEXT NOT NULL DEFAULT '',
    discount_type     TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value    BIGINT NOT NULL CHECK (discount_value > 0),
        -- percent: 1-100 (%), fixed: IDR minor unit
    applies_to        TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('register', 'renew', 'both')),
    allowed_tlds      TEXT[] NOT NULL DEFAULT '{}',   -- empty = semua TLD
    min_subtotal      BIGINT NOT NULL DEFAULT 0,      -- min invoice subtotal (IDR minor)
    max_discount      BIGINT NOT NULL DEFAULT 0,      -- cap total discount (0 = no cap), berguna untuk percent
    valid_from        TIMESTAMPTZ,                    -- NULL = valid sejak selalu
    valid_until       TIMESTAMPTZ,                    -- NULL = tidak expire
    max_uses          INT,                            -- NULL = unlimited total
    max_uses_per_user INT NOT NULL DEFAULT 1,         -- default 1 per user
    active            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_active
    ON promo_codes(code) WHERE active = true;

-- Redemption log — 1 row per aktivasi promo di invoice. Cegah reuse
-- (unique per user+code kalau max_uses_per_user=1) + audit trail.
CREATE TABLE IF NOT EXISTS promo_redemptions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_id         UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_id       UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    discount_applied BIGINT NOT NULL CHECK (discount_applied >= 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate redemption per invoice (invoice hanya bisa punya 1 promo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_promo_redemptions_invoice
    ON promo_redemptions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_user
    ON promo_redemptions(promo_id, user_id);

-- +goose Down
DROP INDEX IF EXISTS idx_promo_redemptions_promo_user;
DROP INDEX IF EXISTS uq_promo_redemptions_invoice;
DROP TABLE IF EXISTS promo_redemptions;
DROP INDEX IF EXISTS idx_promo_codes_active;
DROP TABLE IF EXISTS promo_codes;
