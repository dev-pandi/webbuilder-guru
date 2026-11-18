// Package siteseed applies a folder-based content seed (pages, layout, theme,
// articles, learning materials, banners, guru profile) to one existing site.
// The folder is the desired state: re-running it updates rows in place, keyed
// by slug, so a seed can be edited and re-applied safely.
package siteseed

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Rubrics mirror the articles_rubric_valid CHECK constraint.
var validRubrics = map[string]bool{
	"ceritaku": true, "bacaanku": true, "inspirasiku": true,
	"bangsaku": true, "peradaban": true, "forum-diskusi": true,
}

var slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// Spec is the parsed seed folder.
type Spec struct {
	Dir       string
	Site      SiteSpec
	Profile   *ProfileSpec
	Pages     []PageSpec
	Banners   []BannerSpec
	Articles  []ArticleSpec
	Materials []MaterialSpec
}

type SiteSpec struct {
	Name   string            `json:"name"`
	Theme  json.RawMessage   `json:"theme"`
	Header []json.RawMessage `json:"header"`
	Footer []json.RawMessage `json:"footer"`
}

// ProfileSpec lives on the site OWNER's user row (the /guru directory card),
// so it is shared by every site that user owns. Empty fields are left alone.
type ProfileSpec struct {
	Name           string            `json:"name"`
	SubjectOrField string            `json:"subject_or_field"`
	ProfileImage   string            `json:"profile_image"`
	BioShort       string            `json:"bio_short"`
	BioLong        string            `json:"bio_long"`
	HeroStatement  string            `json:"hero_statement"`
	Quote          string            `json:"quote"`
	SocialLinks    []json.RawMessage `json:"social_links"`
}

type PageSpec struct {
	Slug   string            `json:"slug"`
	Title  string            `json:"title"`
	IsHome bool              `json:"is_home"`
	SEO    json.RawMessage   `json:"seo"`
	Blocks []json.RawMessage `json:"blocks"`
}

// BannerSpec is matched to existing rows by Title (internal_title).
type BannerSpec struct {
	Title string `json:"title"`
	Image string `json:"image"`
	Href  string `json:"href"`
	Alt   string `json:"alt"`
}

type ArticleSpec struct {
	File           string
	Rubric         string
	Slug           string
	Title          string
	Excerpt        string
	Body           string
	Cover          string
	Tags           []string
	Status         string
	Comments       bool
	ReadingTime    int
	PublishedAt    *time.Time
	SEOTitle       string
	SEODescription string
}

type MaterialSpec struct {
	File           string
	Slug           string
	Title          string
	Excerpt        string
	Summary        string
	Body           string
	Cover          string
	Tags           []string
	Status         string
	Emoji          string
	Parent         string
	Order          int
	PublishedAt    *time.Time
	SEOTitle       string
	SEODescription string
}

type seedFile struct {
	Site    SiteSpec     `json:"site"`
	Profile *ProfileSpec `json:"profile"`
	Pages   []PageSpec   `json:"pages"`
	Banners []BannerSpec `json:"banners"`
}

// Load reads <dir>/seed.json plus every Markdown file under <dir>/tulisan
// (articles, one sub-folder per rubric) and <dir>/materi (learning materials).
func Load(dir string) (*Spec, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(filepath.Join(abs, "seed.json"))
	if err != nil {
		return nil, fmt.Errorf("baca seed.json: %w", err)
	}
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	var f seedFile
	if err := dec.Decode(&f); err != nil {
		return nil, fmt.Errorf("seed.json: %w", err)
	}
	spec := &Spec{Dir: abs, Site: f.Site, Profile: f.Profile, Pages: f.Pages, Banners: f.Banners}

	if spec.Articles, err = loadArticles(filepath.Join(abs, "tulisan")); err != nil {
		return nil, err
	}
	if spec.Materials, err = loadMaterials(filepath.Join(abs, "materi")); err != nil {
		return nil, err
	}
	if err := spec.validate(); err != nil {
		return nil, err
	}
	return spec, nil
}

