-- +goose Up
-- User compliance documents (KTP/NPWP/SITU/Passport/KK) untuk domain register
-- di TLD yang butuh verifikasi identitas (mis. .id per regulasi Kemenkominfo).
--
-- Design:
--   - Blob TIDAK disimpan di tabel — hanya storage_key (pointer ke assets.Storage).
--     Storage backend bisa local disk atau S3 (config-driven). Blob dihapus
--     oleh handler saat DELETE row.
--   - category_id = SMALLINT (enum di code, bukan FK ke tabel terpisah supaya
--     seed lebih ringan). Katalog di documents_local/categories.go.
--   - PII: filename biasanya user-provided ("KTP scan.jpg") — tetap simpan
--     apa adanya untuk UX. Storage_key = opaque random path, tidak leak
--     identitas via URL scanning.
CREATE TABLE IF NOT EXISTS documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id   SMALLINT NOT NULL,
    filename      TEXT NOT NULL,
    storage_key   TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_created
    ON documents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_category
    ON documents(user_id, category_id);

-- +goose Down
DROP INDEX IF EXISTS idx_documents_user_category;
DROP INDEX IF EXISTS idx_documents_user_created;
DROP TABLE IF EXISTS documents;
