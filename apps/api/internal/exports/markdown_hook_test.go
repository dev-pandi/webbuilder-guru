package exports

import (
	"strings"
	"testing"
)

// Fidelitas: bentuk persis yang disimpan RichEditor harus sampai ke export.
func TestRenderMarkdown_PreservesEditorStyling(t *testing.T) {
	cases := []struct {
		name string
		md   string
		want []string
		deny []string
	}{
		{
			name: "paragraf rata tengah: teks selamat, markdown dalamnya di-parse",
			md:   `<p style="text-align: center">Pengumuman **penting** dan <span style="color: rgb(255, 0, 0)">merah</span></p>`,
			want: []string{
				`<p style="text-align: center">`,
				`<strong>penting</strong>`,
				`<span style="color: rgb(255, 0, 0)">merah</span>`,
			},
			deny: []string{"**"},
		},
		{
			// turndown meng-emit blok rata tengah diapit baris kosong — jalur
			// parse-nya bisa berbeda dari varian satu baris, kunci keduanya.
			name: "paragraf rata tengah diapit baris kosong",
			md:   "Sebelum.\n\n<p style=\"text-align: center\">Tengah **tebal**</p>\n\nSesudah.",
			want: []string{
				`<p style="text-align: center">`,
				`<strong>tebal</strong>`,
				`<p>Sebelum.</p>`,
				`<p>Sesudah.</p>`,
			},
			deny: []string{"**"},
		},
		{
			name: "heading rata tengah",
			md:   `<h2 style="text-align: center">Judul Tengah</h2>`,
			want: []string{`<h2 style="text-align: center">Judul Tengah</h2>`},
		},
		{
			name: "span ukuran + font di paragraf biasa",
			md:   `Kata <span style="font-size: 24px">besar</span> dan <span style="font-family: Georgia, 'Times New Roman', serif">serif</span>.`,
			want: []string{
				`<span style="font-size: 24px">besar</span>`,
				`<span style="font-family: Georgia, 'Times New Roman', serif">serif</span>`,
			},
		},
		{
			name: "fence youtube jadi embed, bukan blok kode",
			md:   "```youtube\nhttps://youtu.be/abc123\n```",
			want: []string{`class="wb-yt-wrap"`, `src="https://www.youtube.com/embed/abc123"`},
			deny: []string{"language-youtube", "<code"},
		},
		{
			name: "fence audio jadi player",
			md:   "```audio\nhttps://cdn.example/a.mp3\n```",
			want: []string{`<audio class="wb-audio"`, `src="https://cdn.example/a.mp3"`},
			deny: []string{"<code"},
		},
		{
			name: "task list jadi checkbox, bukan teks [x]",
			md:   "- [x] selesai\n- [ ] belum\n",
			want: []string{`checked="" disabled="" type="checkbox"> selesai`, `<input disabled="" type="checkbox"> belum`},
			deny: []string{"[x]", "[ ]"},
		},
		{
			name: "gambar #w=50 dapat max-width, fragmen dibuang dari src",
			md:   `![foto](https://cdn.example/img.png#w=50)`,
			want: []string{`src="https://cdn.example/img.png"`, `max-width:50%`},
			deny: []string{"#w=50"},
		},
		{
			name: "fence kode biasa tidak tersentuh",
			md:   "```go\nfmt.Println(1)\n```",
			want: []string{`<code class="language-go">`},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out := renderMarkdown(tc.md)
			for _, w := range tc.want {
				if !strings.Contains(out, w) {
					t.Errorf("hilang %q\noutput: %s", w, out)
				}
			}
			for _, d := range tc.deny {
				if strings.Contains(out, d) {
					t.Errorf("tidak boleh ada %q\noutput: %s", d, out)
				}
			}
		})
	}
}

// Keamanan: SkipHTML dilepas, jadi whitelist-lah yang memikul jaminan XSS.
func TestRenderMarkdown_StillBlocksXSS(t *testing.T) {
	payloads := []struct {
		name, md string
		deny     []string
	}{
		{"script block", "<script>alert(1)</script>", []string{"<script"}},
		{"iframe mentah", `<iframe src="https://evil.example"></iframe>`, []string{"<iframe"}},
		{"atribut event di p", `<p style="text-align: center" onclick="alert(1)">x</p>`, []string{"onclick", "<p style"}},
		{"atribut event di span", `a <span style="color: red" onmouseover="alert(1)">b</span> c`, []string{"onmouseover"}},
		{"img onerror mentah", `<img src="x" onerror="alert(1)">`, []string{"onerror", "<img"}},
		{"css expression", `<p style="text-align:expression(alert(1))">x</p>`, []string{"expression"}},
		{"css url", `a <span style="color: url(javascript:alert(1))">b</span>`, []string{"url(", "javascript"}},
		{"properti di luar whitelist", `a <span style="position: fixed; color: red">b</span>`, []string{"position"}},
		{"script bersarang di blok rata tengah", `<p style="text-align: center"><script>alert(1)</script>aman</p>`, []string{"<script"}},
		{"tag selain whitelist", `<details open ontoggle=alert(1)>x</details>`, []string{"<details", "ontoggle"}},
	}
	for _, tc := range payloads {
		t.Run(tc.name, func(t *testing.T) {
			out := renderMarkdown(tc.md)
			for _, d := range tc.deny {
				if strings.Contains(out, d) {
					t.Errorf("payload lolos: %q\noutput: %s", d, out)
				}
			}
		})
	}
}
