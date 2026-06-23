package exports

import (
	"encoding/json"
	"fmt"
	"html"
	"strings"
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

func esc(s string) string { return html.EscapeString(s) }

func escAttr(s string) string { return html.EscapeString(s) }

func escMultiline(s string) string {
	return strings.ReplaceAll(html.EscapeString(s), "\n", "<br/>")
}
