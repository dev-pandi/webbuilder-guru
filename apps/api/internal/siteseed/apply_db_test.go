package siteseed

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL kosong — skip integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func newTestSite(t *testing.T, pool *pgxpool.Pool) *Target {
	t.Helper()
	ctx := context.Background()
	userID, siteID := uuid.New(), uuid.New()
	if _, err := pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, 'x', 'Guru Uji')`,
		userID, "seed-"+userID.String()+"@example.test"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO sites (id, user_id, slug, name, status) VALUES ($1, $2, $3, 'Situs Uji', 'published')`,
		siteID, userID, "seed-"+siteID.String()[:8]); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		// Background: t.Context() is already cancelled when Cleanup runs.
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})
	tgt, err := FindSite(ctx, pool, siteID.String())
	if err != nil {
		t.Fatal(err)
	}
	return tgt
}

func testSpec(t *testing.T) *Spec {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "seed.json"), `{
		"site": {
			"name": "Bu Uji",
			"theme": {"colors": {"primary": "#123456"}},
			"header": [{"type": "GuruNavbar", "props": {"brandName": "Bu Uji"}}]
		},
		"profile": {"subject_or_field": "Guru Matematika"},
		"pages": [
			{"slug": "home", "title": "Beranda", "is_home": true, "blocks": [{"type": "GuruHero", "props": {"title": "Halo"}}]},
			{"slug": "kelas", "title": "Kelas", "blocks": [{"type": "GuruPlusFAQ", "props": {}}]}
		],
		"banners": [{"title": "Promo A", "image": "https://cdn.test/a.png", "href": "https://example.test", "alt": "A"}]
	}`)
	writeFile(t, filepath.Join(dir, "tulisan", "ceritaku", "cerita-satu.md"),
		"---\ntitle: Cerita Satu\ndate: 2026-10-01\ntags: Aljabar\n---\nIsi cerita.")
	writeFile(t, filepath.Join(dir, "tulisan", "forum-diskusi", "topik.md"),
		"---\ntitle: Topik\ncomments: false\n---\nApa pendapatmu?")
	writeFile(t, filepath.Join(dir, "materi", "bab.md"), "---\ntitle: Bab\norder: 1\n---\nPengantar.")
	writeFile(t, filepath.Join(dir, "materi", "anak.md"), "---\ntitle: Anak\nparent: bab\n---\nIsi.")
	s, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestApply_IdempotentAndPrune(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	tgt := newTestSite(t, pool)

	// A page and article that the seed doesn't know about.
	if _, err := pool.Exec(ctx,
		`INSERT INTO pages (site_id, slug, title, is_home) VALUES ($1, 'lama', 'Lama', true)`, tgt.SiteID); err != nil {
		t.Fatal(err)
	}

	res, err := Apply(ctx, pool, &fakeUploader{}, tgt, testSpec(t), Options{})
	if err != nil {
		t.Fatal(err)
	}
	if res.Pages.Created != 2 || res.Articles.Created != 2 || res.Materials.Created != 2 || res.Banners.Created != 1 {
		t.Fatalf("run pertama: %+v", res)
	}

	var homes int
	var homeSlug string
	if err := pool.QueryRow(ctx,
		`SELECT count(*), max(slug) FROM pages WHERE site_id = $1 AND is_home`, tgt.SiteID).Scan(&homes, &homeSlug); err != nil {
		t.Fatal(err)
	}
	if homes != 1 || homeSlug != "home" {
		t.Errorf("home = %d (%s), mau tepat satu 'home'", homes, homeSlug)
	}

	var live json.RawMessage
	if err := pool.QueryRow(ctx,
		`SELECT published_tree_json FROM pages WHERE site_id = $1 AND slug = 'home'`, tgt.SiteID).Scan(&live); err != nil {
		t.Fatal(err)
	}
	var tree struct{ Blocks []json.RawMessage }
	_ = json.Unmarshal(live, &tree)
	if len(tree.Blocks) != 2 || blockType(tree.Blocks[0]) != "GuruStyles" {
		t.Errorf("halaman live harus berisi GuruStyles + GuruHero: %s", live)
	}

	var comments bool
	if err := pool.QueryRow(ctx,
		`SELECT comments_enabled FROM articles WHERE site_id = $1 AND slug = 'topik'`, tgt.SiteID).Scan(&comments); err != nil {
		t.Fatal(err)
	}
	if !comments {
		t.Error("forum-diskusi harus selalu menerima tanggapan")
	}

	var parentOK bool
	if err := pool.QueryRow(ctx, `
		SELECT c.parent_id = p.id FROM learning_materials c, learning_materials p
		 WHERE c.site_id = $1 AND p.site_id = $1 AND c.slug = 'anak' AND p.slug = 'bab'`, tgt.SiteID).Scan(&parentOK); err != nil {
		t.Fatal(err)
	}
	if !parentOK {
		t.Error("materi anak harus menunjuk ke induknya")
	}

	var subject string
	_ = pool.QueryRow(ctx, `SELECT subject_or_field FROM users WHERE id = $1`, tgt.OwnerID).Scan(&subject)
	if subject != "Guru Matematika" {
		t.Errorf("profil tidak tersimpan: %q", subject)
	}

	// Second run: everything is an update, and prune removes the stray page.
	res, err = Apply(ctx, pool, &fakeUploader{}, tgt, testSpec(t), Options{Prune: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.Pages.Created != 0 || res.Pages.Updated != 2 || res.Pages.Deleted != 1 ||
		res.Articles.Updated != 2 || res.Materials.Updated != 2 || res.Banners.Updated != 1 {
		t.Fatalf("run kedua: %+v", res)
	}
}

func TestApply_DryRunAndDraftLeaveLiveAlone(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	tgt := newTestSite(t, pool)

	if _, err := Apply(ctx, pool, nil, tgt, testSpec(t), Options{DryRun: true}); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = pool.QueryRow(ctx, `SELECT count(*) FROM pages WHERE site_id = $1`, tgt.SiteID).Scan(&n)
	if n != 0 {
		t.Fatalf("dry-run menyimpan %d halaman", n)
	}

	if _, err := Apply(ctx, pool, &fakeUploader{}, tgt, testSpec(t), Options{Draft: true}); err != nil {
		t.Fatal(err)
	}
	var published *json.RawMessage
	if err := pool.QueryRow(ctx,
		`SELECT published_tree_json FROM pages WHERE site_id = $1 AND slug = 'home'`, tgt.SiteID).Scan(&published); err != nil {
		t.Fatal(err)
	}
	if published != nil {
		t.Errorf("-draft tidak boleh mengisi versi live: %s", *published)
	}
}
