package exports

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func renderOne(t *testing.T, typ string, props map[string]any) string {
	t.Helper()
	var b strings.Builder
	if !renderExtraBlock(&b, Block{Type: typ, Props: props}) {
		t.Fatalf("%s: renderExtraBlock balik false", typ)
	}
	return b.String()
}

func TestRenderExtraBlock(t *testing.T) {
	cases := []struct {
		typ   string
		props map[string]any
		want  []string
	}{
		{"Spacer", map[string]any{"size": float64(120)}, []string{`height:120px`}},
		{"Divider", map[string]any{"label": "Bagian <b>2</b>"}, []string{"wb-divider--labeled", "Bagian &lt;b&gt;2&lt;/b&gt;"}},
		{"Banner", map[string]any{"text": "Promo", "ctaLabel": "Lihat", "ctaHref": "/promo"}, []string{"wb-banner", `href="/promo"`, "Lihat"}},
		{"Quote", map[string]any{"text": "Kutipan", "author": "Bu Ani", "role": "Guru"}, []string{"<blockquote>Kutipan</blockquote>", "Bu Ani", "wb-quote-role"}},
		{"Alert", map[string]any{"variant": "warning", "title": "Awas", "body": "Hati-hati"}, []string{"wb-alert--warning", "Awas", "Hati-hati"}},
		{"Alert", map[string]any{"variant": "evil\" onload=\"x"}, []string{"wb-alert--info"}},
		{"StatsBar", map[string]any{"items": []any{map[string]any{"value": "120+", "label": "Murid"}}}, []string{"wb-statsbar-value", "120+", "Murid"}},
		{"StatsCard", map[string]any{"value": "98%", "label": "Lulus", "desc": "Angka kelulusan"}, []string{"wb-statscard-value", "98%", "Angka kelulusan"}},
		{"VideoEmbed", map[string]any{"title": "Profil", "src": "https://www.youtube.com/embed/x"}, []string{"wb-embed-frame", `src="https://www.youtube.com/embed/x"`}},
		{"LogoCloud", map[string]any{"title": "Mitra", "items": []any{map[string]any{"name": "PANDI"}, map[string]any{"name": "UPI", "image": "https://x/l.png"}}}, []string{"Mitra", "<span>PANDI</span>", `img src="https://x/l.png"`}},
		{"Tabs", map[string]any{"items": []any{map[string]any{"label": "Satu", "body": "Isi 1"}, map[string]any{"label": "Dua", "body": "Isi 2"}}}, []string{"wb-tab-input", ` checked>`, "Satu", "Isi 2"}},
		{"TestimonialCard", map[string]any{"quote": "Bagus", "name": "Pak Budi", "rating": float64(4)}, []string{"wb-tcard-stars", "wb-star--off", "Pak Budi"}},
		{"TestimonialMarquee", map[string]any{"title": "Kata Mereka", "items": []any{map[string]any{"name": "Ani", "text": "Mantap"}}}, []string{"wb-marquee-mask", "Mantap"}},
		{"PricingTable", map[string]any{"title": "Paket", "items": []any{map[string]any{"title": "Pro", "price": "Rp 50rb", "featured": "yes", "features": "A\nB"}}}, []string{"wb-plan--featured", "Populer", "<li><span class=\"wb-plan-check\">✓</span>A</li>"}},
		{"HeroSpotlight", map[string]any{"eyebrow": "Baru", "title": "Judul", "ctaLabel": "Mulai"}, []string{"wb-spotlight-anim", "wb-eyebrow", "<h1>Judul</h1>", "Mulai →"}},
		{"HeroSplit", map[string]any{"title": "Split", "reversed": "yes", "image": "https://x/h.png"}, []string{"wb-herosplit--reversed", `src="https://x/h.png"`}},
		{"FeatureSide", map[string]any{"items": []any{map[string]any{"title": "F1", "desc": "D1"}, map[string]any{"title": "F2", "desc": "D2"}}}, []string{"wb-featureside-row--reversed", "F1", "D2", "wb-media-placeholder"}},
	}
	for _, tc := range cases {
		t.Run(tc.typ, func(t *testing.T) {
			out := renderOne(t, tc.typ, tc.props)
			for _, w := range tc.want {
				if !strings.Contains(out, w) {
					t.Errorf("hilang %q\noutput: %s", w, out)
				}
			}
		})
	}
}

// GuruPlus belum diport — harus tetap jatuh ke marker (dipindai jadi
// PERINGATAN.txt), bukan diam-diam dirender setengah jadi.
func TestRenderExtraBlock_GuruPlusStillFallsThrough(t *testing.T) {
	var b strings.Builder
	if renderExtraBlock(&b, Block{Type: "GuruPlusFAQ", Props: map[string]any{}}) {
		t.Fatal("GuruPlusFAQ tidak boleh ditangani renderExtraBlock")
	}
}

