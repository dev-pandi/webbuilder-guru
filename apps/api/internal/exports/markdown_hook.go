package exports

// markdown_hook — RenderNodeHook gomarkdown yang menyamakan hasil export
// dengan renderer live (apps/renderer/lib/markdown.ts). Empat hal yang dulu
// menyimpang:
//
//  1. HTML mentah dibuang total (SkipHTML) → paragraf rata tengah dari
//     RichEditor lenyap BESERTA teksnya. Sekarang whitelist: p/h1-h3 dengan
//     text-align, span dengan color/font-family/font-size — grammar yang sama
//     dengan apps/{web,renderer}/lib/safe-md-html.ts. Isi blok di-parse ulang
//     karena turndown menyimpannya sebagai markdown mentah.
//  2. Fence ```youtube / ```audio jadi blok kode literal → sekarang embed,
//     markup sama dengan renderer (div.wb-yt-wrap + iframe; audio.wb-audio).
//  3. `- [x]` jadi teks literal (gomarkdown tidak kenal task list) → sekarang
//     checkbox disabled, markup sama dengan GFM di renderer.
//  4. Fragmen gambar #w=25|50|75 diabaikan → sekarang max-width:N%.

import (
	"fmt"
	"io"
	"net/url"
	"regexp"
	"strings"

	"github.com/gomarkdown/markdown/ast"
)

var (
	// Backreference tidak ada di regexp Go — tag penutup di-capture lalu
	// dibandingkan manual.
	mdBlockRe     = regexp.MustCompile(`(?is)^\s*<(p|h[1-3])\s+style="([^"<>]*)"\s*>(.*)</(p|h[1-3])>\s*$`)
	mdSpanOpenRe  = regexp.MustCompile(`(?i)^<span\s+style="([^"<>]*)"\s*>$`)
	mdSpanCloseRe = regexp.MustCompile(`(?i)^</span\s*>$`)
	// Tag blok bisa datang sebagai HTMLSpan: gomarkdown memecah
	// <p style=..>isi</p> satu baris jadi Paragraph[HTMLSpan, ...inline..., HTMLSpan].
	mdBlockOpenRe  = regexp.MustCompile(`(?i)^<(p|h[1-3])\s+style="([^"<>]*)"\s*>$`)
	mdBlockCloseRe = regexp.MustCompile(`(?i)^</(p|h[1-3])\s*>$`)
	// Tanpa `:` di charset nilai → url(javascript:...) mustahil terbentuk.
	mdStyleValRe = regexp.MustCompile(`^[A-Za-z0-9#,'().%\s-]+$`)
	mdForbidden  = regexp.MustCompile(`(?i)url\s*\(|expression\s*\(|javascript`)
	mdTaskRe     = regexp.MustCompile(`^\[( |x|X)\] `)
	mdSizeRe     = regexp.MustCompile(`^(.*?)#w=(\d+)$`)
)

var mdBlockProps = map[string]bool{"text-align": true}
var mdSpanProps = map[string]bool{"color": true, "font-family": true, "font-size": true}

func sanitizeMDStyle(raw string, allowed map[string]bool) string {
	var kept []string
	for _, decl := range strings.Split(raw, ";") {
		idx := strings.Index(decl, ":")
		if idx < 0 {
			continue
		}
		prop := strings.ToLower(strings.TrimSpace(decl[:idx]))
		val := strings.TrimSpace(decl[idx+1:])
		if !allowed[prop] || !mdStyleValRe.MatchString(val) || mdForbidden.MatchString(val) {
			continue
		}
		kept = append(kept, prop+": "+val)
	}
	return strings.Join(kept, "; ")
}

