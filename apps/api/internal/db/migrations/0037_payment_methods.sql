-- +goose Up
-- Payment methods catalog — admin toggle per gateway/manual method, dengan
-- config JSON per provider (credentials, bank info, dsb.).
--
-- Type taxonomy:
--   'gateway' — online payment gateway (Midtrans, Paylabs) — API-driven
--   'manual'  — manual bank transfer — admin verify pembayaran manual
--   'wallet'  — deposit wallet prabayar — debit balance saat checkout
--
-- Config JSONB shape (validate di service layer, tidak di DB):
--   midtrans:        {server_key, client_key, is_production, snap_url}
--   paylabs:         {merchant_id, api_key, endpoint}
--   manual_bank:     {banks: [{name, account_number, account_holder}], instructions_md}
--   deposit_wallet:  {topup_min, topup_max, methods: ['manual_bank','midtrans']}
--
-- Semua credential-bearing field HANYA di-return ke admin (not user-facing);
-- endpoint public list mask credential field.
CREATE TABLE IF NOT EXISTS payment_methods (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT NOT NULL UNIQUE,     -- 'midtrans' | 'paylabs' | 'manual_bank' | 'deposit_wallet'
    label        TEXT NOT NULL,            -- "Midtrans", "Transfer Bank Manual"
    type         TEXT NOT NULL CHECK (type IN ('gateway', 'manual', 'wallet')),
    enabled      BOOLEAN NOT NULL DEFAULT false,
    config       JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_enabled_sort
    ON payment_methods(enabled, sort_order) WHERE enabled = true;

-- Seed 4 default methods (semua disabled kecuali wallet — admin enable
-- explicit setelah isi credentials).
INSERT INTO payment_methods (code, label, type, enabled, sort_order) VALUES
    ('deposit_wallet',  'Wallet Prabayar',       'wallet',  true,  10),
    ('midtrans',        'Midtrans (Snap)',       'gateway', false, 20),
    ('paylabs',         'Paylabs',               'gateway', false, 30),
    ('manual_bank',     'Transfer Bank Manual',  'manual',  false, 40)
ON CONFLICT (code) DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS idx_payment_methods_enabled_sort;
DROP TABLE IF EXISTS payment_methods;
