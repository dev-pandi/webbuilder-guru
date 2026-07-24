-- +goose Up
-- Forms module — user config form (kontak / newsletter / custom) di editor,
-- submission dari visitor situs di-simpan di sini + trigger email ke owner.
--
-- Design:
--   - `forms` = definisi form per situs. `fields_json` = schema fields
--     (array of {name, label, type, required}). `notify_email` opsional —
--     kalau di-set, submission notify via email (via existing mail.Sender).
--   - `form_submissions` = raw submission data (`data_json`) + IP + UA
--     untuk anti-spam trace. FK cascade — kalau form dihapus, submissions
--     ikut hapus (user tidak akan miss data yang mereka sengaja delete).
--   - Site FK cascade juga → hapus site = hapus semua form + submissions.
--
-- Ownership: query wajib JOIN sites WHERE user_id — jangan trust form_id
-- dari client tanpa cek.

CREATE TABLE IF NOT EXISTS forms (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    fields_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
    notify_email  TEXT NOT NULL DEFAULT '',
    -- Kind = template default: "contact" | "newsletter" | "custom".
    -- Frontend adaptive rendering + validation defaults.
    kind          TEXT NOT NULL DEFAULT 'contact',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_forms_site_id ON forms(site_id);

CREATE TABLE IF NOT EXISTS form_submissions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id      UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    data_json    JSONB NOT NULL,
    source_ip    TEXT NOT NULL DEFAULT '',
    user_agent   TEXT NOT NULL DEFAULT '',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id ON form_submissions(form_id, submitted_at DESC);

-- +goose Down
DROP INDEX IF EXISTS idx_form_submissions_form_id;
DROP TABLE IF EXISTS form_submissions;
DROP INDEX IF EXISTS idx_forms_site_id;
DROP TABLE IF EXISTS forms;
