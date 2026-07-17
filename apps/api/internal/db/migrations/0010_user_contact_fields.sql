-- +goose Up
-- Contact / postal fields on users. All nullable — existing accounts stay
-- untouched. Will be consumed by the domain registry integration (nantinya
-- WHOIS contact / EPP contact object butuh nama, tel, alamat lengkap).
--
-- Field size:
--   - phone_number   : E.164 max = "+" + 15 digits = 16 chars, tapi kita simpan
--                      juga format lokal user, jadi 32 aman untuk display + normalized.
--   - address        : 255 cukup untuk baris jalan lengkap.
--   - city / state   : 128 cukup untuk nama kota/provinsi Indonesia.
--   - postal_code    : 16 cukup untuk semua sistem pos di dunia (kebanyakan ≤10).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS address      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS city         TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS state        TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS postal_code  TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE users
    DROP COLUMN IF EXISTS postal_code,
    DROP COLUMN IF EXISTS state,
    DROP COLUMN IF EXISTS city,
    DROP COLUMN IF EXISTS address,
    DROP COLUMN IF EXISTS phone_number;
