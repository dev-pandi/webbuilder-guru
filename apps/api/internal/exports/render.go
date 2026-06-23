package exports

import (
	"encoding/json"
	"fmt"
	stdhtml "html"
	"strings"

	"github.com/gomarkdown/markdown"
	mdhtml "github.com/gomarkdown/markdown/html"
	"github.com/gomarkdown/markdown/parser"
	"github.com/webbuilder/api/internal/blog"
	"github.com/webbuilder/api/internal/products"
	"github.com/webbuilder/api/internal/sites"
)

// Block matches the JSON tree shape: { type, props }.
type Block struct {
	Type  string                 `json:"type"`
	Props map[string]any         `json:"props,omitempty"`
}

type Tree struct {
	Blocks []Block `json:"blocks"`
}

func parseTree(raw json.RawMessage) Tree {
	if len(raw) == 0 {
		return Tree{}
	}
	var t Tree
	_ = json.Unmarshal(raw, &t)
	return t
}

// renderTree writes block HTML mirroring apps/renderer/components/Blocks.tsx output,
// but using class names from styles.css instead of Tailwind utilities.
func renderTree(b *strings.Builder, t Tree) {
	for _, blk := range t.Blocks {
		renderBlock(b, blk)
	}
}

func renderBlock(b *strings.Builder, blk Block) {
	p := blk.Props
	switch blk.Type {
	case "Navbar":
		b.WriteString(`<header class="wb-navbar"><div class="wb-container wb-navbar-inner">`)
		fmt.Fprintf(b, `<strong class="wb-brand">%s</strong>`, esc(str(p, "brand")))
		b.WriteString(`<nav class="wb-nav">`)
		for _, l := range arr(p, "links") {
			if m, ok := l.(map[string]any); ok {
				fmt.Fprintf(b, `<a href="%s">%s</a>`, escAttr(str(m, "href")), esc(str(m, "label")))
			}
		}
		b.WriteString(`</nav></div></header>`)

	case "Hero":
		b.WriteString(`<section class="wb-hero">`)
		fmt.Fprintf(b, `<h1>%s</h1>`, esc(str(p, "title")))
		if s := str(p, "subtitle"); s != "" {
			fmt.Fprintf(b, `<p class="wb-hero-sub">%s</p>`, esc(s))
		}
		if l := str(p, "ctaLabel"); l != "" {
			fmt.Fprintf(b, `<a href="%s" class="wb-btn wb-btn-primary">%s</a>`,
				escAttr(strOr(p, "ctaHref", "#")), esc(l))
		}
		b.WriteString(`</section>`)

	case "Heading":
		level := intOr(p, "level", 2)
		if level < 1 || level > 6 {
			level = 2
		}
		fmt.Fprintf(b, `<h%d class="wb-heading">%s</h%d>`, level, esc(str(p, "text")), level)

	case "Text":
		fmt.Fprintf(b, `<p class="wb-text">%s</p>`, escMultiline(str(p, "body")))

	case "Section":
		b.WriteString(`<section class="wb-section">`)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
		}
		fmt.Fprintf(b, `<p>%s</p></section>`, escMultiline(str(p, "body")))

	case "FeatureList":
		b.WriteString(`<section class="wb-features">`)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
		}
		b.WriteString(`<div class="wb-grid wb-grid-3">`)
		for _, it := range arr(p, "items") {
			if m, ok := it.(map[string]any); ok {
				b.WriteString(`<div class="wb-feature">`)
				fmt.Fprintf(b, `<div class="wb-feature-title">%s</div>`, esc(str(m, "title")))
				fmt.Fprintf(b, `<div class="wb-feature-desc">%s</div></div>`, esc(str(m, "desc")))
			}
		}
		b.WriteString(`</div></section>`)

	case "ProductGrid":
		b.WriteString(`<section class="wb-products">`)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
		}
		b.WriteString(`<div class="wb-grid wb-grid-3">`)
		for _, it := range arr(p, "items") {
			if m, ok := it.(map[string]any); ok {
				b.WriteString(`<div class="wb-product">`)
				if img := str(m, "image"); img != "" {
					fmt.Fprintf(b, `<img src="%s" alt="%s" loading="lazy" />`, escAttr(img), escAttr(str(m, "name")))
				} else {
					b.WriteString(`<div class="wb-product-img-placeholder"></div>`)
				}
				b.WriteString(`<div class="wb-product-body">`)
				fmt.Fprintf(b, `<div class="wb-product-name">%s</div>`, esc(str(m, "name")))
				fmt.Fprintf(b, `<div class="wb-product-price">%s</div>`, esc(str(m, "price")))
				b.WriteString(`</div></div>`)
			}
		}
		b.WriteString(`</div></section>`)

	case "ProjectGrid":
		b.WriteString(`<section class="wb-projects"><div class="wb-grid wb-grid-2">`)
		for _, it := range arr(p, "items") {
			if m, ok := it.(map[string]any); ok {
				href := strOr(m, "href", "#")
				fmt.Fprintf(b, `<a class="wb-project" href="%s">`, escAttr(href))
				fmt.Fprintf(b, `<div class="wb-project-name">%s</div>`, esc(str(m, "name")))
				fmt.Fprintf(b, `<div class="wb-project-desc">%s</div></a>`, esc(str(m, "desc")))
			}
		}
		b.WriteString(`</div></section>`)

	case "BlogList":
		b.WriteString(`<section class="wb-bloglist">`)
		for _, it := range arr(p, "items") {
			if m, ok := it.(map[string]any); ok {
				href := strOr(m, "href", "#")
				fmt.Fprintf(b, `<a class="wb-blog-item" href="%s">`, escAttr(href))
				fmt.Fprintf(b, `<h3>%s</h3>`, esc(str(m, "title")))
				fmt.Fprintf(b, `<p>%s</p></a>`, esc(str(m, "excerpt")))
			}
		}
		b.WriteString(`</section>`)

	case "Testimonial":
		b.WriteString(`<section class="wb-testimonials">`)
		for _, it := range arr(p, "items") {
			if m, ok := it.(map[string]any); ok {
				fmt.Fprintf(b, `<blockquote class="wb-testimonial">&ldquo;%s&rdquo; &mdash; <span>%s</span></blockquote>`,
					esc(str(m, "text")), esc(str(m, "name")))
			}
		}
		b.WriteString(`</section>`)

	case "Footer":
		fmt.Fprintf(b, `<footer class="wb-footer"><div class="wb-container">%s</div></footer>`, esc(str(p, "copyright")))

	default:
		// Unknown block: render comment marker, don't fail.
		fmt.Fprintf(b, `<!-- block:%s -->`, esc(blk.Type))
	}
}