// exportMDHook — dipasang di RendererOptions.RenderNodeHook oleh renderMarkdown.
func exportMDHook(w io.Writer, node ast.Node, entering bool) (ast.WalkStatus, bool) {
	switch n := node.(type) {
	case *ast.HTMLBlock:
		if entering {
			w.Write([]byte(renderSafeHTMLBlock(string(n.Literal))))
		}
		return ast.GoToNext, true

	case *ast.HTMLSpan:
		if entering {
			w.Write([]byte(renderSafeHTMLSpan(string(n.Literal))))
		}
		return ast.GoToNext, true

	case *ast.Paragraph:
		// Paragraf yang seluruhnya terbungkus tag blok mentah (<p style=..> ...
		// </p>): tahan pembungkus <p> bawaan supaya tidak jadi <p><p style>.
		// Tag-nya sendiri dirender anak-anak HTMLSpan lewat case di atas.
		if paraIsRawWrapped(n) {
			return ast.GoToNext, true
		}
		return ast.GoToNext, false

	case *ast.CodeBlock:
		lang := strings.ToLower(strings.TrimSpace(string(n.Info)))
		if lang != "youtube" && lang != "audio" {
			return ast.GoToNext, false
		}
		if entering {
			w.Write([]byte(renderMediaFence(lang, strings.TrimSpace(string(n.Literal)))))
		}
		return ast.GoToNext, true

	case *ast.Text:
		// Task list: gomarkdown tidak mengenalnya, jadi "[x] " nempel di text
		// node pertama dalam <li>. Hanya node pertama itu yang diintervensi.
		if para, ok := node.GetParent().(*ast.Paragraph); ok {
			if _, ok := para.GetParent().(*ast.ListItem); ok {
				kids := para.GetChildren()
				if len(kids) > 0 && kids[0] == node {
					if m := mdTaskRe.FindStringSubmatch(string(n.Literal)); m != nil {
						if entering {
							checked := ""
							if m[1] == "x" || m[1] == "X" {
								checked = ` checked=""`
							}
							rest := strings.TrimPrefix(string(n.Literal), m[0])
							fmt.Fprintf(w, `<input%s disabled="" type="checkbox"> %s`, checked, esc(rest))
						}
						return ast.GoToNext, true
					}
				}
			}
		}
		return ast.GoToNext, false

	case *ast.Image:
		// Hanya ambil alih kalau ada fragmen ukuran yang valid; selain itu
		// biarkan renderer bawaan.
		src := string(n.Destination)
		clean, size := splitMDSizeFragment(src)
		if size == 0 || size == 100 {
			return ast.GoToNext, false
		}
		if entering {
			alt := collectAltText(n)
			fmt.Fprintf(w, `<img src="%s" alt="%s" style="max-width:%d%%; height:auto" loading="lazy" />`,
				escAttr(clean), escAttr(alt), size)
		}
		return ast.SkipChildren, true
	}
	return ast.GoToNext, false
}

func renderSafeHTMLBlock(raw string) string {
	m := mdBlockRe.FindStringSubmatch(raw)
	if m == nil || !strings.EqualFold(m[1], m[4]) {
		return "" // script/iframe/dll — buang, perilaku lama dipertahankan
	}
	tag := strings.ToLower(m[1])
	style := sanitizeMDStyle(m[2], mdBlockProps)
	// Isi blok masih markdown (hasil turndown). renderMarkdown rekursif —
	// HTML bersarang akan lewat hook ini lagi, jadi tetap tersaring.
	inner := strings.TrimSpace(renderMarkdown(m[3]))
	inner = strings.TrimPrefix(inner, "<p>")
	inner = strings.TrimSuffix(inner, "</p>")
	if style != "" {
		return fmt.Sprintf(`<%s style="%s">%s</%s>`, tag, style, inner, tag)
	}
	return fmt.Sprintf(`<%s>%s</%s>`, tag, inner, tag)
}

