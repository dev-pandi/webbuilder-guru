-- +goose Up

-- learning_materials.emoji — visual anchor di sidebar Fumadocs-style.
-- Opsional, 1 emoji character (atau pendek). Guru bisa pakai 🎯 📚 🖼 dsb
-- untuk bedakan topik di sidebar + landing card.

ALTER TABLE learning_materials
    ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '';

-- +goose Down

ALTER TABLE learning_materials DROP COLUMN IF EXISTS emoji;
