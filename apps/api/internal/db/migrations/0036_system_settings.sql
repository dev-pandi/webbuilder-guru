-- +goose Up
-- System settings — generic key-value untuk config yang perlu dinamis
-- (PPN rate, brand name, support contact, dsb.) yang admin bisa ubah tanpa
-- redeploy. Alternatif ke env var untuk value yang non-secret + operator-editable.
--
-- Key naming convention: `<namespace>.<key>` — mis. `tax.ppn_rate`, `brand.name`.
-- Value selalu string; consumer parse ke type sesuai konteks (Service methods).
CREATE TABLE IF NOT EXISTS system_settings (
    key          TEXT PRIMARY KEY,
    value        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by   UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Seed default settings — admin bisa edit dari admin panel.
INSERT INTO system_settings (key, value, description) VALUES
    ('tax.ppn_enabled',    'true',                    'Apply PPN ke invoice — set false untuk skip PPN'),
    ('tax.ppn_rate',       '0.11',                    'PPN rate desimal (0.11 = 11%). Ubah kalau regulasi berubah.'),
    ('tax.ppn_label',      'PPN 11%',                 'Label PPN yang muncul di invoice PDF'),
    ('brand.name',         'Web Builder',             'Nama brand di header, footer, dan invoice'),
    ('brand.support_email','support@example.com',     'Kontak support email — muncul di invoice + email footer'),
    ('brand.support_phone','',                        'Kontak telepon support (opsional)'),
    ('brand.company_name', '',                        'Nama badan hukum untuk invoice (kosong = pakai brand.name)'),
    ('brand.company_address','',                      'Alamat kantor untuk invoice header (opsional)'),
    ('brand.tax_id',       '',                        'NPWP perusahaan untuk invoice (opsional)')
ON CONFLICT (key) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS system_settings;
