-- +goose Up
-- user_documents = library dokumen per-user (KTP, NPWP, SIUP, akta, dst.).
-- File asli disimpan di asset storage (local disk atau S3) — kolom `storage_key`
-- adalah path/object key relative ke storage. Web builder tidak expose public
-- URL untuk dokumen sensitif; download hanya via handler yang guard user_id.
--
-- Category dan `registrar_category_id` sinkron dengan registrar-api's
-- categories.id — supaya saat forward multipart ke reseller endpoint tidak
-- perlu mapping ulang.
CREATE TABLE IF NOT EXISTS user_documents (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registrar_category_id INT NOT NULL DEFAULT 0, -- match registrar-api's categories.id (0 = uncategorized)
    category_label        TEXT NOT NULL DEFAULT '',
    name                  TEXT NOT NULL,          -- user-provided label ("KTP Direktur", "NPWP Perusahaan")
    storage_key           TEXT NOT NULL,          -- relative key in asset storage (e.g. "documents/<uuid>.jpg")
    original_filename     TEXT NOT NULL DEFAULT '',
    mime                  TEXT NOT NULL DEFAULT '',
    size_bytes            BIGINT NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_documents_user_id ON user_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_documents_user_category
    ON user_documents(user_id, registrar_category_id);

-- +goose Down
DROP TABLE IF EXISTS user_documents;
