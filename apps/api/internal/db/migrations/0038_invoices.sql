-- +goose Up
-- Invoice state machine — authoritative source untuk billing di web builder.
--
-- Numbering scheme: 'INV-YYYY-MM-NNNNNN' (sequential per bulan).
-- Generate atomic pakai advisory lock (di service layer).
--
-- Status transition:
--   draft         → unpaid       (invoice issued, charge initiated di gateway)
--   unpaid        → paid         (webhook payment success)
--   unpaid        → expired      (due_at lewat)
--   unpaid        → cancelled    (user cancel manual atau admin)
--   paid          → refund       (rare — refund window)
CREATE TABLE IF NOT EXISTS invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number          TEXT NOT NULL UNIQUE,          -- 'INV-2026-08-000123'
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    purchased_by    UUID REFERENCES users(id) ON DELETE SET NULL, -- reseller/agent kalau on-behalf
    subtotal        BIGINT NOT NULL,               -- sum(lines.subtotal), IDR minor unit
    tax_rate        NUMERIC(5,4) NOT NULL,         -- capture rate saat issuance (0.11 = 11%)
    tax_amount      BIGINT NOT NULL,               -- computed dari subtotal * tax_rate
    total           BIGINT NOT NULL,               -- subtotal + tax_amount
    currency        TEXT NOT NULL DEFAULT 'IDR',
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','unpaid','paid','expired','refund','cancelled')),
    payment_method  TEXT NOT NULL,                 -- code dari payment_methods.code
    payment_gw_ref  TEXT,                          -- Midtrans transaction_id, dsb.
    paid_at         TIMESTAMPTZ,
    due_at          TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb  -- domain, years, promo_code, job_id, dsb.
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_created ON invoices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_at) WHERE status = 'unpaid';
CREATE INDEX IF NOT EXISTS idx_invoices_gw_ref ON invoices(payment_gw_ref) WHERE payment_gw_ref IS NOT NULL;

-- Line items per invoice. FK cascade — invoice delete = lines delete.
-- Untuk MVP: 1 invoice biasanya 1 line (register/renew domain). Multi-line
-- reserved untuk future (paket + hosting, dsb.).
CREATE TABLE IF NOT EXISTS invoice_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,                -- "Register .id — myshop.id (2 tahun)"
    quantity    INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price  BIGINT NOT NULL,              -- IDR minor unit
    subtotal    BIGINT NOT NULL,              -- quantity * unit_price (denormalized)
    sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id, sort_order);

-- +goose Down
DROP INDEX IF EXISTS idx_invoice_lines_invoice;
DROP TABLE IF EXISTS invoice_lines;
DROP INDEX IF EXISTS idx_invoices_gw_ref;
DROP INDEX IF EXISTS idx_invoices_status_due;
DROP INDEX IF EXISTS idx_invoices_user_created;
DROP TABLE IF EXISTS invoices;
