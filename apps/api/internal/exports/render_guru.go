package exports

// Port Go dari apps/renderer/components/GuruBlocks.tsx — template
// "guru-pandi-upi" dibangun sepenuhnya dari blok Guru*, dan sebelum ini
// exporter tidak mengenal satupun sehingga situs guru ter-export jadi
// rangkaian komentar HTML kosong.
//
// Markup + class-name di-mirror persis dari komponen React supaya guruCSS
// (salinan dari GuruStyles) langsung cocok.

import (
	"fmt"
	"strings"
)

// Ikon rubrik — inline SVG, bukan icon font, supaya ZIP tetap self-contained.
var guruRubricIcons = map[string]string{
	"book":     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
	"bookmark": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v16H7.5A3.5 3.5 0 0 0 4 21.5z"/><path d="M4 5.5v16M8 6h8"/></svg>`,
	"sparkle":  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`,
	"flag":     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 21V4m0 1h12l-2 4 2 4H5"/></svg>`,
	"temple":   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10h16M6 10V8l6-4 6 4v2M6 20h12M8 10v8M12 10v8M16 10v8"/></svg>`,
	"chat":     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>`,
}

// Urutan rotasi ikon harus sama dengan Object.keys(RUBRIC_ICONS) di TSX —
// map Go tidak berurutan, jadi urutannya dikunci eksplisit di sini.
var guruRubricIconOrder = []string{"book", "bookmark", "sparkle", "flag", "temple", "chat"}

func guruIcon(key string) string {
	if s, ok := guruRubricIcons[key]; ok {
		return s
	}
	return guruRubricIcons["book"]
}

// renderGuruBlock menangani semua blok statis Guru*. Mengembalikan false kalau
// tipe bukan blok Guru, supaya caller bisa lanjut ke default case.
func renderGuruBlock(b *strings.Builder, blk Block) bool {
	p := blk.Props
	switch blk.Type {
	case "GuruStyles":
		fmt.Fprintf(b, `<style>%s</style>`, guruCSS)

	case "GuruNavbar":
		guruNavbar(b, p)

	case "GuruFooter":
		guruFooter(b, p)

	case "GuruHero":
		guruHero(b, p)

	case "GuruRubricHero":
		b.WriteString(`<section class="guru-rubric-hero"><div class="guru-container guru-rubric-hero__grid"><div>`)
		guruEyebrow(b, str(p, "eyebrow"))
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<h1>%s</h1>`, esc(t))
		}
		if s := str(p, "subtitle"); s != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(s))
		}
		fmt.Fprintf(b, `</div><div class="guru-rubric-badge">%s</div></div></section>`,
			guruIcon(strOr(p, "iconKey", "book")))

	case "GuruRubricGrid":
		guruRubricGrid(b, p)

	case "GuruProfileCard":
		guruProfileCard(b, p)

	case "GuruQuote":
		text := str(p, "text")
		if text == "" {
			return true
		}
		b.WriteString(`<section class="guru-quote-section"><div class="guru-container"><div class="guru-quote-card">`)
		b.WriteString(`<div class="guru-quote-card__mark" aria-hidden>&#34;</div><blockquote>`)
		b.WriteString(esc(text))
		if a := str(p, "author"); a != "" {
			fmt.Fprintf(b, `<cite>%s</cite>`, esc(a))
		}
		b.WriteString(`</blockquote></div></div></section>`)

	case "GuruTagList":
		guruTagList(b, p)

	case "GuruTimeline":
		guruTimeline(b, p)

	case "GuruStatsBar":
		guruStatsBar(b, p, guruPairs(arr(p, "items")))

	case "GuruPromoCarousel":
		guruPromoCarousel(b, guruSlides(arr(p, "items")))

	case "GuruLatestGrid":
		featured, _ := p["featured"].(map[string]any)
		guruLatestGrid(b, p, guruCards(arr(p, "side")), featured)

	case "GuruArticleGrid":
		guruArticleGrid(b, p, guruArticles(arr(p, "items")), strOr(p, "ctaLabel", "Baca selengkapnya →"))

	case "GuruForumThreadList":
		guruForumThreadList(b, p, guruThreads(arr(p, "items")))

	default:
		return false
	}
	return true
}

// ---- blok statis ----

