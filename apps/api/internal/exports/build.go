package exports

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/sites"
)

type Builder struct {
	Sites *sites.Repo
	Pages *pages.Repo
}

// Write produces a zip bundle for the given site (must include all pages).
// Streamed directly to w — no temp files.
func (b *Builder) Write(ctx context.Context, w io.Writer, siteID, ownerID uuid.UUID) error {
	site, err := b.Sites.GetOwned(ctx, siteID, ownerID)
	if err != nil {
		return err
	}
	ps, err := b.Pages.ListBySite(ctx, siteID)
	if err != nil {
		return err
	}

	z := zip.NewWriter(w)
	defer z.Close()

	// CSS
	if err := writeFile(z, "assets/css/styles.css", buildCSS(site.Theme)); err != nil {
		return err
	}
	// Sitemap-compatible URL set (relative paths only — host-agnostic).
	if err := writeFile(z, "robots.txt", "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n"); err != nil {
		return err
	}
	if err := writeFile(z, "sitemap.xml", buildSitemap(ps)); err != nil {
		return err
	}

	// Pages
	for _, p := range ps {
		path := pageZipPath(p)
		html := renderPageHTML(site, p, ps)
		if err := writeFile(z, path, html); err != nil {
			return err
		}
	}
	return nil
}

func writeFile(z *zip.Writer, name, content string) error {
	f, err := z.CreateHeader(&zip.FileHeader{
		Name:     name,
		Method:   zip.Deflate,
		Modified: time.Now().UTC(),
	})
	if err != nil {
		return err
	}
	_, err = io.WriteString(f, content)
	return err
}

func pageZipPath(p pages.Page) string {
	if p.IsHome || p.Slug == "home" || p.Slug == "index" {
		return "index.html"
	}
	return p.Slug + "/index.html"
}

func pageRelHref(p pages.Page) string {
	if p.IsHome || p.Slug == "home" || p.Slug == "index" {
		return "/"
	}
	return "/" + p.Slug + "/"
}

func renderPageHTML(site *sites.Site, p pages.Page, all []pages.Page) string {
	tree := parseTree(p.Tree)
	// Rewrite navbar links from in-app paths to relative exported paths.
	rewriteLinks(&tree, all)

	var body strings.Builder
	renderTree(&body, tree)

	seo := parseSEO(p.SEO)
	title := seo.Title
	if title == "" {
		title = p.Title
	}
	if title == "" {
		title = site.Name
	}
	desc := seo.Description

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

	return fmt.Sprintf(`<!doctype html>
<html lang="id">
<head>%s</head>
<body>%s</body>
</html>`, head.String(), body.String())
}

func rewriteLinks(t *Tree, all []pages.Page) {
	// Build slug -> rel href map
	hrefBySlug := map[string]string{}
	for _, p := range all {
		hrefBySlug["/"+p.Slug] = pageRelHref(p)
		hrefBySlug["/"+p.Slug+"/"] = pageRelHref(p)
		if p.IsHome {
			hrefBySlug["/"] = "/"
		}
	}
	for i := range t.Blocks {
		props := t.Blocks[i].Props
		if props == nil {
			continue
		}
		if links, ok := props["links"].([]any); ok {
			for j := range links {
				if m, ok := links[j].(map[string]any); ok {
					if h, ok := m["href"].(string); ok {
						if rep, ok := hrefBySlug[h]; ok {
							m["href"] = rep
						}
					}
				}
			}
		}
		if h, ok := props["ctaHref"].(string); ok {
			if rep, ok := hrefBySlug[h]; ok {
				props["ctaHref"] = rep
			}
		}
	}
}

type seoData struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

func parseSEO(raw []byte) seoData {
	var s seoData
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &s)
	}
	return s
}

func buildSitemap(ps []pages.Page) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, p := range ps {
		fmt.Fprintf(&b, "  <url><loc>%s</loc></url>\n", pageRelHref(p))
	}
	b.WriteString(`</urlset>` + "\n")
	return b.String()
}
