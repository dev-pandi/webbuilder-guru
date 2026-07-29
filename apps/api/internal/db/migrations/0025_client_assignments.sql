-- +goose Up
-- Client assignment tracking untuk multi-tenant B2B (plan-reseller-roles.md 4.2).
-- Reseller/agent yang manage 1..N client — track siapa manage siapa + akses status.
--
-- Untuk agent: bisa punya assignment tanpa parent_reseller involvement direct
-- (agent yang trigger create client — access via own manager row).
-- Query "clients yang di-manage user X" = SELECT WHERE manager_id = X.
-- Query "reseller/agent yang manage client Y" = SELECT WHERE client_id = Y.

CREATE TABLE IF NOT EXISTS client_assignments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Manager: reseller ATAU agent (role di-cek app layer).
    manager_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Client yang di-manage (harus role='client').
    client_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Snapshot role manager saat assignment dibuat. Kalau agent naik jadi
    -- reseller, historical record tetap accurate.
    manager_role   TEXT NOT NULL,
        -- 'reseller' | 'agent'
    -- Editing access status:
    --   'setup'   → pre-handoff, manager full edit access
    --   'active'  → post-handoff, client bisa toggle (default 30d grace period)
    --   'revoked' → client cabut akses; manager lose all edit
    access_status  TEXT NOT NULL DEFAULT 'setup',
    -- Timeline
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    handed_off_at  TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,
    UNIQUE (manager_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_client_assignments_client_id ON client_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_assignments_manager_id ON client_assignments(manager_id);
CREATE INDEX IF NOT EXISTS idx_client_assignments_access_status ON client_assignments(access_status)
    WHERE access_status != 'revoked';

-- +goose Down
DROP INDEX IF EXISTS idx_client_assignments_access_status;
DROP INDEX IF EXISTS idx_client_assignments_manager_id;
DROP INDEX IF EXISTS idx_client_assignments_client_id;
DROP TABLE IF EXISTS client_assignments;