func guruEyebrow(b *strings.Builder, s string) {
	if s != "" {
		fmt.Fprintf(b, `<div class="guru-eyebrow">%s</div>`, esc(s))
	}
}

// guruSectionHeading = pola <div>eyebrow+h2</div><p>subtitle</p> yang dipakai
// ulang oleh rubric grid, latest grid, dan stats bar.
func guruSectionHeading(b *strings.Builder, p map[string]any) {
	b.WriteString(`<div class="guru-section-heading"><div>`)
	guruEyebrow(b, str(p, "eyebrow"))
	if t := str(p, "title"); t != "" {
		fmt.Fprintf(b, `<h2>%s</h2>`, esc(t))
	}
	b.WriteString(`</div>`)
	if s := str(p, "subtitle"); s != "" {
		fmt.Fprintf(b, `<p>%s</p>`, esc(s))
	}
	b.WriteString(`</div>`)
}

func guruBrand(b *strings.Builder, p map[string]any, extraAttr string) {
	fmt.Fprintf(b, `<a class="guru-brand" href="/"%s>`, extraAttr)
	if m := str(p, "brandMark"); m != "" {
		fmt.Fprintf(b, `<span class="guru-brand__mark">%s</span>`, esc(m))
	}
	fmt.Fprintf(b, `<span class="guru-brand__copy">%s`, esc(str(p, "brandName")))
	if r := str(p, "brandRole"); r != "" {
		fmt.Fprintf(b, `<small>%s</small>`, esc(r))
	}
	b.WriteString(`</span></a>`)
}

func guruNavbar(b *strings.Builder, p map[string]any) {
	b.WriteString(`<header class="guru-site-header"><div class="guru-container guru-nav-shell">`)
	guruBrand(b, p, fmt.Sprintf(` aria-label="Beranda %s"`, escAttr(str(p, "brandName"))))
	// Toggle mobile pakai checkbox hack — export tidak punya JS.
	b.WriteString(`<input type="checkbox" id="guru-nav-toggle" class="guru-nav-toggle-input" />`)
	b.WriteString(`<label for="guru-nav-toggle" class="guru-nav-toggle" aria-label="Buka navigasi"><span></span><span></span><span></span></label>`)
	b.WriteString(`<nav class="guru-site-nav" aria-label="Navigasi utama">`)
	for _, l := range arr(p, "links") {
		m, ok := l.(map[string]any)
		if !ok {
			continue
		}
		cls := ""
		if active, _ := m["active"].(bool); active {
			cls = ` class="is-active"`
		}
		fmt.Fprintf(b, `<a href="%s"%s>%s</a>`, escAttr(str(m, "href")), cls, esc(str(m, "label")))
	}
	b.WriteString(`</nav></div></header>`)
}

func guruFooter(b *strings.Builder, p map[string]any) {
	b.WriteString(`<footer class="guru-site-footer"><div class="guru-container"><div class="guru-footer-grid"><div>`)
	guruBrand(b, p, "")
	if c := str(p, "copyText"); c != "" {
		fmt.Fprintf(b, `<p class="guru-footer-copy">%s</p>`, esc(c))
	}
	bt, bb, bn := str(p, "builderTitle"), str(p, "builderBrand"), str(p, "builderNote")
	if bt != "" || bb != "" {
		b.WriteString(`<div class="guru-builder-credit">`)
		if bt != "" {
			fmt.Fprintf(b, `<span>%s</span>`, esc(bt))
		}
		if bb != "" {
			fmt.Fprintf(b, `<strong>%s</strong>`, esc(bb))
		}
		if bn != "" {
			fmt.Fprintf(b, `<small>%s</small>`, esc(bn))
		}
		b.WriteString(`</div>`)
	}
	b.WriteString(`</div>`)
	if links := arr(p, "links"); len(links) > 0 {
		b.WriteString(`<nav class="guru-footer-links" aria-label="Navigasi footer">`)
		for _, l := range links {
			if m, ok := l.(map[string]any); ok {
				fmt.Fprintf(b, `<a href="%s">%s</a>`, escAttr(str(m, "href")), esc(str(m, "label")))
			}
		}
		b.WriteString(`</nav>`)
	}
	b.WriteString(`</div><div class="guru-footer-bottom">`)
	if s := str(p, "bottomLeft"); s != "" {
		fmt.Fprintf(b, `<span>%s</span>`, esc(s))
	}
	if s := str(p, "bottomRight"); s != "" {
		fmt.Fprintf(b, `<span>%s</span>`, esc(s))
	}
	b.WriteString(`</div></div></footer>`)
}

