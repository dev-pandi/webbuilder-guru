-- Filter rentang tanggal terdaftar + export keyset (registered_at, id) di
-- /admin/domain. Tanpa index ini tiap potongan export men-scan + sort
-- seluruh tabel.

-- +goose Up
CREATE INDEX IF NOT EXISTS idx_registered_domains_registered_at
    ON registered_domains (registered_at, id);

-- +goose Down
DROP INDEX IF EXISTS idx_registered_domains_registered_at;
