package exports

// render_extra — 16 blok inti yang dulu hilang diam-diam dari export (jadi
// <!-- block:X -->): Quote, Spacer, Divider, Alert, Banner, Tabs, VideoEmbed,
// PricingTable, HeroSplit, HeroSpotlight, LogoCloud, StatsBar, StatsCard,
// TestimonialCard, TestimonialMarquee, FeatureSide.
//
// Markup mencerminkan apps/renderer/components/Blocks.tsx; gaya di
// extraCSS (styles_extra.go). Sisanya yang belum diport adalah keluarga
// GuruPlus* — itu dilaporkan ke user lewat warning export, bukan senyap.

import (
	"fmt"
	"hash/fnv"
	"strings"
)

func renderExtraBlock(b *strings.Builder, blk Block) bool {
	p := blk.Props
	switch blk.Type {

	case "Spacer":
		h := intOr(p, "size", 64)
		if h < 0 || h > 2000 {
			h = 64
		}
		fmt.Fprintf(b, `<div style="height:%dpx" aria-hidden="true"></div>`, h)

	case "Divider":
		if l := str(p, "label"); l != "" {
			fmt.Fprintf(b, `<div class="wb-divider wb-divider--labeled"><span></span><em>%s</em><span></span></div>`, esc(l))
		} else {
			b.WriteString(`<div class="wb-divider"><span></span></div>`)
		}

	case "Banner":
		b.WriteString(`<div class="wb-banner">`)
		fmt.Fprintf(b, `<span>%s</span>`, esc(str(p, "text")))
		if l := str(p, "ctaLabel"); l != "" {
			fmt.Fprintf(b, `<a href="%s">%s</a>`, escAttr(strOr(p, "ctaHref", "#")), esc(l))
		}
		b.WriteString(`</div>`)

	case "Quote":
		b.WriteString(`<section class="wb-quote"><div class="wb-quote-mark">&#10077;</div>`)
		fmt.Fprintf(b, `<blockquote>%s</blockquote>`, esc(str(p, "text")))
		b.WriteString(`<footer><span class="wb-quote-rule"></span><div>`)
		fmt.Fprintf(b, `<div class="wb-quote-author">%s</div>`, esc(str(p, "author")))
		if r := str(p, "role"); r != "" {
			fmt.Fprintf(b, `<div class="wb-quote-role">%s</div>`, esc(r))
		}
		b.WriteString(`</div></footer></section>`)

	case "Alert":
		variant := strOr(p, "variant", "info")
		icon := map[string]string{"info": "ℹ️", "success": "✅", "warning": "⚠️", "danger": "❗"}[variant]
		if icon == "" {
			variant, icon = "info", "ℹ️"
		}
		fmt.Fprintf(b, `<section class="wb-alert wb-alert--%s"><span class="wb-alert-icon">%s</span><div>`, variant, icon)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<p class="wb-alert-title">%s</p>`, esc(t))
		}
		if body := str(p, "body"); body != "" {
			fmt.Fprintf(b, `<p class="wb-alert-body">%s</p>`, esc(body))
		}
		b.WriteString(`</div></section>`)

	case "StatsBar":
		b.WriteString(`<section class="wb-statsbar"><div class="wb-statsbar-grid">`)
		for _, it := range items(p) {
			fmt.Fprintf(b, `<div class="wb-statsbar-item"><div class="wb-statsbar-value">%s</div><div class="wb-statsbar-label">%s</div></div>`,
				esc(str(it, "value")), esc(str(it, "label")))
		}
		b.WriteString(`</div></section>`)

	case "StatsCard":
		b.WriteString(`<section class="wb-statscard"><div class="wb-statscard-box">`)
		fmt.Fprintf(b, `<div class="wb-statscard-value">%s</div><div class="wb-statscard-label">%s</div>`,
			esc(str(p, "value")), esc(str(p, "label")))
		if d := str(p, "desc"); d != "" {
			fmt.Fprintf(b, `<p class="wb-statscard-desc">%s</p>`, esc(d))
		}
		b.WriteString(`</div></section>`)

	case "VideoEmbed":
		b.WriteString(`<section class="wb-videoembed">`)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
		}
		fmt.Fprintf(b, `<div class="wb-embed-frame"><iframe src="%s" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div></section>`,
			escAttr(str(p, "src")))

	case "LogoCloud":
		b.WriteString(`<section class="wb-logocloud">`)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<p class="wb-logocloud-title">%s</p>`, esc(t))
		}
		b.WriteString(`<div class="wb-logocloud-row">`)
		for _, it := range items(p) {
			if img := str(it, "image"); img != "" {
				fmt.Fprintf(b, `<img src="%s" alt="%s" loading="lazy" decoding="async">`, escAttr(img), escAttr(str(it, "name")))
			} else {
				fmt.Fprintf(b, `<span>%s</span>`, esc(str(it, "name")))
			}
		}
		b.WriteString(`</div></section>`)

	case "Tabs":
		its := items(p)
		if len(its) > 4 {
			its = its[:4]
		}
		// id deterministik dari label — ekspor statis tidak boleh acak supaya
		// hasil build reproducible.
		h := fnv.New32a()
		for _, it := range its {
			h.Write([]byte(str(it, "label")))
		}
		tabID := fmt.Sprintf("wb-tabs-%x", h.Sum32())
		b.WriteString(`<section class="wb-tabs">`)
		for i := range its {
			checked := ""
			if i == 0 {
				checked = ` checked`
			}
			fmt.Fprintf(b, `<input type="radio" name="%s" id="%s-%d" class="wb-tab-input"%s>`, tabID, tabID, i, checked)
		}
		b.WriteString(`<div role="tablist" class="wb-tab-list">`)
		for i, it := range its {
			fmt.Fprintf(b, `<label for="%s-%d" class="wb-tab-label">%s</label>`, tabID, i, esc(str(it, "label")))
		}
		b.WriteString(`</div><div class="wb-tab-panels">`)
		for _, it := range its {
			fmt.Fprintf(b, `<div role="tabpanel" class="wb-tab-panel">%s</div>`, escMultiline(str(it, "body")))
		}
		b.WriteString(`</div></section>`)

	case "TestimonialCard":
		b.WriteString(`<section class="wb-tcard"><div class="wb-tcard-box">`)
		if rating := intOr(p, "rating", 0); rating > 0 {
			b.WriteString(`<div class="wb-tcard-stars">`)
			for i := 0; i < 5; i++ {
				cls := "wb-star"
				if i >= rating {
					cls += " wb-star--off"
				}
				fmt.Fprintf(b, `<span class="%s">★</span>`, cls)
			}
			b.WriteString(`</div>`)
		}
		fmt.Fprintf(b, `<blockquote>&ldquo;%s&rdquo;</blockquote>`, esc(str(p, "quote")))
		b.WriteString(`<div class="wb-tcard-person">`)
		name := str(p, "name")
		if av := str(p, "avatar"); av != "" {
			fmt.Fprintf(b, `<img src="%s" alt="" loading="lazy" decoding="async" width="56" height="56">`, escAttr(av))
		} else {
			fmt.Fprintf(b, `<div class="wb-tcard-initial">%s</div>`, esc(firstChar(name, "?")))
		}
		fmt.Fprintf(b, `<div><div class="wb-tcard-name">%s</div>`, esc(name))
		if r := str(p, "role"); r != "" {
			fmt.Fprintf(b, `<div class="wb-tcard-role">%s</div>`, esc(r))
		}
		b.WriteString(`</div></div></div></section>`)

	case "TestimonialMarquee":
		b.WriteString(`<section class="wb-tmarquee">`)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
		}
		b.WriteString(`<div class="wb-marquee-mask"><div class="wb-marquee">`)
		its := items(p)
		// Digandakan supaya loop animasinya mulus — sama dengan renderer.
		for _, it := range append(its, its...) {
			name := str(it, "name")
			fmt.Fprintf(b, `<div class="wb-tmarquee-card"><p>&ldquo;%s&rdquo;</p><div class="wb-tmarquee-person"><div class="wb-tcard-initial">%s</div><div class="wb-tcard-name">%s</div></div></div>`,
				esc(str(it, "text")), esc(firstChar(name, "?")), esc(name))
		}
		b.WriteString(`</div></div></section>`)

	case "PricingTable":
		b.WriteString(`<section class="wb-pricing">`)
		if t := str(p, "title"); t != "" {
			fmt.Fprintf(b, `<h3>%s</h3>`, esc(t))
		}
		if s := str(p, "subtitle"); s != "" {
			fmt.Fprintf(b, `<p class="wb-pricing-sub">%s</p>`, esc(s))
		}
		b.WriteString(`<div class="wb-pricing-grid">`)
		for _, it := range items(p) {
			featured := str(it, "featured") == "yes" || str(it, "featured") == "true"
			cls := "wb-plan"
			if featured {
				cls += " wb-plan--featured"
			}
			fmt.Fprintf(b, `<div class="%s">`, cls)
			if featured {
				b.WriteString(`<div class="wb-plan-badge">Populer</div>`)
			}
			fmt.Fprintf(b, `<h4>%s</h4>`, esc(str(it, "title")))
			if d := str(it, "desc"); d != "" {
				fmt.Fprintf(b, `<p class="wb-plan-desc">%s</p>`, esc(d))
			}
			fmt.Fprintf(b, `<div class="wb-plan-price"><span>%s</span>`, esc(str(it, "price")))
			if per := str(it, "period"); per != "" {
				fmt.Fprintf(b, `<em>%s</em>`, esc(per))
			}
			b.WriteString(`</div><ul class="wb-plan-features">`)
			for _, f := range strings.Split(str(it, "features"), "\n") {
				if f = strings.TrimSpace(f); f != "" {
					fmt.Fprintf(b, `<li><span class="wb-plan-check">✓</span>%s</li>`, esc(f))
				}
			}
			b.WriteString(`</ul>`)
			if l := str(it, "ctaLabel"); l != "" {
				btn := "wb-btn"
				if featured {
					btn = "wb-btn wb-btn-primary"
				}
				fmt.Fprintf(b, `<a class="%s" href="%s">%s</a>`, btn, escAttr(strOr(it, "ctaHref", "#")), esc(l))
			}
			b.WriteString(`</div>`)
		}
		b.WriteString(`</div></section>`)

	case "HeroSpotlight":
		b.WriteString(`<section class="wb-spotlight"><div class="wb-spotlight-bg"><div class="wb-spotlight-glow wb-spotlight-anim"></div><div class="wb-grid-pattern"></div></div><div class="wb-spotlight-inner">`)
		writeHeroCommon(b, p, "h1")
		b.WriteString(`</div></section>`)

	case "HeroSplit":
		cls := "wb-herosplit"
		if str(p, "reversed") == "yes" {
			cls += " wb-herosplit--reversed"
		}
		fmt.Fprintf(b, `<section class="%s"><div class="wb-herosplit-copy">`, cls)
		writeHeroCommon(b, p, "h1")
		b.WriteString(`</div><div class="wb-herosplit-media">`)
		if img := str(p, "image"); img != "" {
			fmt.Fprintf(b, `<img src="%s" alt="" fetchpriority="high" decoding="async">`, escAttr(img))
		} else {
			b.WriteString(`<div class="wb-media-placeholder"></div>`)
		}
		b.WriteString(`</div></section>`)

	case "FeatureSide":
		b.WriteString(`<section class="wb-featureside">`)
		for i, it := range items(p) {
			cls := "wb-featureside-row"
			if i%2 == 1 {
				cls += " wb-featureside-row--reversed"
			}
			fmt.Fprintf(b, `<div class="%s"><div class="wb-featureside-copy"><h3>%s</h3><p>%s</p></div><div class="wb-featureside-media">`,
				cls, esc(str(it, "title")), esc(str(it, "desc")))
			if img := str(it, "image"); img != "" {
				fmt.Fprintf(b, `<img src="%s" alt="" loading="lazy" decoding="async">`, escAttr(img))
			} else {
				b.WriteString(`<div class="wb-media-placeholder"></div>`)
			}
			b.WriteString(`</div></div>`)
		}
		b.WriteString(`</section>`)

	default:
		return false
	}
	return true
}