func guruHero(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="guru-hero"><div class="guru-hero__blob" aria-hidden></div>`)
	b.WriteString(`<div class="guru-container guru-hero__grid"><div>`)
	guruEyebrow(b, str(p, "eyebrow"))
	fmt.Fprintf(b, `<h1 class="guru-hero__title">%s`, esc(str(p, "title")))
	if em := str(p, "titleEm"); em != "" {
		fmt.Fprintf(b, `<br/><em>%s</em>`, esc(em))
	}
	b.WriteString(`</h1>`)
	if s := str(p, "subtitle"); s != "" {
		fmt.Fprintf(b, `<p class="guru-hero__lead">%s</p>`, esc(s))
	}
	cta, cta2 := str(p, "ctaLabel"), str(p, "ctaSecondaryLabel")
	if cta != "" || cta2 != "" {
		b.WriteString(`<div class="guru-hero__actions">`)
		if cta != "" {
			fmt.Fprintf(b, `<a class="guru-btn guru-btn--primary" href="%s">%s <span>→</span></a>`,
				escAttr(strOr(p, "ctaHref", "#")), esc(cta))
		}
		if cta2 != "" {
			fmt.Fprintf(b, `<a class="guru-btn guru-btn--secondary" href="%s">%s</a>`,
				escAttr(strOr(p, "ctaSecondaryHref", "#")), esc(cta2))
		}
		b.WriteString(`</div>`)
	}
	if stats := guruPairs(arr(p, "stats")); len(stats) > 0 {
		b.WriteString(`<div class="guru-hero__stats">`)
		for _, s := range stats {
			fmt.Fprintf(b, `<div class="guru-hero__stat"><strong>%s</strong><span>%s</span></div>`,
				esc(s.value), esc(s.label))
		}
		b.WriteString(`</div>`)
	}
	b.WriteString(`</div><div class="guru-hero__visual"><div class="guru-hero__figure-blob" aria-hidden></div>`)
	if img := str(p, "image"); img != "" {
		fmt.Fprintf(b, `<img src="%s" alt="%s" class="guru-hero__img" decoding="async" />`,
			escAttr(img), escAttr(str(p, "imageAlt")))
	}
	guruHeroNote(b, p, "a", "noteAText", "noteASub", "noteAShow", "left", "noteAX", "top", "noteAY")
	guruHeroNote(b, p, "b", "noteBText", "noteBSub", "noteBShow", "right", "noteBX", "bottom", "noteBY")
	b.WriteString(`</div></div></section>`)
}

// guruHeroNote — floating note di atas foto hero. Posisi X/Y opsional: kalau
// user tidak set, jangan emit property supaya default CSS tetap berlaku.
func guruHeroNote(b *strings.Builder, p map[string]any, variant, textKey, subKey, showKey, axis1, key1, axis2, key2 string) {
	text := str(p, textKey)
	if text == "" || str(p, showKey) == "hide" {
		return
	}
	var style []string
	if v := guruLength(p, key1); v != "" {
		style = append(style, axis1+":"+v)
	}
	if v := guruLength(p, key2); v != "" {
		style = append(style, axis2+":"+v)
	}
	attr := ""
	if len(style) > 0 {
		attr = fmt.Sprintf(` style="%s"`, escAttr(strings.Join(style, ";")))
	}
	fmt.Fprintf(b, `<div class="guru-hero__note guru-hero__note--%s"%s><strong>%s</strong>`, variant, attr, esc(text))
	if s := str(p, subKey); s != "" {
		fmt.Fprintf(b, `<span>%s</span>`, esc(s))
	}
	b.WriteString(`</div>`)
}

// guruLength menerima angka (JSON number → px) maupun string CSS siap pakai.
func guruLength(m map[string]any, k string) string {
	if m == nil {
		return ""
	}
	switch v := m[k].(type) {
	case float64:
		return fmt.Sprintf("%gpx", v)
	case string:
		return strings.TrimSpace(v)
	}
	return ""
}

func guruRubricGrid(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="guru-section guru-section--alt"><div class="guru-container">`)
	guruSectionHeading(b, p)
	b.WriteString(`<div class="guru-rubric-grid">`)
	for i, it := range arr(p, "items") {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		iconKey := strOr(m, "icon", guruRubricIconOrder[i%len(guruRubricIconOrder)])
		fmt.Fprintf(b, `<a href="%s" class="guru-rubric-card guru-rubric-card--v%d">`,
			escAttr(strOr(m, "href", "#")), i%3+1)
		fmt.Fprintf(b, `<div class="guru-rubric-card__icon">%s</div><h3>%s</h3>`,
			guruIcon(iconKey), esc(str(m, "title")))
		if d := str(m, "desc"); d != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(d))
		}
		b.WriteString(`<span class="guru-rubric-card__arrow" aria-hidden>→</span></a>`)
	}
	b.WriteString(`</div></div></section>`)
}

