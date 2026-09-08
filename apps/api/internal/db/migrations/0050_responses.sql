-- +goose Up

-- responses (istilah publik: "Tanggapan"): komentar pengunjung pada artikel.
-- Spec §18: workflow moderasi Submitted → Pending → Approved/Rejected.
-- Semua default `pending`; hanya guru pemilik site yang boleh moderasi.

CREATE TABLE IF NOT EXISTS responses (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                   UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    article_id                UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    author_name               TEXT NOT NULL,
    author_role               TEXT NOT NULL,            -- guru | siswa | orang-tua | pembaca
    author_email_private      TEXT NOT NULL DEFAULT '', -- never exposed publicly
    body                      TEXT NOT NULL,
    status                    TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
    moderated_at              TIMESTAMPTZ,
    moderated_by_teacher_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    submitter_ip              TEXT NOT NULL DEFAULT '', -- for anti-spam / rate-limit audit
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT responses_role_valid CHECK (
        author_role IN ('guru','siswa','orang-tua','pembaca')
    ),
    CONSTRAINT responses_status_valid CHECK (
        status IN ('pending','approved','rejected')
    )
);

CREATE INDEX IF NOT EXISTS idx_responses_site_status_created
    ON responses(site_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_article_status
    ON responses(article_id, status);
CREATE INDEX IF NOT EXISTS idx_responses_site_created
    ON responses(site_id, created_at DESC);

-- +goose Down

DROP INDEX IF EXISTS idx_responses_site_created;
DROP INDEX IF EXISTS idx_responses_article_status;
DROP INDEX IF EXISTS idx_responses_site_status_created;
DROP TABLE IF EXISTS responses;
