// markdown — shared marked configuration untuk renderer publik.
// Drop raw HTML (XSS safety). Custom code renderer detect fence bahasa
// `youtube` / `audio` → render iframe/<audio> tag yang kita generate
// sendiri. Format ini di-produksi editor (apps/web/components/RichEditor.tsx)
// saat user sisipkan video YouTube atau audio dari asset library.
//
// Extended image syntax: URL fragment `#w=25|50|75|100` set width (%).
// Contoh: `![alt](https://.../pic.jpg#w=50)` → <img style="max-width:50%">.

import { marked, type Tokens } from "marked";

// Preset ukuran yang di-honor. Nilai lain di-ignore (render full-width).
const VALID_SIZES = new Set([25, 50, 75, 100]);

function splitSizeFragment(url: string): [string, number | null] {
  const m = url.match(/^(.*?)#w=(\d+)$/);
  if (!m) return [url, null];
  const w = parseInt(m[2], 10);
  if (VALID_SIZES.has(w)) return [m[1], w];
  return [m[1], null];
}

marked.setOptions({ gfm: true, breaks: false });
marked.use({
  // WAJIB — supaya marked TIDAK auto-convert renderer ke old positional
  // signature. Tanpa flag ini `token.href` / `token.text` / `token.lang`
  // undefined di handler custom kita → image + fence youtube/audio silent
  // hilang saat marked.parse.
  useNewRenderer: true,
  renderer: {
    html: () => "",
    image(this: unknown, token: Tokens.Image) {
      const src = token.href ?? "";
      const [, size] = splitSizeFragment(src);
      const alt = escapeHTML(token.text ?? "");
      const title = token.title ? ` title="${escapeHTML(token.title)}"` : "";
      const style =
        size && size !== 100 ? ` style="max-width:${size}%; height:auto"` : "";
      // src disimpan apa adanya termasuk fragment — browser ignore fragment
      // pada img src. Kalau ingin bersih, ganti pakai cleanURL.
      return `<img src="${escapeHTML(src)}" alt="${alt}"${title}${style} loading="lazy">`;
    },
    code(this: unknown, token: Tokens.Code) {
      const lang = (token.lang ?? "").trim().toLowerCase();
      const raw = (token.text ?? "").trim();
      if (lang === "youtube") {
        const [cleanURL, size] = splitSizeFragment(raw);
        const embed = youtubeEmbedURL(cleanURL);
        if (!embed) {
          return `<p><em>Video URL tidak dikenali: ${escapeHTML(cleanURL)}</em></p>`;
        }
        const wStyle =
          size && size !== 100 ? ` style="max-width:${size}%"` : "";
        return `<div class="wb-yt-wrap"${wStyle}><iframe src="${escapeHTML(embed)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
      }
      if (lang === "audio") {
        return `<audio class="wb-audio" controls preload="none" src="${escapeHTML(raw)}"></audio>`;
      }
      // Default fenced code renderer.
      const escaped = escapeHTML(token.text ?? "");
      return `<pre><code${lang ? ` class="language-${escapeHTML(lang)}"` : ""}>${escaped}</code></pre>`;
    },
  },
});

export { marked };

// --- helpers ---

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function youtubeEmbedURL(input: string): string | null {
  const id = extractYouTubeID(input);
  if (!id) return null;
  return `https://www.youtube.com/embed/${id}`;
}

function extractYouTubeID(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if ((parts[0] === "embed" || parts[0] === "shorts") && parts[1]) return parts[1];
    }
  } catch {
    if (/^[A-Za-z0-9_-]{6,15}$/.test(s)) return s;
  }
  return null;
}
