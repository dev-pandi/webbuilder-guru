-- +goose Up
-- wallet_topups: kolom bukti transfer untuk manual_bank flow.
-- User upload bukti (image/PDF) setelah transfer manual, admin verify + mark
-- invoice paid → topup credited. Blob disimpan di assets.Storage; kita cuma
-- track storage key + metadata.
ALTER TABLE wallet_topups
    ADD COLUMN IF NOT EXISTS proof_key         TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS proof_mime        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS proof_size        BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS proof_note        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMPTZ;

-- Index untuk admin dashboard: filter topups yang butuh review bukti transfer.
CREATE INDEX IF NOT EXISTS idx_wallet_topups_proof_pending
    ON wallet_topups(proof_uploaded_at DESC)
    WHERE status = 'pending_payment' AND proof_uploaded_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_wallet_topups_proof_pending;
ALTER TABLE wallet_topups
    DROP COLUMN IF EXISTS proof_uploaded_at,
    DROP COLUMN IF EXISTS proof_note,
    DROP COLUMN IF EXISTS proof_size,
    DROP COLUMN IF EXISTS proof_mime,
    DROP COLUMN IF EXISTS proof_key;