func loadArticles(root string) ([]ArticleSpec, error) {
	files, err := markdownFiles(root, true)
	if err != nil {
		return nil, err
	}
	out := make([]ArticleSpec, 0, len(files))
	for _, path := range files {
		fm, body, err := readMarkdown(path)
		if err != nil {
			return nil, err
		}
		a := ArticleSpec{
			File:           path,
			Rubric:         filepath.Base(filepath.Dir(path)),
			Slug:           strings.TrimSuffix(filepath.Base(path), ".md"),
			Title:          fm.str("title"),
			Excerpt:        fm.str("excerpt"),
			Body:           body,
			Cover:          fm.str("cover"),
			Tags:           fm.list("tags"),
			Status:         fm.strOr("status", "published"),
			SEOTitle:       fm.str("seo_title"),
			SEODescription: fm.str("seo_description"),
		}
		if a.Comments, err = fm.boolOr("comments", true); err != nil {
			return nil, fileErr(path, err)
		}
		if a.ReadingTime, err = fm.intOr("reading_time", 0); err != nil {
			return nil, fileErr(path, err)
		}
		if a.PublishedAt, err = fm.date("date"); err != nil {
			return nil, fileErr(path, err)
		}
		if err := fm.unknown("title", "excerpt", "cover", "tags", "status", "comments",
			"reading_time", "date", "seo_title", "seo_description"); err != nil {
			return nil, fileErr(path, err)
		}
		out = append(out, a)
	}
	return out, nil
}

func loadMaterials(root string) ([]MaterialSpec, error) {
	files, err := markdownFiles(root, false)
	if err != nil {
		return nil, err
	}
	out := make([]MaterialSpec, 0, len(files))
	for _, path := range files {
		fm, body, err := readMarkdown(path)
		if err != nil {
			return nil, err
		}
		m := MaterialSpec{
			File:           path,
			Slug:           strings.TrimSuffix(filepath.Base(path), ".md"),
			Title:          fm.str("title"),
			Excerpt:        fm.str("excerpt"),
			Summary:        fm.str("summary"),
			Body:           body,
			Cover:          fm.str("cover"),
			Tags:           fm.list("tags"),
			Status:         fm.strOr("status", "published"),
			Emoji:          fm.str("emoji"),
			Parent:         fm.str("parent"),
			SEOTitle:       fm.str("seo_title"),
			SEODescription: fm.str("seo_description"),
		}
		if m.Order, err = fm.intOr("order", 0); err != nil {
			return nil, fileErr(path, err)
		}
		if m.PublishedAt, err = fm.date("date"); err != nil {
			return nil, fileErr(path, err)
		}
		if err := fm.unknown("title", "excerpt", "summary", "cover", "tags", "status", "emoji",
			"parent", "order", "date", "seo_title", "seo_description"); err != nil {
			return nil, fileErr(path, err)
		}
		out = append(out, m)
	}
	return out, nil
}

// markdownFiles lists *.md files; nested=true expects exactly one folder level
// (tulisan/<rubrik>/<slug>.md). A missing root is fine — the section is optional.
func markdownFiles(root string, nested bool) ([]string, error) {
	pattern := filepath.Join(root, "*.md")
	if nested {
		pattern = filepath.Join(root, "*", "*.md")
	}
	files, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	return files, nil
}

