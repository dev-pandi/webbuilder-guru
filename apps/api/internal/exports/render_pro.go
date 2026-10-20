package exports

import (
	"fmt"
	"strings"
)

// Blok-blok di file ini dipakai template bawaan tapi tidak pernah punya case di
// renderBlock, jadi setiap export diam-diam kehilangan seluruh section-nya.
// Markup di-port dari apps/renderer/components/Blocks.tsx; class Tailwind di
// sana diganti class .wb-* yang CSS-nya ada di proExtraCSS (styles_pro.go).
func renderProBlock(b *strings.Builder, blk Block) bool {
	p := blk.Props
	switch blk.Type {
	case "CTABanner":
		proCTABanner(b, p)
	case "BentoGrid":
		proBentoGrid(b, p)
	case "FAQ":
		proFAQ(b, p)
	case "Timeline":
		proTimeline(b, p)
	case "ProcessSteps":
		proProcessSteps(b, p)
	case "TeamGrid":
		proTeamGrid(b, p)
	case "IconList":
		proIconList(b, p)
	case "Map":
		proEmbed(b, p, "wb-map")
	case "Gallery":
		proGallery(b, p)
	case "SocialLinks":
		proSocialLinks(b, p)
	case "Newsletter":
		proNewsletter(b, p)
	case "ContactForm":
		proContactForm(b, p)
	default:
		return false
	}
	return true
}

// proHeading menulis judul + subjudul opsional yang dipakai hampir semua blok.
func proHeading(b *strings.Builder, p map[string]any, klass string) {
	if t := str(p, "title"); t != "" {
		fmt.Fprintf(b, `<h3 class="%s">%s</h3>`, klass, esc(t))
	}
	if s := str(p, "subtitle"); s != "" {
		fmt.Fprintf(b, `<p class="wb-pro-sub">%s</p>`, esc(s))
	}
}

