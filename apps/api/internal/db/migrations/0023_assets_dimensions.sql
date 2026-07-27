-- +goose Up
-- Asset dimensions untuk CLS prevention. Renderer emit <img width=X height=Y>
-- supaya browser reserve slot yang benar sebelum image loaded → cegah layout
-- shift saat image render (Cumulative Layout Shift = penalty Core Web Vitals).
--
-- Auto-populated di upload handler (image.DecodeConfig — parse header saja,
-- tidak decode pixels penuh → cepat + hemat memory). Nullable karena:
--   1. Existing rows tidak punya (belum diproses)
--   2. Non-image file (masa depan) tidak relevan
ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS width  INT,
    ADD COLUMN IF NOT EXISTS height INT;

-- +goose Down
ALTER TABLE assets
    DROP COLUMN IF EXISTS height,
    DROP COLUMN IF EXISTS width;