func (s *Spec) validate() error {
	var errs []string
	add := func(format string, a ...any) { errs = append(errs, fmt.Sprintf(format, a...)) }

	pageSlugs := map[string]bool{}
	homes := 0
	for i, p := range s.Pages {
		if !slugRe.MatchString(p.Slug) {
			add("pages[%d]: slug %q tidak valid (huruf kecil, angka, tanda hubung)", i, p.Slug)
		}
		if pageSlugs[p.Slug] {
			add("pages[%d]: slug %q dobel", i, p.Slug)
		}
		pageSlugs[p.Slug] = true
		if p.IsHome {
			homes++
		}
		for j, b := range p.Blocks {
			if err := checkBlock(b); err != nil {
				add("pages[%s].blocks[%d]: %v", p.Slug, j, err)
			}
		}
	}
	if homes > 1 {
		add("pages: lebih dari satu halaman is_home")
	}
	for i, b := range s.Site.Header {
		if err := checkBlock(b); err != nil {
			add("site.header[%d]: %v", i, err)
		}
	}
	for i, b := range s.Site.Footer {
		if err := checkBlock(b); err != nil {
			add("site.footer[%d]: %v", i, err)
		}
	}

	bannerTitles := map[string]bool{}
	for i, b := range s.Banners {
		if b.Title == "" || b.Image == "" || b.Href == "" || b.Alt == "" {
			add("banners[%d]: title, image, href, dan alt wajib diisi", i)
		}
		// Same rule as banners.validURL — otherwise the dashboard can't re-save it.
		if b.Href != "" && !strings.HasPrefix(b.Href, "https://") && !strings.HasPrefix(b.Href, "http://") {
			add("banners[%d]: href harus URL lengkap http(s)://", i)
		}
		if bannerTitles[b.Title] {
			add("banners[%d]: title %q dobel (title dipakai sebagai kunci)", i, b.Title)
		}
		bannerTitles[b.Title] = true
	}

	for _, a := range s.Articles {
		rel := s.rel(a.File)
		if !validRubrics[a.Rubric] {
			add("%s: folder rubrik %q tidak dikenal", rel, a.Rubric)
		}
		if !slugRe.MatchString(a.Slug) {
			add("%s: nama file harus slug (huruf kecil, angka, tanda hubung)", rel)
		}
		if a.Title == "" {
			add("%s: title wajib diisi", rel)
		}
		if a.Status != "draft" && a.Status != "published" {
			add("%s: status harus draft atau published", rel)
		}
	}

	matSlugs := map[string]*MaterialSpec{}
	for i := range s.Materials {
		matSlugs[s.Materials[i].Slug] = &s.Materials[i]
	}
	for _, m := range s.Materials {
		rel := s.rel(m.File)
		if !slugRe.MatchString(m.Slug) {
			add("%s: nama file harus slug (huruf kecil, angka, tanda hubung)", rel)
		}
		if m.Title == "" {
			add("%s: title wajib diisi", rel)
		}
		if m.Status != "draft" && m.Status != "published" {
			add("%s: status harus draft atau published", rel)
		}
		if m.Parent == "" {
			continue
		}
		// Hierarchy is one level deep (learning.validateParent enforces the same).
		parent, ok := matSlugs[m.Parent]
		switch {
		case m.Parent == m.Slug:
			add("%s: parent tidak boleh diri sendiri", rel)
		case !ok:
			add("%s: parent %q tidak ada di folder materi", rel, m.Parent)
		case parent.Parent != "":
			add("%s: parent %q sendiri punya parent (maksimal satu tingkat)", rel, m.Parent)
		}
	}

	if len(errs) > 0 {
		return errors.New("seed tidak valid:\n  - " + strings.Join(errs, "\n  - "))
	}
	return nil
}

func checkBlock(raw json.RawMessage) error {
	var b struct {
		Type  string          `json:"type"`
		Props json.RawMessage `json:"props"`
	}
	if err := json.Unmarshal(raw, &b); err != nil {
		return fmt.Errorf("bukan objek blok: %w", err)
	}
	if b.Type == "" {
		return errors.New("field type kosong")
	}
	if len(b.Props) > 0 && b.Props[0] != '{' {
		return fmt.Errorf("blok %s: props harus objek", b.Type)
	}
	return nil
}

func (s *Spec) rel(path string) string {
	if r, err := filepath.Rel(s.Dir, path); err == nil {
		return r
	}
	return path
}

func fileErr(path string, err error) error {
	return fmt.Errorf("%s: %w", path, err)
}

// parseInt is strconv.Atoi with a friendlier message for seed authors.
func parseInt(key, v string) (int, error) {
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("%s harus angka, dapat %q", key, v)
	}
	return n, nil
}