// ---- helpers ----

func str(m map[string]any, k string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[k]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func strOr(m map[string]any, k, def string) string {
	if s := str(m, k); s != "" {
		return s
	}
	return def
}

func intOr(m map[string]any, k string, def int) int {
	if m == nil {
		return def
	}
	if v, ok := m[k]; ok {
		if n, ok := v.(float64); ok {
			return int(n)
		}
	}
	return def
}

func arr(m map[string]any, k string) []any {
	if m == nil {
		return nil
	}
	if v, ok := m[k]; ok {
		if a, ok := v.([]any); ok {
			return a
		}
	}
	return nil
}

func esc(s string) string { return stdhtml.EscapeString(s) }

func escAttr(s string) string { return stdhtml.EscapeString(s) }

func escMultiline(s string) string {
	return strings.ReplaceAll(stdhtml.EscapeString(s), "\n", "<br/>")
}

// renderMarkdown converts markdown body to HTML using gomarkdown.
// We re-create parser/renderer per call because they're stateful; cheap to allocate.
func renderMarkdown(md string) string {
	p := parser.NewWithExtensions(parser.CommonExtensions | parser.AutoHeadingIDs | parser.NoEmptyLineBeforeBlock)
	r := mdhtml.NewRenderer(mdhtml.RendererOptions{
		Flags: mdhtml.CommonFlags | mdhtml.HrefTargetBlank,
	})
	out := markdown.Render(p.Parse([]byte(md)), r)
	return string(out)
}

// formatPriceIDR matches the renderer's behaviour.
func formatPriceIDR(price int64, currency string) string {
	switch currency {
	case "IDR", "":
		return "Rp " + thousands(price)
	default:
		return currency + " " + thousands(price)
	}
}

func thousands(n int64) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	out := []byte{}
	rem := len(s) % 3
	if rem > 0 {
		out = append(out, s[:rem]...)
		if len(s) > rem {
			out = append(out, '.')
		}
	}
	for i := rem; i < len(s); i += 3 {
		out = append(out, s[i:i+3]...)
		if i+3 < len(s) {
			out = append(out, '.')
		}
	}
	return string(out)
}