func guruProfileCard(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="guru-section"><div class="guru-container guru-profile-layout"><aside class="guru-profile-card">`)
	if img := str(p, "image"); img != "" {
		fmt.Fprintf(b, `<div class="guru-profile-card__photo"><img src="%s" alt="%s" decoding="async" /></div>`,
			escAttr(img), escAttr(str(p, "name")))
	}
	b.WriteString(`<div class="guru-profile-card__body">`)
	if n := str(p, "name"); n != "" {
		fmt.Fprintf(b, `<h2>%s</h2>`, esc(n))
	}
	if r := str(p, "role"); r != "" {
		fmt.Fprintf(b, `<p>%s</p>`, esc(r))
	}
	if contacts := arr(p, "contacts"); len(contacts) > 0 {
		b.WriteString(`<div class="guru-profile-contact">`)
		for _, c := range contacts {
			m, ok := c.(map[string]any)
			if !ok {
				continue
			}
			b.WriteString(`<span>`)
			if ic := str(m, "icon"); ic != "" {
				fmt.Fprintf(b, `<em aria-hidden>%s </em>`, esc(ic))
			}
			fmt.Fprintf(b, `%s</span>`, esc(str(m, "label")))
		}
		b.WriteString(`</div>`)
	}
	b.WriteString(`</div></aside><div class="guru-profile-content">`)
	for _, pn := range arr(p, "panels") {
		m, ok := pn.(map[string]any)
		if !ok {
			continue
		}
		b.WriteString(`<div class="guru-content-panel">`)
		guruEyebrow(b, str(m, "eyebrow"))
		if t := str(m, "title"); t != "" {
			fmt.Fprintf(b, `<h2>%s</h2>`, esc(t))
		}
		if body := str(m, "body"); body != "" {
			fmt.Fprintf(b, `<p>%s</p>`, escMultiline(body))
		}
		b.WriteString(`</div>`)
	}
	b.WriteString(`</div></div></section>`)
}

func guruTimeline(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="guru-section"><div class="guru-container"><div class="guru-content-panel">`)
	if t := str(p, "title"); t != "" {
		fmt.Fprintf(b, `<h2>%s</h2>`, esc(t))
	}
	b.WriteString(`<div class="guru-timeline">`)
	for _, it := range arr(p, "items") {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		fmt.Fprintf(b, `<div class="guru-timeline-item"><time>%s</time><div><strong>%s</strong>`,
			esc(str(m, "date")), esc(str(m, "title")))
		if d := str(m, "desc"); d != "" {
			fmt.Fprintf(b, `<br/><span>%s</span>`, esc(d))
		}
		b.WriteString(`</div></div>`)
	}
	b.WriteString(`</div></div></div></section>`)
}

func guruTagList(b *strings.Builder, p map[string]any) {
	tags := guruNormalizeTags(arr(p, "tags"))
	if len(tags) == 0 {
		return
	}
	b.WriteString(`<section class="guru-section"><div class="guru-container"><div class="guru-content-panel">`)
	if t := str(p, "title"); t != "" {
		fmt.Fprintf(b, `<h2>%s</h2>`, esc(t))
	}
	b.WriteString(`<div class="guru-tag-list">`)
	for _, t := range tags {
		fmt.Fprintf(b, `<span class="guru-tag">%s</span>`, esc(t))
	}
	b.WriteString(`</div></div></div></section>`)
}

