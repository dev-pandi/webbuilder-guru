-- +goose Up
-- Cache registrar contact_id per user setelah first successful contact
-- sync. Dipakai contactsync.SyncUser untuk pilih endpoint:
--   - NULL      → iterate domain-scoped (bootstrap; capture id dari response)
--   - non-NULL  → single PATCH /reseller/contacts/:id (efisien, tidak butuh
--                 domain aktif)
ALTER TABLE users ADD COLUMN IF NOT EXISTS registrar_contact_id BIGINT;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS registrar_contact_id;
