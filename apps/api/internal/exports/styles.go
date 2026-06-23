package exports

import (
	"encoding/json"
	"fmt"
	"strings"
)

type theme struct {
	Colors map[string]string `json:"colors"`
	Font   map[string]string `json:"font"`
	Radius string            `json:"radius"`
}

func parseTheme(raw json.RawMessage) theme {
	t := theme{Colors: map[string]string{}, Font: map[string]string{}}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &t)
	}
	return t
}

func or(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// buildCSS produces a single stylesheet that mirrors the renderer look,
// without any Tailwind/runtime dependency.
func buildCSS(rawTheme json.RawMessage) string {
	t := parseTheme(rawTheme)
	primary := or(t.Colors["primary"], "#2563eb")
	secondary := or(t.Colors["secondary"], "#0ea5e9")
	bg := or(t.Colors["bg"], "#ffffff")
	fg := or(t.Colors["fg"], "#0f172a")
	radius := or(t.Radius, "0.75rem")
	heading := or(t.Font["heading"], "Inter")
	body := or(t.Font["body"], "Inter")

	var b strings.Builder

	fams := dedupe([]string{heading, body})
	if len(fams) > 0 {
		fmt.Fprintf(&b, "@import url('https://fonts.googleapis.com/css2?%s&display=swap');\n",
			gfontsQuery(fams))
	}

	fmt.Fprintf(&b, `
:root {
  --color-primary: %s;
  --color-secondary: %s;
  --color-bg: %s;
  --color-fg: %s;
  --radius: %s;
  --font-heading: "%s", system-ui, sans-serif;
  --font-body: "%s", system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--color-bg); color: var(--color-fg); font-family: var(--font-body); line-height: 1.6; }
h1,h2,h3,h4,h5,h6 { font-family: var(--font-heading); line-height: 1.2; margin: 0; }
a { color: inherit; text-decoration: none; }
img { max-width: 100%%; height: auto; display: block; }

.wb-container { max-width: 1024px; margin: 0 auto; padding: 0 1.5rem; }

.wb-navbar { border-bottom: 1px solid #e5e7eb; }
.wb-navbar-inner { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; }
.wb-brand { font-size: 1.125rem; font-weight: 700; }
.wb-nav { display: flex; gap: 1.5rem; font-size: 0.95rem; }
.wb-nav a:hover { text-decoration: underline; }

.wb-hero { max-width: 56rem; margin: 0 auto; padding: 5rem 1.5rem; text-align: center; }
.wb-hero h1 { font-size: clamp(2rem, 4vw, 3.25rem); font-weight: 800; letter-spacing: -0.02em; }
.wb-hero-sub { font-size: 1.125rem; opacity: 0.8; margin: 1rem auto 0; max-width: 36rem; }

.wb-btn { display: inline-block; padding: 0.75rem 1.5rem; font-weight: 600; margin-top: 2rem; border-radius: var(--radius); transition: opacity 0.15s; }
.wb-btn:hover { opacity: 0.9; }
.wb-btn-primary { background: var(--color-primary); color: #fff; }
.wb-btn-secondary { background: var(--color-secondary); color: #fff; }

.wb-heading { max-width: 64rem; margin: 0 auto; padding: 1.5rem; font-size: 1.875rem; font-weight: 700; }
.wb-text { max-width: 48rem; margin: 0 auto; padding: 0.5rem 1.5rem; }

.wb-section { max-width: 64rem; margin: 0 auto; padding: 2.5rem 1.5rem; }
.wb-section h3 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }

.wb-features, .wb-products, .wb-projects { max-width: 64rem; margin: 0 auto; padding: 2.5rem 1.5rem; }
.wb-features h3, .wb-products h3 { font-size: 1.5rem; font-weight: 600; margin-bottom: 1.5rem; }

.wb-grid { display: grid; gap: 1.5rem; }
.wb-grid-2 { grid-template-columns: 1fr; }
.wb-grid-3 { grid-template-columns: 1fr; }
@media (min-width: 640px) {
  .wb-grid-2 { grid-template-columns: repeat(2, 1fr); }
  .wb-grid-3 { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .wb-grid-3 { grid-template-columns: repeat(3, 1fr); }
}

.wb-feature { border: 1px solid #e5e7eb; border-radius: var(--radius); padding: 1.25rem; }
.wb-feature-title { font-weight: 600; }
.wb-feature-desc { margin-top: 0.25rem; font-size: 0.95rem; opacity: 0.8; }

.wb-product { border: 1px solid #e5e7eb; border-radius: var(--radius); overflow: hidden; }
.wb-product-img-placeholder { aspect-ratio: 1 / 1; background: #f1f5f9; }
.wb-product-body { padding: 1rem; }
.wb-product-name { font-weight: 500; }
.wb-product-price { margin-top: 0.25rem; font-size: 0.95rem; opacity: 0.8; }

.wb-project { display: block; border: 1px solid #e5e7eb; border-radius: var(--radius); padding: 1.25rem; transition: box-shadow 0.15s; }
.wb-project:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.wb-project-name { font-weight: 600; }
.wb-project-desc { margin-top: 0.25rem; font-size: 0.95rem; opacity: 0.8; }

.wb-bloglist { max-width: 48rem; margin: 0 auto; padding: 2.5rem 1.5rem; }
.wb-blog-item { display: block; padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e5e7eb; }
.wb-blog-item:last-child { border-bottom: none; }
.wb-blog-item h3 { font-size: 1.25rem; font-weight: 600; }
.wb-blog-item p { margin-top: 0.25rem; opacity: 0.8; }

.wb-testimonials { max-width: 48rem; margin: 0 auto; padding: 2.5rem 1.5rem; }
.wb-testimonial { border-left: 4px solid var(--color-primary); padding-left: 1.25rem; margin: 1rem 0; font-style: italic; }
.wb-testimonial span { font-style: normal; font-weight: 600; }

.wb-footer { margin-top: 4rem; border-top: 1px solid #e5e7eb; }
.wb-footer .wb-container { padding: 1.5rem; text-align: center; font-size: 0.875rem; opacity: 0.7; }
`, primary, secondary, bg, fg, radius, heading, body)

	return b.String()
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}

func gfontsQuery(fams []string) string {
	parts := make([]string, 0, len(fams))
	for _, f := range fams {
		parts = append(parts, "family="+strings.ReplaceAll(f, " ", "+")+":wght@400;500;600;700")
	}
	return strings.Join(parts, "&")
}
