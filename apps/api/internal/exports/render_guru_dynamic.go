package exports

// Port Go dari apps/renderer/components/GuruBlocksDynamic.tsx. Blok Guru*Dynamic
// di renderer mengambil datanya lewat fetch saat render; di exporter data sudah
// dimuat di muka oleh Builder.Write dan dioper lewat guruData.

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/articles"
	"github.com/webbuilder/api/internal/banners"
	"github.com/webbuilder/api/internal/learning"
	"github.com/webbuilder/api/internal/sites"
)

type guruData struct {
	articles  []articles.Article
	materials []learning.Material
	banners   []banners.PublicView
	stats     articles.SiteStats
	// responses = jumlah tanggapan approved per artikel, di-preload sekali
	// supaya kartu tulisan tidak memicu satu query per artikel.
	responses map[uuid.UUID]int64
}

func (g *guruData) engagementOf(a articles.Article) string {
	var n int64
	if g != nil {
		n = g.responses[a.ID]
	}
	return guruEngagementText(a.ViewCount, n, a.CommentsEnabled)
}

// Label rubrik — harus sama dengan GURU_RUBRIC_LABEL di apps/renderer/lib/api.ts.
var guruRubricLabel = map[string]string{
	"ceritaku":      "Ceritaku",
	"bacaanku":      "Bacaanku",
	"inspirasiku":   "Inspirasiku",
	"bangsaku":      "Bangsaku",
	"peradaban":     "Peradaban",
	"forum-diskusi": "Forum Diskusi",
}

// Warna cover per rubrik — mirror coverVariant() di GuruBlocksDynamic.tsx.
var guruCoverVariant = map[string]string{
	"ceritaku":      "red",
	"bacaanku":      "default",
	"inspirasiku":   "gold",
	"bangsaku":      "sage",
	"peradaban":     "default",
	"forum-diskusi": "red",
}

var guruThreadAvatarVariants = []string{"red", "blue", "sage", "gold"}
var guruLearningCoverVariants = []string{"default", "red", "sage", "gold"}

var guruMonthsID = [...]string{
	"Januari", "Februari", "Maret", "April", "Mei", "Juni",
	"Juli", "Agustus", "September", "Oktober", "November", "Desember",
}

func guruFmtDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return fmt.Sprintf("%d %s %d", t.Day(), guruMonthsID[int(t.Month())-1], t.Year())
}

// guruEngagementText mirror engagement() di renderer: jumlah tanggapan hanya
// ikut ditampilkan kalau kolom komentar artikelnya memang dibuka.
func guruEngagementText(views int64, responses int64, commentsEnabled bool) string {
	s := thousands(views) + " views"
	if commentsEnabled {
		s += fmt.Sprintf(" · %d tanggapan", responses)
	}
	return s
}

func guruArticleHref(a articles.Article) string {
	return "/" + a.Rubric + "/" + a.Slug + "/index.html"
}

func guruMaterialHref(m learning.Material) string {
	return "/pembelajaran/" + m.Slug + "/index.html"
}

func (g *guruData) byRubric(rubric string) []articles.Article {
	if g == nil {
		return nil
	}
	var out []articles.Article
	for _, a := range g.articles {
		if a.Rubric == rubric {
			out = append(out, a)
		}
	}
	return out
}

// renderGuruDynamicBlock mengembalikan false kalau tipe blok bukan varian
// Guru*Dynamic, supaya caller lanjut ke blok statis / default case.
func renderGuruDynamicBlock(b *strings.Builder, blk Block, g *guruData) bool {
	p := blk.Props
	switch blk.Type {
	case "GuruPromoCarouselDynamic":
		var slides []guruSlide
		if g != nil {
			for _, bn := range g.banners {
				slides = append(slides, guruSlide{image: bn.ImageURL, alt: bn.AltText, href: bn.TargetURL})
			}
		}
		guruPromoCarousel(b, slides)

	case "GuruStatsBarDynamic":
		var s articles.SiteStats
		if g != nil {
			s = g.stats
		}
		props := map[string]any{
			"eyebrow":  strOr(p, "eyebrow", "Jejak Website Saya"),
			"title":    str(p, "title"),
			"subtitle": str(p, "subtitle"),
		}
		guruStatsBar(b, props, []guruPair{
			{thousands(s.TotalViews), "Total Views"},
			{thousands(s.TotalResponses), "Tanggapan"},
			{thousands(s.TotalArticles), "Tulisan"},
		})

	case "GuruLatestGridDynamic":
		guruLatestGridDynamic(b, p, g)

	case "GuruArticleGridDynamic":
		guruArticleGridDynamic(b, p, g)

	case "GuruLearningGridDynamic":
		guruLearningGridDynamic(b, p, g)

	case "GuruForumThreadListDynamic":
		guruForumThreadListDynamic(b, p, g)

	default:
		return false
	}
	return true
}