// renderTreeWithData renders a tree but uses pre-loaded DB data to materialize
// dynamic blocks (ProductGridDynamic, BlogListDynamic). Calls the base renderTree
// for non-dynamic blocks.
func renderTreeWithData(b *strings.Builder, t Tree, prods []products.Product, posts []blog.Post) {
	for _, blk := range t.Blocks {
		switch blk.Type {
		case "ProductGridDynamic":
			renderProductGridDynamic(b, blk, prods)
		case "BlogListDynamic":
			renderBlogListDynamic(b, blk, posts)
		default:
			renderBlock(b, blk)
		}
	}
}

func renderProductGridDynamic(b *strings.Builder, blk Block, prods []products.Product) {
	p := blk.Props
	limit := intOr(p, "limit", 12)
	b.WriteString(`<section class="wb-products">`)
	if t := str(p, "title"); t != "" {
		fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
	}
	if len(prods) == 0 {
		b.WriteString(`<p class="wb-empty">Belum ada produk.</p></section>`)
		return
	}
	b.WriteString(`<div class="wb-grid wb-grid-3">`)
	n := len(prods)
	if n > limit {
		n = limit
	}
	for _, pr := range prods[:n] {
		fmt.Fprintf(b, `<a class="wb-product" href="/produk/%s/">`, esc(pr.Slug))
		if pr.ImageURL != "" {
			fmt.Fprintf(b, `<img src="%s" alt="%s" loading="lazy" />`, escAttr(pr.ImageURL), escAttr(pr.Name))
		} else {
			b.WriteString(`<div class="wb-product-img-placeholder"></div>`)
		}
		b.WriteString(`<div class="wb-product-body">`)
		fmt.Fprintf(b, `<div class="wb-product-name">%s</div>`, esc(pr.Name))
		fmt.Fprintf(b, `<div class="wb-product-price">%s</div>`, esc(formatPriceIDR(pr.Price, pr.Currency)))
		b.WriteString(`</div></a>`)
	}
	b.WriteString(`</div></section>`)
}

func renderBlogListDynamic(b *strings.Builder, blk Block, posts []blog.Post) {
	p := blk.Props
	limit := intOr(p, "limit", 10)
	b.WriteString(`<section class="wb-bloglist">`)
	if t := str(p, "title"); t != "" {
		fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
	}
	if len(posts) == 0 {
		b.WriteString(`<p class="wb-empty">Belum ada artikel.</p></section>`)
		return
	}
	n := len(posts)
	if n > limit {
		n = limit
	}
	for _, post := range posts[:n] {
		fmt.Fprintf(b, `<a class="wb-blog-item" href="/blog/%s/">`, esc(post.Slug))
		fmt.Fprintf(b, `<h3>%s</h3>`, esc(post.Title))
		if post.Excerpt != "" {
			fmt.Fprintf(b, `<p>%s</p>`, esc(post.Excerpt))
		}
		b.WriteString(`</a>`)
	}
	b.WriteString(`</section>`)
}

