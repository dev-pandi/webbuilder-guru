-- Data migration: extract leading Navbar/GuruNavbar + trailing Footer/GuruFooter
-- dari page home tiap site → populate sites.layout_json. Sekaligus strip
-- header/footer dari SEMUA pages (draft + published) supaya renderer tidak
-- render ganda setelah shared layout aktif.
--
-- Skip sites yang sudah punya layout_json non-empty (idempotent + hormati
-- edit manual guru pasca-migration). Skip page yang tidak punya home.

-- +goose Up

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION _mig_0057_strip_layout_blocks(t JSONB)
RETURNS JSONB AS $$
DECLARE
  blks JSONB;
  nb INT;
  he INT;
  fs INT;
  stripped JSONB;
  j INT;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  blks := COALESCE(t->'blocks', '[]'::jsonb);
  IF jsonb_typeof(blks) <> 'array' THEN RETURN t; END IF;
  nb := jsonb_array_length(blks);
  he := 0;
  WHILE he < nb LOOP
    IF (blks->he->>'type') IN ('Navbar', 'GuruNavbar') THEN
      he := he + 1;
    ELSE EXIT;
    END IF;
  END LOOP;
  fs := nb;
  WHILE fs > he LOOP
    IF (blks->(fs - 1)->>'type') IN ('Footer', 'GuruFooter') THEN
      fs := fs - 1;
    ELSE EXIT;
    END IF;
  END LOOP;
  IF he = 0 AND fs = nb THEN RETURN t; END IF;
  stripped := '[]'::jsonb;
  FOR j IN he..fs - 1 LOOP
    stripped := stripped || jsonb_build_array(blks->j);
  END LOOP;
  RETURN jsonb_set(t, '{blocks}', stripped);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
-- +goose StatementEnd

-- +goose StatementBegin
DO $$
DECLARE
  s_id UUID;
  home_tree JSONB;
  home_blocks JSONB;
  n_blocks INT;
  header_end INT;
  footer_start INT;
  header_blocks JSONB;
  footer_blocks JSONB;
  i INT;
BEGIN
  FOR s_id IN
    SELECT id FROM sites WHERE layout_json = '{}'::jsonb OR layout_json IS NULL
  LOOP
    SELECT tree_json INTO home_tree
      FROM pages
     WHERE site_id = s_id AND is_home = true
     LIMIT 1;
    IF home_tree IS NULL THEN CONTINUE; END IF;

    home_blocks := COALESCE(home_tree->'blocks', '[]'::jsonb);
    IF jsonb_typeof(home_blocks) <> 'array' THEN CONTINUE; END IF;
    n_blocks := jsonb_array_length(home_blocks);
    IF n_blocks = 0 THEN CONTINUE; END IF;

    header_end := 0;
    WHILE header_end < n_blocks LOOP
      IF (home_blocks->header_end->>'type') IN ('Navbar', 'GuruNavbar') THEN
        header_end := header_end + 1;
      ELSE EXIT;
      END IF;
    END LOOP;

    footer_start := n_blocks;
    WHILE footer_start > header_end LOOP
      IF (home_blocks->(footer_start - 1)->>'type') IN ('Footer', 'GuruFooter') THEN
        footer_start := footer_start - 1;
      ELSE EXIT;
      END IF;
    END LOOP;

    -- Kalau tidak ada header/footer terdeteksi di home, skip site ini.
    IF header_end = 0 AND footer_start = n_blocks THEN CONTINUE; END IF;

    header_blocks := '[]'::jsonb;
    FOR i IN 0..header_end - 1 LOOP
      header_blocks := header_blocks || jsonb_build_array(home_blocks->i);
    END LOOP;
    footer_blocks := '[]'::jsonb;
    FOR i IN footer_start..n_blocks - 1 LOOP
      footer_blocks := footer_blocks || jsonb_build_array(home_blocks->i);
    END LOOP;

    UPDATE sites
       SET layout_json = jsonb_build_object('header', header_blocks, 'footer', footer_blocks)
     WHERE id = s_id;

    -- Strip header/footer dari SEMUA pages (draft + published) supaya tidak
    -- ter-render dua kali setelah shared layout aktif.
    UPDATE pages
       SET tree_json = _mig_0057_strip_layout_blocks(tree_json),
           published_tree_json = _mig_0057_strip_layout_blocks(published_tree_json)
     WHERE site_id = s_id;
  END LOOP;
END $$;
-- +goose StatementEnd

DROP FUNCTION IF EXISTS _mig_0057_strip_layout_blocks(JSONB);

-- +goose Down
-- Irreversible: kita tidak simpan snapshot pre-migration jadi tidak bisa
-- rebuild page tree lama. Down = no-op; kalau perlu rollback, restore DB
-- dari backup pre-migration.
SELECT 1;
