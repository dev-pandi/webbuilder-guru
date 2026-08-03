-- +goose Up
-- Wallet internal — authoritative deposit balance per user di web builder.
-- Menggantikan legacy wallet yang proxy ke registrar-api PANDI.
--
-- Design:
--   - wallet_balances: 1 row per user (idempotent UPSERT saat first topup).
--     Currency saat ini hardcoded IDR — future multi-currency butuh kolom
--     tambahan (skip untuk MVP).
--   - wallet_ledger: append-only journal, source of truth untuk audit +
--     balance reconciliation. Kalau balance drift dari sum(delta), ledger
--     yang menang (rebuild balance dari ledger scan).
--
-- Ledger reason enum (string convention, tidak di-DB constraint supaya
-- fleksibel tambah reason baru tanpa migration):
--   'topup'          — user deposit (invoice → paid → credit)
--   'debit_register' — bayar register domain
--   'debit_renew'    — bayar renew domain
--   'refund'         — refund transaksi (rare, admin action)
--   'admin_adjust'   — manual admin adjustment (audit di metadata)
--
-- Reference: reference_id = invoice_id UUID biasanya. Untuk topup dari
-- gateway, reference_id = topup_id (invoice khusus topup).
CREATE TABLE IF NOT EXISTS wallet_balances (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance       BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    currency      TEXT NOT NULL DEFAULT 'IDR',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta         BIGINT NOT NULL,  -- + topup/refund, - debit/adjust down
    reason        TEXT NOT NULL,
    reference_id  UUID,              -- opsional: invoice_id / topup_id
    balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
    ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference
    ON wallet_ledger(reference_id) WHERE reference_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_wallet_ledger_reference;
DROP INDEX IF EXISTS idx_wallet_ledger_user_created;
DROP TABLE IF EXISTS wallet_ledger;
DROP TABLE IF EXISTS wallet_balances;