func guruLatestGridDynamic(b *strings.Builder, p map[string]any, g *guruData) {
	latest := g.latestPublished(4)
	if len(latest) == 0 {
		return
	}
	toCard := func(a articles.Article) map[string]any {
		meta := guruRubricLabel[a.Rubric]
		if d := guruFmtDate(a.PublishedAt); d != "" {
			meta += " · " + d
		}
		return map[string]any{
			"meta":       meta,
			"title":      a.Title,
			"excerpt":    a.Excerpt,
			"href":       guruArticleHref(a),
			"engagement": g.engagementOf(a),
		}
	}
	var side []guruCard
	for _, a := range latest[1:] {
		side = append(side, guruCardOf(toCard(a)))
	}
	guruLatestGrid(b, p, side, toCard(latest[0]))
}

// latestPublished mengurutkan ulang di memori: Builder memuat seluruh artikel
// sekali untuk semua blok, jadi tidak ada query khusus "terbaru".
func (g *guruData) latestPublished(limit int) []articles.Article {
	if g == nil {
		return nil
	}
	var out []articles.Article
	for _, a := range g.articles {
		out = append(out, a)
		if len(out) == limit {
			break
		}
	}
	return out
}

func guruArticleGridDynamic(b *strings.Builder, p map[string]any, g *guruData) {
	rubric := str(p, "rubric")
	label, known := guruRubricLabel[rubric]
	if !known {
		return
	}
	list := g.byRubric(rubric)
	if len(list) == 0 {
		guruEmptyState(b, "Belum ada tulisan di rubrik "+label+".")
		return
	}
	items := make([]guruArticle, 0, len(list))
	for i, a := range list {
		items = append(items, guruArticle{
			title:        a.Title,
			excerpt:      a.Excerpt,
			meta:         guruFmtDate(a.PublishedAt),
			href:         guruArticleHref(a),
			engagement:   g.engagementOf(a),
			coverVariant: guruCoverVariant[a.Rubric],
			coverImage:   a.CoverImageURL,
			featured:     i == 0,
		})
	}
	guruArticleGrid(b, p, items, "Baca selengkapnya →")
}

func guruLearningGridDynamic(b *strings.Builder, p map[string]any, g *guruData) {
	var list []learning.Material
	if g != nil {
		list = g.materials
	}
	if len(list) == 0 {
		guruEmptyState(b, "Belum ada materi pembelajaran.")
		return
	}
	items := make([]guruArticle, 0, len(list))
	for i, m := range list {
		meta := "Pembelajaran"
		if d := guruFmtDate(m.PublishedAt); d != "" {
			meta += " · " + d
		}
		items = append(items, guruArticle{
			title:        m.Title,
			excerpt:      m.Excerpt,
			meta:         meta,
			href:         guruMaterialHref(m),
			coverVariant: guruLearningCoverVariants[i%len(guruLearningCoverVariants)],
			coverImage:   m.CoverImageURL,
			featured:     i == 0,
		})
	}
	// Materi bukan artikel — CTA-nya harus beda supaya tidak membingungkan.
	guruArticleGrid(b, p, items, "Lihat materi →")
}

