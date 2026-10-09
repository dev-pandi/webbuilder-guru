-- +goose Up

-- Generalize responses dari exclusive article-child jadi polymorphic parent:
-- bisa article ATAU learning_material. Hindari table terpisah supaya moderation
-- UI + ownership check + status machinery tetap satu kode path.

ALTER TABLE responses
    ALTER COLUMN article_id DROP NOT NULL;

ALTER TABLE responses
    ADD COLUMN IF NOT EXISTS learning_material_id UUID
        REFERENCES learning_materials(id) ON DELETE CASCADE;

-- Exactly one parent harus di-set. XOR via CHECK supaya DB-level enforcement
-- (bukan hanya kepercayaan ke handler).
ALTER TABLE responses
    DROP CONSTRAINT IF EXISTS responses_parent_xor;
ALTER TABLE responses
    ADD CONSTRAINT responses_parent_xor CHECK (
        (article_id IS NOT NULL AND learning_material_id IS NULL)
        OR (article_id IS NULL AND learning_material_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS idx_responses_material_status
    ON responses(learning_material_id, status);

-- +goose Down

DROP INDEX IF EXISTS idx_responses_material_status;
ALTER TABLE responses DROP CONSTRAINT IF EXISTS responses_parent_xor;
ALTER TABLE responses DROP COLUMN IF EXISTS learning_material_id;
-- NOTE: tidak restore NOT NULL ke article_id karena baris baru yang parent-nya
-- learning_material akan punya article_id = NULL. Down jalur destructive untuk
-- schema baru; dev yg rollback asumsi fresh DB.
