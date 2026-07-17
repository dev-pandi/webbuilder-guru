-- +goose Up
-- OAuth (Google) support.
-- Users created via Google will have password_hash = NULL until they set one
-- via the existing password-reset flow. Existing users can also login via
-- Google when their email matches — we auto-link by setting oauth_google_sub.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS oauth_google_sub TEXT;

ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

-- Partial unique index so the same Google account (sub) can only bind to one user.
-- NULL sub is allowed unlimited (password-only users).
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_google_sub_uniq
    ON users (oauth_google_sub)
    WHERE oauth_google_sub IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS users_oauth_google_sub_uniq;
ALTER TABLE users DROP COLUMN IF EXISTS oauth_google_sub;
-- password_hash NOT NULL is NOT restored — down-migration must not fail on
-- existing Google-only users. Operators dropping this feature should ensure
-- every user has a password before re-tightening the constraint manually.
