-- +goose Up

-- learning_materials parent/child hierarchy (1 level) + ordering.
-- parent_id NULL = top-level materi; FK ON DELETE SET NULL supaya hapus parent
-- tidak cascade bunuh children — children jadi top-level otomatis (safe).
-- sort_order kecil = tampil duluan di sidebar.
--
-- URL slug tetap flat (unique per site). Hierarchy semata untuk sidebar nav
-- + breadcrumb. Zero perubahan URL existing → link lama 100% aman.

ALTER TABLE learning_materials
    ADD COLUMN IF NOT EXISTS parent_id  UUID,
    ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- FK terpisah dari ADD COLUMN supaya aman kalau re-run (ADD CONSTRAINT IF NOT
-- EXISTS belum didukung Postgres 16, pakai DO block idempotent).
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'learning_materials'
          AND constraint_name = 'learning_materials_parent_fk'
    ) THEN
        ALTER TABLE learning_materials
            ADD CONSTRAINT learning_materials_parent_fk
            FOREIGN KEY (parent_id) REFERENCES learning_materials(id)
            ON DELETE SET NULL;
    END IF;
END$$;
-- +goose StatementEnd

-- Index untuk query sidebar tree: WHERE site_id=X ORDER BY parent_id, sort_order.
CREATE INDEX IF NOT EXISTS idx_learning_materials_site_parent_order
    ON learning_materials(site_id, parent_id, sort_order);

-- +goose Down

DROP INDEX IF EXISTS idx_learning_materials_site_parent_order;
ALTER TABLE learning_materials DROP CONSTRAINT IF EXISTS learning_materials_parent_fk;
ALTER TABLE learning_materials DROP COLUMN IF EXISTS sort_order;
ALTER TABLE learning_materials DROP COLUMN IF EXISTS parent_id;