func guruForumThreadListDynamic(b *strings.Builder, p map[string]any, g *guruData) {
	list := g.byRubric("forum-diskusi")
	if len(list) == 0 {
		guruEmptyState(b, "Belum ada topik di Forum Diskusi.")
		return
	}
	items := make([]guruThread, 0, len(list))
	for i, a := range list {
		initials := ""
		for _, r := range a.Title {
			initials = strings.ToUpper(string(r))
			break
		}
		items = append(items, guruThread{
			initials:      initials,
			avatarVariant: guruThreadAvatarVariants[i%len(guruThreadAvatarVariants)],
			label:         "Forum",
			date:          guruFmtDate(a.PublishedAt),
			title:         a.Title,
			excerpt:       a.Excerpt,
			engagement:    g.engagementOf(a),
			href:          guruArticleHref(a),
			tags:          guruTagsOf(a.Tags),
			featured:      i == 0,
		})
	}
	guruForumThreadList(b, p, items)
}

func guruTagsOf(raw json.RawMessage) []string {
	var tags []string
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &tags)
	}
	return tags
}

// ---- halaman detail ----

// guruChrome memisahkan navbar/style (header) dan footer dari tree sebuah
// halaman. Template guru menaruh GuruNavbar/GuruFooter di dalam tree halaman,
// bukan di site.layout_json, jadi halaman detail yang kita bangkitkan sendiri
// tidak punya sumber chrome lain selain meminjam dari halaman beranda.
func guruChrome(t Tree) (header, footer []Block) {
	for _, blk := range t.Blocks {
		switch blk.Type {
		case "GuruStyles", "GuruNavbar":
			header = append(header, blk)
		case "GuruFooter":
			footer = append(footer, blk)
		}
	}
	return header, footer
}

func renderGuruArticleHTML(site *sites.Site, a articles.Article, header, footer []Block, d *siteData) string {
	meta := guruRubricLabel[a.Rubric]
	if dt := guruFmtDate(a.PublishedAt); dt != "" {
		meta += " · " + dt
	}
	meta += " · " + d.guruContent().engagementOf(a)
	body := guruDetailBody(header, footer, d, a.Title, meta, a.CoverImageURL, guruTagsOf(a.Tags), a.BodyMD)
	return wrapHTML(site, guruDocTitle(a.SEOTitle, a.Title, site), descFromText(firstNonEmpty(a.SEODescription, a.Excerpt), 160), body)
}

func renderGuruMaterialHTML(site *sites.Site, m learning.Material, header, footer []Block, d *siteData) string {
	meta := "Pembelajaran"
	if dt := guruFmtDate(m.PublishedAt); dt != "" {
		meta += " · " + dt
	}
	body := guruDetailBody(header, footer, d, m.Title, meta, m.CoverImageURL, guruTagsOf(m.Tags), m.BodyMD)
	return wrapHTML(site, guruDocTitle(m.SEOTitle, m.Title, site), descFromText(firstNonEmpty(m.SEODescription, m.Excerpt), 160), body)
}

func guruDetailBody(header, footer []Block, d *siteData, title, meta, cover string, tags []string, bodyMD string) string {
	var b strings.Builder
	renderLayoutBlocks(&b, header, d)
	b.WriteString(`<main class="guru-section"><div class="guru-container guru-content-panel">`)
	b.WriteString(`<nav class="guru-meta"><a href="/index.html">← Beranda</a></nav>`)
	if cover != "" {
		fmt.Fprintf(&b, `<img src="%s" alt="%s" decoding="async" style="width:100%%;border-radius:var(--guru-radius);margin-bottom:24px" />`,
			escAttr(cover), escAttr(title))
	}
	fmt.Fprintf(&b, `<h1>%s</h1>`, esc(title))
	if meta != "" {
		fmt.Fprintf(&b, `<div class="guru-meta">%s</div>`, esc(meta))
	}
	if len(tags) > 0 {
		b.WriteString(`<div class="guru-tag-list">`)
		for _, t := range tags {
			fmt.Fprintf(&b, `<span class="guru-tag">%s</span>`, esc(t))
		}
		b.WriteString(`</div>`)
	}
	fmt.Fprintf(&b, `<article class="wb-prose">%s</article>`, renderMarkdown(bodyMD))
	b.WriteString(`</div></main>`)
	renderLayoutBlocks(&b, footer, d)
	return b.String()
}

func guruDocTitle(seoTitle, title string, site *sites.Site) string {
	if seoTitle != "" {
		return seoTitle
	}
	if site != nil && site.Name != "" {
		return title + " — " + site.Name
	}
	return title
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}