// guruNormalizeTags menerima []string (dari template seed) maupun
// []{label} (dari form editor) — keduanya ada di data produksi.
func guruNormalizeTags(items []any) []string {
	var out []string
	for _, it := range items {
		var s string
		switch v := it.(type) {
		case string:
			s = v
		case map[string]any:
			s = str(v, "label")
		}
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// ---- blok yang dipakai juga oleh varian Dynamic ----

type guruPair struct{ value, label string }

func guruPairs(items []any) []guruPair {
	var out []guruPair
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			out = append(out, guruPair{str(m, "value"), str(m, "label")})
		}
	}
	return out
}

func guruStatsBar(b *strings.Builder, p map[string]any, items []guruPair) {
	b.WriteString(`<section class="guru-section guru-stats-section"><div class="guru-container">`)
	guruSectionHeading(b, p)
	b.WriteString(`<div class="guru-website-stats">`)
	for _, s := range items {
		fmt.Fprintf(b, `<div class="guru-stat-card"><strong class="guru-stat-card__num">%s</strong><span class="guru-stat-card__label">%s</span></div>`,
			esc(s.value), esc(s.label))
	}
	b.WriteString(`</div></div></section>`)
}

type guruSlide struct{ image, alt, href string }

func guruSlides(items []any) []guruSlide {
	var out []guruSlide
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			out = append(out, guruSlide{str(m, "image"), strOr(m, "alt", str(m, "caption")), str(m, "href")})
		}
	}
	return out
}

func guruPromoCarousel(b *strings.Builder, items []guruSlide) {
	if len(items) == 0 {
		return
	}
	b.WriteString(`<section class="guru-promo"><div class="guru-container"><div class="guru-promo__viewport">`)
	b.WriteString(`<div class="guru-promo__track guru-promo__track--static" role="group" aria-roledescription="carousel" aria-label="Program &amp; kegiatan">`)
	for i, s := range items {
		alt := s.alt
		if alt == "" {
			alt = fmt.Sprintf("Slide %d", i+1)
		}
		loading := "lazy"
		if i == 0 {
			loading = "eager"
		}
		img := fmt.Sprintf(`<img src="%s" alt="%s" loading="%s" decoding="async" />`, escAttr(s.image), escAttr(alt), loading)
		if s.href != "" {
			fmt.Fprintf(b, `<a class="guru-promo__slide" href="%s" aria-label="%s">%s</a>`, escAttr(s.href), escAttr(alt), img)
		} else {
			fmt.Fprintf(b, `<div class="guru-promo__slide" role="img" aria-label="%s">%s</div>`, escAttr(alt), img)
		}
	}
	b.WriteString(`</div></div></div></section>`)
}

type guruCard struct {
	meta, title, excerpt, href, engagement, iconKey string
}

func guruCards(items []any) []guruCard {
	var out []guruCard
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			out = append(out, guruCardOf(m))
		}
	}
	return out
}

func guruCardOf(m map[string]any) guruCard {
	return guruCard{
		meta:       str(m, "meta"),
		title:      str(m, "title"),
		excerpt:    str(m, "excerpt"),
		href:       strOr(m, "href", "#"),
		engagement: str(m, "engagement"),
		iconKey:    strOr(m, "iconKey", "book"),
	}
}

func guruEngagement(b *strings.Builder, s string) {
	if s != "" {
		fmt.Fprintf(b, `<div class="guru-engagement-meta"><span>%s</span></div>`, esc(s))
	}
}

func guruMeta(b *strings.Builder, s string) {
	if s != "" {
		fmt.Fprintf(b, `<div class="guru-meta">%s</div>`, esc(s))
	}
}

