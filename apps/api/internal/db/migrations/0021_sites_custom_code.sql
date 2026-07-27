-- +goose Up
-- Custom code injection per situs — user tempel raw HTML/JS di dua slot:
--   * custom_head_code      — di-inject persis sebelum </head>. Cocok untuk
--     GA/GTM, Meta Pixel, meta tag verifikasi (Google Search Console, dll).
--   * custom_body_end_code  — di-inject persis sebelum </body>. Cocok untuk
--     chat widget (Tawk, Crisp), heatmap tools, deferred scripts.
--
-- Isi field TIDAK di-sanitize — user diberitahu risk di UI (raw HTML). Batas
-- ukuran di-enforce di handler layer (16KB / field) untuk cegah abuse.
ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS custom_head_code     TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS custom_body_end_code TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE sites
    DROP COLUMN IF EXISTS custom_body_end_code,
    DROP COLUMN IF EXISTS custom_head_code;
