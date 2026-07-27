-- +goose Up
-- Scheduled publish — content team bisa jadwalkan draft untuk auto-publish
-- di masa depan. Background worker di apps/api scan tabel ini tiap ~60 detik.
--
-- Partial index krusial: 99%+ row punya scheduled_publish_at = NULL (tidak
-- terjadwal), partial index bikin lookup worker cuma sentuh baris relevan.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pages_scheduled_publish_due
    ON pages (scheduled_publish_at)
    WHERE scheduled_publish_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_pages_scheduled_publish_due;
ALTER TABLE pages DROP COLUMN IF EXISTS scheduled_publish_at;