// Tiap kelas wb-* yang dipakai markup baru harus punya aturan di extraCSS
// (atau CSS export lain) — mencegah kelas yatim seperti temuan audit.
func TestRenderExtraBlock_AllClassesStyled(t *testing.T) {
	var b strings.Builder
	sample := []Block{
		{Type: "Divider", Props: map[string]any{"label": "x"}},
		{Type: "Banner", Props: map[string]any{"text": "x", "ctaLabel": "y"}},
		{Type: "Quote", Props: map[string]any{"text": "x", "author": "a", "role": "r"}},
		{Type: "Alert", Props: map[string]any{"title": "t", "body": "b"}},
		{Type: "StatsBar", Props: map[string]any{"items": []any{map[string]any{"value": "1", "label": "l"}}}},
		{Type: "StatsCard", Props: map[string]any{"value": "1", "label": "l", "desc": "d"}},
		{Type: "VideoEmbed", Props: map[string]any{"title": "t", "src": "s"}},
		{Type: "LogoCloud", Props: map[string]any{"title": "t", "items": []any{map[string]any{"name": "n"}}}},
		{Type: "Tabs", Props: map[string]any{"items": []any{map[string]any{"label": "a", "body": "b"}}}},
		{Type: "TestimonialCard", Props: map[string]any{"quote": "q", "name": "n", "role": "r", "rating": float64(3)}},
		{Type: "TestimonialMarquee", Props: map[string]any{"title": "t", "items": []any{map[string]any{"name": "n", "text": "x"}}}},
		{Type: "PricingTable", Props: map[string]any{"title": "t", "subtitle": "s", "items": []any{map[string]any{"title": "p", "price": "1", "period": "/bln", "desc": "d", "features": "f", "ctaLabel": "c", "featured": "yes"}}}},
		{Type: "HeroSpotlight", Props: map[string]any{"eyebrow": "e", "title": "t", "subtitle": "s", "ctaLabel": "c", "ctaSecondaryLabel": "c2"}},
		{Type: "HeroSplit", Props: map[string]any{"title": "t", "reversed": "yes"}},
		{Type: "FeatureSide", Props: map[string]any{"items": []any{map[string]any{"title": "a", "desc": "b"}, map[string]any{"title": "c", "desc": "d"}}}},
	}
	for _, blk := range sample {
		renderExtraBlock(&b, blk)
	}
	// buildCSS(nil) = stylesheet lengkap dengan tema default — termasuk
	// kelas dasar seperti wb-btn yang tidak tinggal di konstanta per-keluarga.
	allCSS := buildCSS(nil)
	for _, cls := range regexp.MustCompile(`class="([^"]+)"`).FindAllStringSubmatch(b.String(), -1) {
		for _, c := range strings.Fields(cls[1]) {
			if !strings.HasPrefix(c, "wb-") {
				continue
			}
			if !strings.Contains(allCSS, "."+c) {
				t.Errorf("kelas %q dipakai markup tapi tidak ada aturan CSS-nya", c)
			}
		}
	}
}

// Penjaga parity lintas-sisi: setiap tipe blok yang dirender preview editor
// (apps/web) harus punya renderer export — kecuali keluarga GuruPlus.
// KEPUTUSAN (2026-11-06): GuruPlus TIDAK akan diport ke export; blok itu
// interaktif dan hanya hidup di situs live. Export melaporkannya lewat
// PERINGATAN.txt. Jangan "memperbaiki" ini tanpa keputusan produk baru.
// Audit 2026-11-05 menemukan 37 tipe hilang senyap; test ini mencegah
// kambuh saat blok baru ditambahkan di editor tanpa port ke exporter.
func TestRenderBlock_CoversEditorPreviewBlocks(t *testing.T) {
	src, err := os.ReadFile("../../../web/app/sites/[id]/editor/page.tsx")
	if err != nil {
		t.Skipf("editor preview tidak ada di checkout ini: %v", err)
	}
	typeRe := regexp.MustCompile(`case "([A-Za-z0-9_]+)"`)
	seen := map[string]bool{}
	for _, m := range typeRe.FindAllStringSubmatch(string(src), -1) {
		seen[m[1]] = true
	}
	if len(seen) < 50 {
		t.Fatalf("hanya %d tipe terbaca — struktur editor berubah?", len(seen))
	}
	for typ := range seen {
		if strings.HasPrefix(typ, "GuruPlus") {
			continue // keputusan produk: live-only, masuk PERINGATAN.txt
		}
		var b strings.Builder
		renderBlock(&b, Block{Type: typ, Props: map[string]any{}}, &siteData{guru: &guruData{}})
		if strings.Contains(b.String(), "<!-- block:"+typ) {
			t.Errorf("blok %q dirender editor tapi tidak punya renderer export", typ)
		}
	}
}