func guruLatestGrid(b *strings.Builder, p map[string]any, side []guruCard, featured map[string]any) {
	b.WriteString(`<section class="guru-section"><div class="guru-container">`)
	guruSectionHeading(b, p)
	b.WriteString(`<div class="guru-latest-grid">`)
	if featured != nil {
		f := guruCardOf(featured)
		fmt.Fprintf(b, `<a class="guru-featured-post" href="%s">`, escAttr(f.href))
		guruMeta(b, f.meta)
		fmt.Fprintf(b, `<h3>%s</h3>`, esc(f.title))
		if f.excerpt != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(f.excerpt))
		}
		guruEngagement(b, f.engagement)
		b.WriteString(`</a>`)
	}
	b.WriteString(`<div class="guru-side-posts">`)
	for _, s := range side {
		fmt.Fprintf(b, `<a class="guru-post-card" href="%s"><div class="guru-post-card__mini-cover">%s</div><div>`,
			escAttr(s.href), guruIcon(s.iconKey))
		guruMeta(b, s.meta)
		fmt.Fprintf(b, `<h3>%s</h3>`, esc(s.title))
		if s.excerpt != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(s.excerpt))
		}
		guruEngagement(b, s.engagement)
		b.WriteString(`</div></a>`)
	}
	b.WriteString(`</div></div></div></section>`)
}

type guruArticle struct {
	title, excerpt, meta, href, engagement, coverVariant, coverImage string
	featured                                                         bool
}

func guruArticles(items []any) []guruArticle {
	var out []guruArticle
	for _, it := range items {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		featured, _ := m["featured"].(bool)
		out = append(out, guruArticle{
			title:        str(m, "title"),
			excerpt:      str(m, "excerpt"),
			meta:         str(m, "meta"),
			href:         str(m, "href"),
			engagement:   str(m, "engagement"),
			coverVariant: str(m, "coverVariant"),
			coverImage:   str(m, "coverImage"),
			featured:     featured,
		})
	}
	return out
}

func guruArticleGrid(b *strings.Builder, p map[string]any, items []guruArticle, ctaLabel string) {
	b.WriteString(`<section class="guru-section"><div class="guru-container guru-content-layout"><div class="guru-article-grid">`)
	for _, it := range items {
		cls := "guru-article-card"
		if it.featured {
			cls += " guru-article-card--featured"
		}
		fmt.Fprintf(b, `<article class="%s">`, cls)
		if it.coverImage != "" {
			fmt.Fprintf(b, `<div class="guru-article-cover guru-article-cover--img"><img src="%s" alt="%s" loading="lazy" decoding="async" /></div>`,
				escAttr(it.coverImage), escAttr(it.title))
		} else {
			cover := "guru-article-cover"
			if it.coverVariant != "" {
				cover += " guru-article-cover--" + it.coverVariant
			}
			fmt.Fprintf(b, `<div class="%s"></div>`, escAttr(cover))
		}
		b.WriteString(`<div class="guru-article-card__body">`)
		guruMeta(b, it.meta)
		fmt.Fprintf(b, `<h2>%s</h2>`, esc(it.title))
		if it.excerpt != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(it.excerpt))
		}
		guruEngagement(b, it.engagement)
		if it.href != "" {
			fmt.Fprintf(b, `<a class="guru-read-more" href="%s">%s</a>`, escAttr(it.href), esc(ctaLabel))
		}
		b.WriteString(`</div></article>`)
	}
	b.WriteString(`</div>`)
	guruSidebar(b, p, nil)
	b.WriteString(`</div></section>`)
}

type guruThread struct {
	initials, avatarVariant, label, date, title, excerpt, engagement, href string
	tags                                                                   []string
	featured                                                               bool
}

func guruThreads(items []any) []guruThread {
	var out []guruThread
	for _, it := range items {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		featured, _ := m["featured"].(bool)
		out = append(out, guruThread{
			initials:      str(m, "initials"),
			avatarVariant: strOr(m, "avatarVariant", "red"),
			label:         str(m, "label"),
			date:          str(m, "date"),
			title:         str(m, "title"),
			excerpt:       str(m, "excerpt"),
			engagement:    str(m, "engagement"),
			href:          str(m, "href"),
			tags:          guruNormalizeTags(arr(m, "tags")),
			featured:      featured,
		})
	}
	return out
}

