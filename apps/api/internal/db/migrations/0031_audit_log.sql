-- +goose Up
-- Audit log — Phase 7. Append-only trail untuk aksi sensitif:
-- reseller approve/suspend, purchase on-behalf-of, invite agent/client,
-- wallet transaction, member add/remove.
--
-- Design:
--   - `actor_id` = user yang trigger aksi (nullable karena bisa system-initiated)
--   - `event`   = string enum stabil (mis. "reseller.approved", "purchase.created")
--   - `target_type` + `target_id` = entity yang di-mutate (mis. "user", <uuid>)
--   - `metadata` = JSONB flexible untuk field per-event (domain, amount, dst.)
--   - `created_at` = server timestamp, tidak boleh di-set client
--
-- Retention: append-only, tidak ada DELETE dari API. Purge ops-only (SQL manual)
-- kalau table jadi terlalu besar (>1M rows). Untuk MVP tidak perlu partitioning.

CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    event       TEXT NOT NULL,
    target_type TEXT,
    target_id   TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip          INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing: query pattern utama = paginate DESC + filter by event/actor/target.
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor      ON audit_log(actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_event      ON audit_log(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target     ON audit_log(target_type, target_id) WHERE target_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_audit_log_target;
DROP INDEX IF EXISTS idx_audit_log_event;
DROP INDEX IF EXISTS idx_audit_log_actor;
DROP INDEX IF EXISTS idx_audit_log_created_at;
DROP TABLE IF EXISTS audit_log;