// writeHeroCommon — eyebrow + judul + subjudul + dua CTA, dipakai kedua hero.
func writeHeroCommon(b *strings.Builder, p map[string]any, hTag string) {
	if e := str(p, "eyebrow"); e != "" {
		fmt.Fprintf(b, `<div class="wb-eyebrow"><span class="wb-eyebrow-dot"></span>%s</div>`, esc(e))
	}
	fmt.Fprintf(b, `<%s>%s</%s>`, hTag, esc(str(p, "title")), hTag)
	if s := str(p, "subtitle"); s != "" {
		fmt.Fprintf(b, `<p class="wb-hero-sub">%s</p>`, esc(s))
	}
	hasCTA := str(p, "ctaLabel") != "" || str(p, "ctaSecondaryLabel") != ""
	if !hasCTA {
		return
	}
	b.WriteString(`<div class="wb-hero-ctas">`)
	if l := str(p, "ctaLabel"); l != "" {
		fmt.Fprintf(b, `<a class="wb-btn wb-btn-primary" href="%s">%s →</a>`, escAttr(strOr(p, "ctaHref", "#")), esc(l))
	}
	if l := str(p, "ctaSecondaryLabel"); l != "" {
		fmt.Fprintf(b, `<a class="wb-btn" href="%s">%s</a>`, escAttr(strOr(p, "ctaSecondaryHref", "#")), esc(l))
	}
	b.WriteString(`</div>`)
}

func firstChar(s, def string) string {
	for _, r := range strings.TrimSpace(s) {
		return string(r)
	}
	return def
}
