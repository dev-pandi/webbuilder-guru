-- +goose Up
-- Reseller + Agent role support (plan-reseller-roles.md section 4.1)
--
-- Perubahan:
--   1. Rename `role='user'` legacy → `role='client'` (semantic konsisten dengan
--      B2B partner model: admin | reseller | agent | client)
--   2. Tambah `parent_reseller_id` — untuk agent, FK ke reseller induk
--   3. Tambah `reseller_display_name` — nama bisnis reseller di email invite ke client
--   4. Tambah `reseller_status` — pending_approval | active | suspended (hanya untuk role='reseller')
--   5. Tambah `reseller_tier` — untuk future markup pricing tier (basic/gold/platinum)
--
-- Backward compat: existing user dengan role='user' migrasi ke role='client'.
-- Existing role='admin' TETAP admin — tidak ter-affect.
-- Kolom baru semua nullable atau default '', jadi INSERT existing tetap jalan
-- tanpa perubahan.

-- Step 1: rename legacy 'user' → 'client'
UPDATE users SET role = 'client' WHERE role = 'user';

-- Step 2: tambah kolom baru
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS parent_reseller_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reseller_display_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reseller_status       TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reseller_tier         TEXT NOT NULL DEFAULT '';

-- Step 3: index
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_parent_reseller_id ON users(parent_reseller_id)
    WHERE parent_reseller_id IS NOT NULL;

-- Step 4: ganti default role dari 'user' → 'client' untuk INSERT baru
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'client';

-- Guard invariant (comment doc — enforce di app layer):
--   - role IN ('admin', 'reseller', 'agent', 'client')
--   - parent_reseller_id != NULL kalau role='agent'
--   - reseller_display_name != '' kalau role='reseller'
--   - reseller_status IN ('pending_approval', 'active', 'suspended') kalau role='reseller'

-- +goose Down
DROP INDEX IF EXISTS idx_users_parent_reseller_id;
DROP INDEX IF EXISTS idx_users_role;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE users
    DROP COLUMN IF EXISTS reseller_tier,
    DROP COLUMN IF EXISTS reseller_status,
    DROP COLUMN IF EXISTS reseller_display_name,
    DROP COLUMN IF EXISTS parent_reseller_id;
-- Restore semantic lama
UPDATE users SET role = 'user' WHERE role = 'client';
