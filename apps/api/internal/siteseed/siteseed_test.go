package siteseed

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestSplitFrontMatter(t *testing.T) {
	fm, body, err := splitFrontMatter("\xEF\xBB\xBF---\r\ntitle: Halo: Dunia\r\ntags: A, B ,, C\r\n# komentar\r\n---\r\n\r\nIsi **tebal**.\r\n")
	if err != nil {
		t.Fatal(err)
	}
	if fm.str("title") != "Halo: Dunia" {
		t.Errorf("title = %q (titik dua setelah kunci pertama harus tetap jadi nilai)", fm.str("title"))
	}
	if got := strings.Join(fm.list("tags"), "|"); got != "A|B|C" {
		t.Errorf("tags = %q", got)
	}
	if body != "Isi **tebal**.\n" {
		t.Errorf("body = %q", body)
	}

	for name, src := range map[string]string{
		"tanpa pembuka": "title: x\n---\n",
		"tanpa penutup": "---\ntitle: x\n",
		"kunci dobel":   "---\ntitle: a\ntitle: b\n---\n",
		"tanpa titik2":  "---\njudul saja\n---\n",
	} {
		if _, _, err := splitFrontMatter(src); err == nil {
			t.Errorf("%s: harus error", name)
		}
	}
}

func TestFrontMatterDateIsWIB(t *testing.T) {
	d, err := frontMatter{"date": "2026-10-01"}.date("date")
	if err != nil {
		t.Fatal(err)
	}
	// 08:00 WIB = 01:00 UTC; still 1 Oktober in both zones.
	if got := d.UTC().Format("2006-01-02 15:04"); got != "2026-10-01 01:00" {
		t.Errorf("date = %s", got)
	}
	if _, err := (frontMatter{"date": "01-10-2026"}).date("date"); err == nil {
		t.Error("format salah harus error")
	}
}

func TestLoadRejectsTyposAndBadRubric(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "seed.json"), `{"pages":[]}`)
	writeFile(t, filepath.Join(dir, "tulisan", "ceritaku", "ok.md"), "---\ntitel: salah ketik\n---\nisi")
	if _, err := Load(dir); err == nil || !strings.Contains(err.Error(), "titel") {
		t.Fatalf("kunci salah ketik harus ditolak, err = %v", err)
	}

	writeFile(t, filepath.Join(dir, "tulisan", "ceritaku", "ok.md"), "---\ntitle: Benar\n---\nisi")
	writeFile(t, filepath.Join(dir, "tulisan", "opini", "x.md"), "---\ntitle: X\n---\nisi")
	if _, err := Load(dir); err == nil || !strings.Contains(err.Error(), "opini") {
		t.Fatalf("rubrik tak dikenal harus ditolak, err = %v", err)
	}
}

func TestLoadUnknownSeedJSONField(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "seed.json"), `{"halaman":[]}`)
	if _, err := Load(dir); err == nil {
		t.Fatal("field seed.json tak dikenal harus ditolak")
	}
}

func TestValidateMaterialHierarchy(t *testing.T) {
	s := &Spec{Materials: []MaterialSpec{
		{Slug: "bab", Title: "Bab", Status: "published"},
		{Slug: "anak", Title: "Anak", Status: "published", Parent: "bab"},
		{Slug: "cucu", Title: "Cucu", Status: "published", Parent: "anak"},
	}}
	err := s.validate()
	if err == nil || !strings.Contains(err.Error(), "maksimal satu tingkat") {
		t.Fatalf("materi bertingkat dua harus ditolak, err = %v", err)
	}
}

type fakeUploader struct{ calls []string }

func (f *fakeUploader) Upload(_ context.Context, abs string) (string, error) {
	f.calls = append(f.calls, filepath.Base(abs))
	return "https://cdn.test/" + filepath.Base(abs), nil
}

func TestResolveFilesRewritesEveryReference(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "img", "a.webp"), "x")
	s := &Spec{
		Dir: dir,
		Pages: []PageSpec{{Slug: "home", Blocks: []json.RawMessage{
			json.RawMessage(`{"type":"GuruHero","props":{"image":"./img/a.webp","ctaHref":"./kelas","zoom":3,"items":[{"cover":"./img/a.webp"}]}}`),
		}}},
		Articles: []ArticleSpec{{Cover: "./img/a.webp", Body: "Lihat ![gambar](./img/a.webp) ini."}},
		Banners:  []BannerSpec{{Image: "https://luar.test/b.png"}},
	}
	up := &fakeUploader{}
	if err := resolveFiles(context.Background(), s, up); err != nil {
		t.Fatal(err)
	}
	if len(up.calls) != 1 {
		t.Errorf("file sama harus diunggah sekali, dapat %d kali", len(up.calls))
	}
	block := string(s.Pages[0].Blocks[0])
	for _, want := range []string{`"image":"https://cdn.test/a.webp"`, `"cover":"https://cdn.test/a.webp"`, `"ctaHref":"./kelas"`, `"zoom":3`} {
		if !strings.Contains(block, want) {
			t.Errorf("blok tidak memuat %s: %s", want, block)
		}
	}
	if s.Articles[0].Cover != "https://cdn.test/a.webp" || !strings.Contains(s.Articles[0].Body, "](https://cdn.test/a.webp)") {
		t.Errorf("artikel tidak ter-rewrite: %+v", s.Articles[0])
	}
	if s.Banners[0].Image != "https://luar.test/b.png" {
		t.Errorf("URL luar harus dibiarkan: %s", s.Banners[0].Image)
	}
}

func TestResolveFilesRefusesEscapeAndSVG(t *testing.T) {
	parent := t.TempDir()
	dir := filepath.Join(parent, "seed")
	writeFile(t, filepath.Join(parent, "rahasia.png"), "x")
	writeFile(t, filepath.Join(dir, "img", "logo.svg"), "<svg/>")

	for _, ref := range []string{"./../rahasia.png", "./img/logo.svg", "./img/tidak-ada.png"} {
		s := &Spec{Dir: dir, Articles: []ArticleSpec{{Cover: ref}}}
		if err := resolveFiles(context.Background(), s, &fakeUploader{}); err == nil {
			t.Errorf("%s: harus ditolak", ref)
		}
	}
}

func TestWithGuruStyles(t *testing.T) {
	hero := json.RawMessage(`{"type":"GuruHero","props":{}}`)
	plus := json.RawMessage(`{"type":"GuruPlusFAQ","props":{}}`)

	if got := withGuruStyles([]json.RawMessage{hero}); blockType(got[0]) != "GuruStyles" || len(got) != 2 {
		t.Errorf("GuruStyles harus ditambahkan di depan: %s", got)
	}
	styled := []json.RawMessage{json.RawMessage(`{"type":"GuruStyles","props":{}}`), hero}
	if got := withGuruStyles(styled); len(got) != 2 {
		t.Errorf("jangan dobel GuruStyles: %d blok", len(got))
	}
	// GuruPlus* blocks inject their own stylesheet.
	if got := withGuruStyles([]json.RawMessage{plus}); len(got) != 1 {
		t.Errorf("GuruPlus saja tidak butuh GuruStyles: %d blok", len(got))
	}
}

func TestReadingMinutes(t *testing.T) {
	if got := readingMinutes(strings.Repeat("kata ", 401)); got != 3 {
		t.Errorf("401 kata = %d menit, mau 3", got)
	}
	if got := readingMinutes(""); got != 1 {
		t.Errorf("kosong = %d, mau 1", got)
	}
}
