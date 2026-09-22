-- +goose Up
-- layout_json — shared header/footer per site. Struktur:
--   {
--     "header": [ { "type": "GuruNavigation", "props": {...} }, ... ],
--     "footer": [ { "type": "GuruFooter", "props": {...} }, ... ]
--   }
--
-- Sebelumnya header/footer duplicate di setiap `pages.tree_json` — edit di
-- 1 page tidak propagate ke page lain. Sekarang site punya layout tunggal,
-- renderer prepend header + append footer ke setiap page saat render.
--
-- Default `{}` (empty layout) — sites lama tetap render `pages.tree_json`
-- apa adanya sampai data migration extract header/footer ke sini.
--
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'sites' AND column_name = 'layout_json'
    ) THEN
        ALTER TABLE sites ADD COLUMN layout_json JSONB NOT NULL DEFAULT '{}'::jsonb;
    END IF;
END$$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE sites DROP COLUMN IF EXISTS layout_json;
