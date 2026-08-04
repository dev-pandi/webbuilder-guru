-- +goose Up
-- wallet_topups — track user self-service wallet top-up (deposit balance).
--
-- Flow:
--   1. User klik "Top-up Rp 100k" → POST /wallet/topup
--   2. Handler bikin invoice_id (linked ke invoices) + payment charge via gateway
--   3. Simpan row wallet_topups {user_id, invoice_id, amount, status=pending_payment}
--   4. User bayar → payment webhook → ExecuteAfterPayment callback:
--      - Cek invoice metadata kind=topup → cari row wallet_topups by invoice_id
--      - Credit wallet ledger (delta=+amount, reason=topup, reference_id=invoice_id)
--      - Update wallet_topups.status=credited + credited_at
--   5. Frontend poll /wallet/topup/:id sampai status terminal.
--
-- Status enum:
--   pending_payment      — invoice created, gateway charge initiated, awaiting webhook
--   credited             — webhook success + ledger credit done (terminal, happy path)
--   failed               — payment webhook rejected (declined/expired) atau ledger error
--   expired              — invoice expired tanpa payment
--   cancelled            — user cancel manual (rare, admin action)
CREATE TABLE IF NOT EXISTS wallet_topups (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_id     UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE UNIQUE,
    amount         BIGINT NOT NULL CHECK (amount > 0),   -- IDR minor unit
    currency       TEXT NOT NULL DEFAULT 'IDR',
    payment_method TEXT NOT NULL,                        -- 'midtrans' | 'paylabs' | 'manual_bank'
    payment_url    TEXT NOT NULL DEFAULT '',             -- redirect URL dari gateway (Snap/checkout)
    instructions   TEXT NOT NULL DEFAULT '',             -- untuk manual_bank (markdown)
    status         TEXT NOT NULL DEFAULT 'pending_payment',
    reason         TEXT NOT NULL DEFAULT '',             -- diisi kalau failed
    ledger_id      UUID,                                 -- FK ke wallet_ledger.id setelah credit
    credited_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_user_created
    ON wallet_topups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_topups_status
    ON wallet_topups(status) WHERE status = 'pending_payment';

-- +goose Down
DROP INDEX IF EXISTS idx_wallet_topups_status;
DROP INDEX IF EXISTS idx_wallet_topups_user_created;
DROP TABLE IF EXISTS wallet_topups;