// renderProductHTML produces a standalone product detail page.
func renderProductHTML(site *sites.Site, pr products.Product) string {
	var body strings.Builder
	body.WriteString(`<main class="wb-detail">`)
	body.WriteString(`<nav class="wb-breadcrumb"><a href="/">← Beranda</a></nav>`)
	body.WriteString(`<div class="wb-detail-grid">`)

	// Image
	body.WriteString(`<div>`)
	if pr.ImageURL != "" {
		fmt.Fprintf(&body, `<img src="%s" alt="%s" class="wb-detail-img" />`, escAttr(pr.ImageURL), escAttr(pr.Name))
	} else {
		body.WriteString(`<div class="wb-detail-img-placeholder"></div>`)
	}
	// Gallery
	var gallery []string
	_ = json.Unmarshal(pr.Gallery, &gallery)
	if len(gallery) > 0 {
		body.WriteString(`<div class="wb-detail-gallery">`)
		for _, url := range gallery {
			fmt.Fprintf(&body, `<img src="%s" alt="" loading="lazy" />`, escAttr(url))
		}
		body.WriteString(`</div>`)
	}
	body.WriteString(`</div>`)

	// Info
	body.WriteString(`<div>`)
	if pr.Category != "" {
		fmt.Fprintf(&body, `<p class="wb-detail-category">%s</p>`, esc(pr.Category))
	}
	fmt.Fprintf(&body, `<h1 class="wb-detail-title">%s</h1>`, esc(pr.Name))
	fmt.Fprintf(&body, `<p class="wb-detail-price">%s</p>`, esc(formatPriceIDR(pr.Price, pr.Currency)))
	if pr.Stock != nil {
		if *pr.Stock > 0 {
			fmt.Fprintf(&body, `<p class="wb-detail-stock">Stok: %d</p>`, *pr.Stock)
		} else {
			body.WriteString(`<p class="wb-detail-stock">Stok habis</p>`)
		}
	}
	if pr.Description != "" {
		fmt.Fprintf(&body, `<div class="wb-detail-desc">%s</div>`, escMultiline(pr.Description))
	}
	body.WriteString(`</div></div></main>`)

	return wrapHTML(site, pr.Name+" — "+site.Name, descFromText(pr.Description, 160), body.String())
}

// renderBlogPostHTML produces a standalone blog post page (markdown → HTML).
func renderBlogPostHTML(site *sites.Site, post blog.Post) string {
	var body strings.Builder
	body.WriteString(`<main class="wb-article">`)
	body.WriteString(`<nav class="wb-breadcrumb"><a href="/">← Beranda</a></nav>`)
	if post.CoverImageURL != "" {
		fmt.Fprintf(&body, `<img src="%s" alt="%s" class="wb-article-cover" />`, escAttr(post.CoverImageURL), escAttr(post.Title))
	}
	fmt.Fprintf(&body, `<h1 class="wb-article-title">%s</h1>`, esc(post.Title))
	body.WriteString(`<div class="wb-article-meta">`)
	if post.AuthorName != "" {
		fmt.Fprintf(&body, `<span>%s</span>`, esc(post.AuthorName))
	}
	if post.PublishedAt != nil {
		if post.AuthorName != "" {
			body.WriteString(` · `)
		}
		fmt.Fprintf(&body, `<time>%s</time>`, esc(post.PublishedAt.Format("2 January 2006")))
	}
	body.WriteString(`</div>`)
	// Tags
	var tags []string
	_ = json.Unmarshal(post.Tags, &tags)
	if len(tags) > 0 {
		body.WriteString(`<div class="wb-article-tags">`)
		for _, t := range tags {
			fmt.Fprintf(&body, `<span class="wb-tag">%s</span>`, esc(t))
		}
		body.WriteString(`</div>`)
	}
	// Body (markdown → HTML, already escaped by parser)
	fmt.Fprintf(&body, `<article class="wb-prose">%s</article>`, renderMarkdown(post.ContentMD))
	body.WriteString(`</main>`)

	return wrapHTML(site, post.Title+" — "+site.Name, descFromText(post.Excerpt, 160), body.String())
}

func descFromText(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) > max {
		return s[:max]
	}
	return s
}

// wrapHTML returns a full document with shared <head> + provided body fragment.
func wrapHTML(site *sites.Site, title, desc, body string) string {
	var head strings.Builder
	fmt.Fprintf(&head, `<meta charset="utf-8" />`)
	fmt.Fprintf(&head, `<meta name="viewport" content="width=device-width,initial-scale=1" />`)
	fmt.Fprintf(&head, `<title>%s</title>`, esc(title))
	if desc != "" {
		fmt.Fprintf(&head, `<meta name="description" content="%s" />`, escAttr(desc))
		fmt.Fprintf(&head, `<meta property="og:description" content="%s" />`, escAttr(desc))
	}
	fmt.Fprintf(&head, `<meta property="og:title" content="%s" />`, escAttr(title))
	head.WriteString(`<link rel="stylesheet" href="/assets/css/styles.css" />`)
	_ = site
	return fmt.Sprintf(`<!doctype html>
<html lang="id">
<head>%s</head>
<body>%s</body>
</html>`, head.String(), body)
}