func items(p map[string]any) []map[string]any {
	raw := arr(p, "items")
	out := make([]map[string]any, 0, len(raw))
	for _, v := range raw {
		if m, ok := v.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

func proCTABanner(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-ctabanner"><div class="wb-ctabanner-inner">`)
	fmt.Fprintf(b, `<h2 class="wb-ctabanner-title">%s</h2>`, esc(str(p, "title")))
	if s := str(p, "subtitle"); s != "" {
		fmt.Fprintf(b, `<p class="wb-ctabanner-sub">%s</p>`, esc(s))
	}
	if l := str(p, "ctaLabel"); l != "" {
		fmt.Fprintf(b, `<a class="wb-ctabanner-btn" href="%s">%s →</a>`,
			escAttr(strOr(p, "ctaHref", "#")), esc(l))
	}
	b.WriteString(`</div></section>`)
}

func proBentoGrid(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-bento">`)
	proHeading(b, p, "wb-pro-title")
	b.WriteString(`<div class="wb-bento-grid">`)
	for _, it := range items(p) {
		span := ""
		switch str(it, "size") {
		case "large":
			span = " wb-bento-cell--large"
		case "wide":
			span = " wb-bento-cell--wide"
		case "tall":
			span = " wb-bento-cell--tall"
		}
		fmt.Fprintf(b, `<div class="wb-bento-cell%s"><h4>%s</h4><p>%s</p></div>`,
			span, esc(str(it, "title")), esc(str(it, "desc")))
	}
	b.WriteString(`</div></section>`)
}

func proFAQ(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-faq">`)
	proHeading(b, p, "wb-pro-title")
	b.WriteString(`<div class="wb-faq-list">`)
	for _, it := range items(p) {
		// <details> dipilih supaya accordion tetap bisa dibuka tanpa JS.
		fmt.Fprintf(b,
			`<details class="wb-faq-item"><summary>%s</summary><div class="wb-faq-answer">%s</div></details>`,
			esc(str(it, "question")), esc(str(it, "answer")))
	}
	b.WriteString(`</div></section>`)
}

func proTimeline(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-timeline">`)
	proHeading(b, p, "wb-pro-title")
	b.WriteString(`<ol class="wb-timeline-list">`)
	for i, it := range items(p) {
		fmt.Fprintf(b, `<li class="wb-timeline-item"><span class="wb-timeline-dot">%d</span>`, i+1)
		fmt.Fprintf(b, `<div class="wb-timeline-date">%s</div>`, esc(str(it, "date")))
		fmt.Fprintf(b, `<h4>%s</h4><p>%s</p></li>`, esc(str(it, "title")), esc(str(it, "desc")))
	}
	b.WriteString(`</ol></section>`)
}

func proProcessSteps(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-steps">`)
	proHeading(b, p, "wb-pro-title")
	b.WriteString(`<div class="wb-steps-grid">`)
	for i, it := range items(p) {
		fmt.Fprintf(b, `<div class="wb-steps-item"><div class="wb-steps-num">%d</div>`, i+1)
		fmt.Fprintf(b, `<h4>%s</h4><p>%s</p></div>`, esc(str(it, "title")), esc(str(it, "desc")))
	}
	b.WriteString(`</div></section>`)
}

func proTeamGrid(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-team">`)
	proHeading(b, p, "wb-pro-title")
	b.WriteString(`<div class="wb-team-grid">`)
	for _, it := range items(p) {
		name := str(it, "name")
		b.WriteString(`<div class="wb-team-item">`)
		if img := str(it, "image"); img != "" {
			fmt.Fprintf(b, `<img class="wb-team-photo" src="%s" alt="%s" loading="lazy" decoding="async" width="128" height="128">`,
				escAttr(img), escAttr(name))
		} else {
			fmt.Fprintf(b, `<div class="wb-team-initial">%s</div>`, esc(initialOf(name)))
		}
		fmt.Fprintf(b, `<h4>%s</h4><p class="wb-team-role">%s</p></div>`, esc(name), esc(str(it, "role")))
	}
	b.WriteString(`</div></section>`)
}

// initialOf mengambil rune pertama, bukan byte pertama — nama non-ASCII tidak
// boleh terpotong jadi byte rusak.
func initialOf(name string) string {
	for _, r := range name {
		return string(r)
	}
	return "?"
}

func proIconList(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-iconlist">`)
	proHeading(b, p, "wb-pro-title wb-pro-title--left")
	b.WriteString(`<ul class="wb-iconlist-items">`)
	for _, it := range items(p) {
		fmt.Fprintf(b, `<li><span class="wb-iconlist-badge">%s</span><span>%s</span></li>`,
			esc(str(it, "icon")), esc(str(it, "text")))
	}
	b.WriteString(`</ul></section>`)
}

func proEmbed(b *strings.Builder, p map[string]any, klass string) {
	fmt.Fprintf(b, `<section class="wb-section %s">`, klass)
	proHeading(b, p, "wb-pro-title wb-pro-title--left")
	fmt.Fprintf(b, `<div class="wb-embed-frame"><iframe src="%s" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></section>`,
		escAttr(str(p, "src")))
}

func proGallery(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-gallery">`)
	proHeading(b, p, "wb-pro-title wb-pro-title--left")
	b.WriteString(`<div class="wb-gallery-grid">`)
	for _, it := range items(p) {
		caption := str(it, "caption")
		b.WriteString(`<figure class="wb-gallery-item">`)
		if img := str(it, "image"); img != "" {
			fmt.Fprintf(b, `<img src="%s" alt="%s" loading="lazy" decoding="async">`,
				escAttr(img), escAttr(caption))
		} else {
			b.WriteString(`<div class="wb-gallery-placeholder"></div>`)
		}
		if caption != "" {
			fmt.Fprintf(b, `<figcaption>%s</figcaption>`, esc(caption))
		}
		b.WriteString(`</figure>`)
	}
	b.WriteString(`</div></section>`)
}

func proSocialLinks(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-social">`)
	if t := str(p, "title"); t != "" {
		fmt.Fprintf(b, `<p class="wb-social-title">%s</p>`, esc(t))
	}
	b.WriteString(`<div class="wb-social-row">`)
	for _, it := range items(p) {
		platform := str(it, "platform")
		fmt.Fprintf(b, `<a class="wb-social-link" href="%s" target="_blank" rel="noopener noreferrer" aria-label="%s">%s</a>`,
			escAttr(str(it, "href")), escAttr(platform), socialIconSVG(platform))
	}
	b.WriteString(`</div></section>`)
}

func proNewsletter(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-newsletter"><div class="wb-newsletter-card">`)
	fmt.Fprintf(b, `<h3 class="wb-pro-title">%s</h3>`, esc(str(p, "title")))
	if s := str(p, "subtitle"); s != "" {
		fmt.Fprintf(b, `<p class="wb-pro-sub">%s</p>`, esc(s))
	}
	fmt.Fprintf(b, `<form class="wb-newsletter-form" action="%s" method="post">`, escAttr(str(p, "action")))
	fmt.Fprintf(b, `<input type="email" name="email" required placeholder="%s">`,
		escAttr(strOr(p, "placeholder", "nama@email.com")))
	fmt.Fprintf(b, `<button type="submit" class="wb-btn wb-btn-primary">%s</button></form>`,
		esc(strOr(p, "ctaLabel", "Subscribe")))
	if n := str(p, "note"); n != "" {
		fmt.Fprintf(b, `<p class="wb-newsletter-note">%s</p>`, esc(n))
	}
	b.WriteString(`</div></section>`)
}

func proContactForm(b *strings.Builder, p map[string]any) {
	b.WriteString(`<section class="wb-section wb-contact"><div class="wb-contact-head">`)
	fmt.Fprintf(b, `<h3 class="wb-pro-title">%s</h3>`, esc(str(p, "title")))
	if s := str(p, "subtitle"); s != "" {
		fmt.Fprintf(b, `<p class="wb-pro-sub">%s</p>`, esc(s))
	}
	b.WriteString(`</div>`)
	fmt.Fprintf(b, `<form class="wb-contact-form" action="%s" method="post">`, escAttr(str(p, "action")))
	b.WriteString(`<div class="wb-contact-row">`)
	b.WriteString(`<label><span>Nama</span><input name="name" type="text" required></label>`)
	b.WriteString(`<label><span>Email</span><input name="email" type="email" required></label>`)
	b.WriteString(`</div>`)
	b.WriteString(`<label><span>Pesan</span><textarea name="message" rows="5" required></textarea></label>`)
	fmt.Fprintf(b, `<button type="submit" class="wb-btn wb-btn-primary">%s</button></form></section>`,
		esc(strOr(p, "ctaLabel", "Kirim")))
}

// socialIconSVG mirror socialIcon() di Blocks.tsx — matching substring, bukan
// exact, supaya label bebas seperti "Instagram Saya" tetap dapat ikon benar.
func socialIconSVG(platform string) string {
	norm := strings.ToLower(platform)
	for _, c := range socialIcons {
		for _, key := range c.keys {
			if strings.Contains(norm, key) {
				return socialSVG(c.path)
			}
		}
	}
	return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg>`
}

func socialSVG(path string) string {
	return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="` + path + `"/></svg>`
}

var socialIcons = []struct {
	keys []string
	path string
}{
	{[]string{"instagram"}, "M7 2C4.243 2 2 4.243 2 7v10c0 2.757 2.243 5 5 5h10c2.757 0 5-2.243 5-5V7c0-2.757-2.243-5-5-5H7zm0 2h10c1.654 0 3 1.346 3 3v10c0 1.654-1.346 3-3 3H7c-1.654 0-3-1.346-3-3V7c0-1.654 1.346-3 3-3zm10 1a1 1 0 100 2 1 1 0 000-2zm-5 2a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z"},
	{[]string{"twitter", "x.com"}, "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"},
	{[]string{"facebook"}, "M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9v-2.89h2.54v-2.2c0-2.51 1.49-3.89 3.77-3.89 1.09 0 2.24.19 2.24.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.45 2.89h-2.33V22c4.78-.75 8.44-4.89 8.44-9.94z"},
	{[]string{"linkedin"}, "M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.26 2.36 4.26 5.43v6.31zM5.34 7.43a2.06 2.06 0 11-.01-4.13 2.06 2.06 0 010 4.13zM7.12 20.45H3.55V9h3.57v11.45z"},
	{[]string{"youtube"}, "M23.5 6.51a3 3 0 00-2.12-2.12C19.66 4 12 4 12 4s-7.66 0-9.38.4A3 3 0 00.5 6.5C.1 8.22.1 12 .1 12s0 3.78.4 5.5a3 3 0 002.12 2.12C4.34 20 12 20 12 20s7.66 0 9.38-.4a3 3 0 002.12-2.12c.4-1.72.4-5.5.4-5.5s0-3.78-.4-5.5zM9.6 15.5v-7l6.4 3.5-6.4 3.5z"},
	{[]string{"tiktok"}, "M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005.9 20.84a6.32 6.32 0 0010.86-4.43V7.94a8.16 8.16 0 004.77 1.52V6a4.82 4.82 0 01-1.94-.31z"},
	{[]string{"github"}, "M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.6 11.6 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.7-5.5 6 .4.4.8 1 .8 2.1v3.2c0 .3.2.7.8.6A12 12 0 0012 .3"},
	{[]string{"email", "mail"}, "M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"},
	{[]string{"whatsapp", "wa"}, "M.06 24l1.68-6.13A11.86 11.86 0 010 12.01C0 5.4 5.4 0 12.01 0 18.62 0 24 5.4 24 12.01 24 18.62 18.6 24 12.01 24c-2 0-3.95-.5-5.66-1.45L.06 24zm6.6-3.81c1.66.99 3.27 1.58 5.34 1.58 5.5 0 9.97-4.47 9.97-9.97S17.5 1.84 12 1.84 2.03 6.31 2.03 11.81c0 2.17.64 3.78 1.71 5.49l-1 3.66 3.92-1.03z"},
}