func renderSafeHTMLSpan(raw string) string {
	if m := mdSpanOpenRe.FindStringSubmatch(raw); m != nil {
		if style := sanitizeMDStyle(m[1], mdSpanProps); style != "" {
			return `<span style="` + style + `">`
		}
		// Style tak lolos → span polos supaya pasangan penutupnya tidak yatim.
		return "<span>"
	}
	if mdSpanCloseRe.MatchString(raw) {
		return "</span>"
	}
	if m := mdBlockOpenRe.FindStringSubmatch(raw); m != nil {
		tag := strings.ToLower(m[1])
		if style := sanitizeMDStyle(m[2], mdBlockProps); style != "" {
			return "<" + tag + ` style="` + style + `">`
		}
		return "<" + tag + ">"
	}
	if m := mdBlockCloseRe.FindStringSubmatch(raw); m != nil {
		return "</" + strings.ToLower(m[1]) + ">"
	}
	return ""
}

// paraIsRawWrapped — anak pertama & terakhir (mengabaikan Text kosong) adalah
// HTMLSpan pembuka & penutup tag blok yang sama.
func paraIsRawWrapped(p *ast.Paragraph) bool {
	var kids []ast.Node
	for _, c := range p.GetChildren() {
		if t, ok := c.(*ast.Text); ok && strings.TrimSpace(string(t.Literal)) == "" {
			continue
		}
		kids = append(kids, c)
	}
	if len(kids) < 2 {
		return false
	}
	first, ok1 := kids[0].(*ast.HTMLSpan)
	last, ok2 := kids[len(kids)-1].(*ast.HTMLSpan)
	if !ok1 || !ok2 {
		return false
	}
	mo := mdBlockOpenRe.FindStringSubmatch(string(first.Literal))
	mc := mdBlockCloseRe.FindStringSubmatch(string(last.Literal))
	return mo != nil && mc != nil && strings.EqualFold(mo[1], mc[1])
}

func renderMediaFence(lang, body string) string {
	if lang == "audio" {
		return `<audio class="wb-audio" controls preload="none" src="` + escAttr(body) + `"></audio>`
	}
	clean, size := splitMDSizeFragment(body)
	embed := youtubeEmbedURL(clean)
	if embed == "" {
		return `<p><em>Video URL tidak dikenali: ` + esc(clean) + `</em></p>`
	}
	wStyle := ""
	if size != 0 && size != 100 {
		wStyle = fmt.Sprintf(` style="max-width:%d%%"`, size)
	}
	return `<div class="wb-yt-wrap"` + wStyle + `><iframe src="` + escAttr(embed) +
		`" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
}

// splitMDSizeFragment — preset 25|50|75|100 seperti renderer; selain itu 0.
func splitMDSizeFragment(u string) (string, int) {
	m := mdSizeRe.FindStringSubmatch(u)
	if m == nil {
		return u, 0
	}
	switch m[2] {
	case "25":
		return m[1], 25
	case "50":
		return m[1], 50
	case "75":
		return m[1], 75
	case "100":
		return m[1], 100
	}
	return m[1], 0
}

func collectAltText(img *ast.Image) string {
	var sb strings.Builder
	for _, c := range img.GetChildren() {
		if t, ok := c.(*ast.Text); ok {
			sb.Write(t.Literal)
		}
	}
	return sb.String()
}

// youtubeEmbedURL — cermin extractYouTubeID di renderer lib/markdown.ts.
func youtubeEmbedURL(input string) string {
	s := strings.TrimSpace(input)
	if s == "" {
		return ""
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		if regexp.MustCompile(`^[A-Za-z0-9_-]{6,15}$`).MatchString(s) {
			return "https://www.youtube.com/embed/" + s
		}
		return ""
	}
	host := u.Hostname()
	if host == "youtu.be" {
		id := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")[0]
		if id != "" {
			return "https://www.youtube.com/embed/" + id
		}
		return ""
	}
	if strings.Contains(host, "youtube.com") {
		if v := u.Query().Get("v"); v != "" {
			return "https://www.youtube.com/embed/" + v
		}
		parts := strings.FieldsFunc(u.Path, func(r rune) bool { return r == '/' })
		if len(parts) >= 2 && (parts[0] == "embed" || parts[0] == "shorts") {
			return "https://www.youtube.com/embed/" + parts[1]
		}
	}
	return ""
}