func guruForumThreadList(b *strings.Builder, p map[string]any, items []guruThread) {
	b.WriteString(`<section class="guru-section"><div class="guru-container guru-forum-layout"><div class="guru-thread-list">`)
	for _, t := range items {
		cls := "guru-thread-card"
		if t.featured {
			cls += " guru-thread-card--featured"
		}
		fmt.Fprintf(b, `<article class="%s"><div class="guru-thread-avatar guru-thread-avatar--%s">%s</div><div class="guru-thread-main">`,
			cls, escAttr(t.avatarVariant), esc(t.initials))
		b.WriteString(`<div class="guru-thread-topline">`)
		if t.label != "" {
			fmt.Fprintf(b, `<span class="guru-thread-label">%s</span>`, esc(t.label))
		}
		if t.date != "" {
			fmt.Fprintf(b, `<span>%s</span>`, esc(t.date))
		}
		b.WriteString(`</div><h2>`)
		if t.href != "" {
			fmt.Fprintf(b, `<a href="%s">%s</a>`, escAttr(t.href), esc(t.title))
		} else {
			b.WriteString(esc(t.title))
		}
		b.WriteString(`</h2>`)
		if t.excerpt != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(t.excerpt))
		}
		if len(t.tags) > 0 {
			b.WriteString(`<div class="guru-thread-tags">`)
			for _, tag := range t.tags {
				fmt.Fprintf(b, `<span>%s</span>`, esc(tag))
			}
			b.WriteString(`</div>`)
		}
		if t.engagement != "" {
			fmt.Fprintf(b, `<div class="guru-thread-meta-inline"><span>%s</span></div>`, esc(t.engagement))
		}
		b.WriteString(`</div></article>`)
	}
	b.WriteString(`</div>`)
	guruSidebar(b, p, func(sb *strings.Builder) {
		note, _ := p["moderationNote"].(map[string]any)
		if note != nil {
			sb.WriteString(`<div class="guru-sidebar-card guru-moderation-card">`)
			fmt.Fprintf(sb, `<div class="guru-moderation-badge">%s</div><h3>%s</h3><p>%s</p></div>`,
				esc(str(note, "badge")), esc(str(note, "title")), esc(str(note, "body")))
		}
		if pp := guruNormalizeTags(arr(p, "participants")); len(pp) > 0 {
			sb.WriteString(`<div class="guru-sidebar-card"><h3>Siapa yang bisa ikut?</h3><div class="guru-participant-list">`)
			for _, s := range pp {
				fmt.Fprintf(sb, `<span>%s</span>`, esc(s))
			}
			sb.WriteString(`</div></div>`)
		}
	})
	b.WriteString(`</div></section>`)
}

// guruSidebar menulis <aside> bersama: kartu khusus dari `extra` dulu (forum
// punya moderation note + daftar peserta), lalu kartu generik yang dipakai
// article grid maupun forum.
func guruSidebar(b *strings.Builder, p map[string]any, extra func(*strings.Builder)) {
	b.WriteString(`<aside class="guru-sidebar">`)
	if extra != nil {
		extra(b)
	}
	if t := str(p, "sidebarTitle"); t != "" {
		fmt.Fprintf(b, `<div class="guru-sidebar-card"><h3>%s</h3>`, esc(t))
		if body := str(p, "sidebarBody"); body != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(body))
		}
		b.WriteString(`</div>`)
	}
	if tags := guruNormalizeTags(arr(p, "sidebarTags")); len(tags) > 0 {
		b.WriteString(`<div class="guru-sidebar-card"><h3>Topik</h3><div class="guru-tag-list">`)
		for _, t := range tags {
			fmt.Fprintf(b, `<span class="guru-tag">%s</span>`, esc(t))
		}
		b.WriteString(`</div></div>`)
	}
	if links := arr(p, "sidebarLinks"); len(links) > 0 {
		b.WriteString(`<div class="guru-sidebar-card"><h3>Jelajahi ruang lain</h3><div class="guru-topic-list">`)
		for _, l := range links {
			if m, ok := l.(map[string]any); ok {
				fmt.Fprintf(b, `<a href="%s" class="guru-topic-link">%s</a>`,
					escAttr(str(m, "href")), esc(str(m, "label")))
			}
		}
		b.WriteString(`</div></div>`)
	}
	b.WriteString(`</aside>`)
}

// guruEmptyState dipakai varian Dynamic saat tidak ada konten — sama dengan
// renderer, supaya halaman tidak kosong melompong tanpa penjelasan.
func guruEmptyState(b *strings.Builder, msg string) {
	fmt.Fprintf(b, `<section class="guru-section"><div class="guru-container"><div class="guru-content-panel">`+
		`<p style="color:#637083;text-align:center;padding:40px 20px">%s</p></div></div></section>`, esc(msg))
}
