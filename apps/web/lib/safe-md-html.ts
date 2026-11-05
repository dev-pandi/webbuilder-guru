// safe-md-html — render HTML mentah dari markdown secara whitelist, bukan
// buang total. RichEditor menyimpan perataan + styling sebagai HTML mentah:
//
//   <p style="text-align: center">Pengumuman **penting**</p>
//   <span style="color: rgb(255, 0, 0)">merah</span>
//
// Dua masalah kalau token html dibuang bulat-bulat (perilaku lama):
//   1. Token html level BLOK membawa seluruh isinya — paragraf rata tengah
//      lenyap BESERTA teksnya di situs publik.
//   2. Isi blok itu masih markdown mentah (turndown mengkonversi anak-anaknya
//      lebih dulu), jadi pass-through pun salah: `**penting**` tampil literal.
//
// Solusi: kenali bentuk persis yang di-emit RichEditor (p/h1-h3 dengan
// text-align; span dengan color/font-family/font-size), parse ulang isinya
// sebagai inline markdown, dan tolak selain itu. Nilai style dibatasi charset
// tanpa titik dua/kutip-ganda/kurung-sudut sehingga url(javascript:...) dan
// sejenisnya tidak mungkin lolos.
//
// SINKRON: file ini ada di apps/renderer/lib dan apps/web/lib — harus
// byte-identik. Grammar yang sama juga ditegakkan exporter Go
// (apps/api/internal/exports/render.go::sanitizeRawHTML). Ubah satu = ubah
// semuanya.

const BLOCK_RE = /^\s*<(p|h[1-3])\s+style="([^"<>]*)"\s*>([\s\S]*)<\/\1>\s*$/i;
const SPAN_OPEN_RE = /^<span\s+style="([^"<>]*)"\s*>$/i;
const SPAN_CLOSE_RE = /^<\/span\s*>$/i;

const BLOCK_PROPS = new Set(["text-align"]);
const SPAN_PROPS = new Set(["color", "font-family", "font-size"]);

// Nilai: huruf/angka/spasi + # , ' ( ) . % - — tanpa `:` berarti tidak ada
// skema URL yang bisa diselundupkan lewat url(...).
const VALUE_RE = /^[A-Za-z0-9#,'().%\s-]+$/;
const FORBIDDEN = /url\s*\(|expression\s*\(|javascript/i;

export function sanitizeStyle(raw: string, allowed: Set<string>): string {
  const kept: string[] = [];
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!allowed.has(prop)) continue;
    if (!VALUE_RE.test(value) || FORBIDDEN.test(value)) continue;
    kept.push(`${prop}: ${value}`);
  }
  return kept.join("; ");
}

// makeSafeHtmlRenderer — handler untuk renderer.html milik marked.
// parseInline di-inject (bukan import marked di sini) supaya helper ini tidak
// peduli instance marked mana yang dipakai pemanggil.
export function makeSafeHtmlRenderer(parseInline: (src: string) => string) {
  return function safeHtml(raw: string): string {
    const block = raw.match(BLOCK_RE);
    if (block) {
      const tag = block[1].toLowerCase();
      const style = sanitizeStyle(block[2], BLOCK_PROPS);
      // Isi blok masih markdown — parse ulang. <span> di dalamnya muncul
      // sebagai token html inline dan lewat handler ini lagi.
      const inner = parseInline(block[3]);
      return style
        ? `<${tag} style="${style}">${inner}</${tag}>`
        : `<${tag}>${inner}</${tag}>`;
    }

    const open = raw.match(SPAN_OPEN_RE);
    if (open) {
      const style = sanitizeStyle(open[1], SPAN_PROPS);
      // Style tak lolos → tetap emit <span> polos supaya pasangan
      // </span>-nya tidak jadi yatim.
      return style ? `<span style="${style}">` : "<span>";
    }
    if (SPAN_CLOSE_RE.test(raw)) return "</span>";

    // Selain bentuk di atas (script, iframe, handler on*, dst.) dibuang.
    return "";
  };
}
