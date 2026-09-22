#!/bin/bash
# generate-pdf-guru.sh — Generate PDF khusus untuk guru/klien saja.
# Bundle: 00-pengantar (ringkas) + 60-panduan-client-guru (end-to-end
# daftar → login → beli domain → editor + Rich Editor fitur baru).
#
# Output: panduan-rumah-digital-guru.pdf (siap kirim ke guru sebagai
# starter guide, tidak include chapter admin/reseller/agent).
#
# Usage:
#   ./generate-pdf-guru.sh
#
# Prasyarat sama dengan generate-pdf-chrome.sh (Chrome/Chromium tersedia +
# python3 + markdown pip package).

set -euo pipefail
cd "$(dirname "$0")"

# ---------- Detect browser ----------
BROWSER=""
if [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
  BROWSER="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ]; then
  BROWSER="/Applications/Chromium.app/Contents/MacOS/Chromium"
elif [ -x "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" ]; then
  BROWSER="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
elif command -v google-chrome >/dev/null 2>&1; then
  BROWSER="google-chrome"
elif command -v chromium >/dev/null 2>&1; then
  BROWSER="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
  BROWSER="chromium-browser"
fi

if [ -z "$BROWSER" ]; then
  echo "❌ Chrome/Chromium/Edge tidak ditemukan. Install salah satu:"
  echo "     macOS:  brew install --cask google-chrome"
  echo "     Linux:  sudo apt install chromium-browser"
  exit 1
fi

echo "→ Browser: $BROWSER"

# ---------- Cek python + markdown ----------
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 tidak ditemukan."
  exit 1
fi
if ! python3 -c "import markdown" 2>/dev/null; then
  echo "❌ Python markdown package belum terinstall. Install:"
  echo "     pip install markdown pygments"
  exit 1
fi

# ---------- Generate HTML guru-only ----------
OUT_HTML="panduan-rumah-digital-guru.html"
OUT_PDF="panduan-rumah-digital-guru.pdf"

echo "→ Convert markdown → HTML (guru bundle)..."

cat > "$OUT_HTML" <<'HEAD_EOF'
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Panduan Klien — Rumah Digital Guru</title>
<style>
  @page { margin: 2cm 1.8cm; size: A4; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    line-height: 1.6;
    color: #172033;
    max-width: 780px;
    margin: 2rem auto;
    padding: 0 1.5rem;
  }
  h1 {
    font-family: Georgia, serif;
    color: #172033;
    border-bottom: 3px solid #d73f45;
    padding-bottom: .5rem;
    margin-top: 2.5rem;
    font-size: 1.9rem;
    page-break-before: always;
  }
  h1:first-of-type { page-break-before: auto; margin-top: 0; }
  h2 {
    font-family: Georgia, serif;
    color: #285f9e;
    margin-top: 2rem;
    font-size: 1.35rem;
  }
  h3 { color: #172033; margin-top: 1.5rem; font-size: 1.1rem; }
  code {
    background: #f4f7fb;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: "SF Mono", Consolas, Menlo, monospace;
  }
  pre {
    background: #172033;
    color: #f4f7fb;
    padding: 1em 1.2em;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.85em;
    line-height: 1.5;
  }
  pre code { background: none; color: inherit; padding: 0; }
  a { color: #285f9e; text-decoration: none; }
  a:hover { text-decoration: underline; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95em; }
  th, td { border: 1px solid #e6e9ef; padding: .6em .8em; text-align: left; vertical-align: top; }
  th { background: #fbfaf7; font-weight: 700; }
  blockquote {
    border-left: 3px solid #d73f45;
    padding: .1em 0 .1em 1.2em;
    margin: 1.4em 0;
    color: #4c5b70;
    font-style: italic;
  }
  ul, ol { margin: .5em 0 1em; padding-left: 1.5em; }
  li { margin: .25em 0; }
  img {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 1.4em auto;
    border: 1px solid #e6e9ef;
  }
  hr {
    border: none;
    border-top: 1px solid #e6e9ef;
    margin: 2em 0;
  }
  .cover {
    text-align: center;
    padding: 4rem 0 6rem;
    page-break-after: always;
  }
  .cover h1 {
    border: none;
    page-break-before: auto;
    font-size: 2.6rem;
    margin: 1rem 0;
  }
  .cover p { color: #4c5b70; font-size: 1.1rem; }
  .cover .brand {
    display: inline-block;
    font-size: .9rem;
    letter-spacing: .15em;
    text-transform: uppercase;
    color: #d73f45;
    font-weight: 700;
    margin-bottom: 1rem;
  }
</style>
</head>
<body>

<div class="cover">
  <div class="brand">PANDI × UPI</div>
  <h1>Panduan Klien<br>Rumah Digital Guru</h1>
  <p>Panduan lengkap dari daftar akun hingga publikasi konten<br>
     untuk guru pengguna template Rumah Digital Guru</p>
  <p style="margin-top: 3rem; font-size: .9rem;">Web Builder Team · 2026</p>
</div>

HEAD_EOF

# Convert markdown files ke HTML. Include cuma bab yang relevan buat guru.
# Pakai `00-pengantar-guru.md` (bukan `00-pengantar.md`) supaya bundle
# tidak mention role reseller/admin/agent yang tidak relevan buat guru.
FILES=(
  "00-pengantar-guru.md"
  "60-panduan-client-guru.md"
)

for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "  ! Skip $f (tidak ditemukan)"
    continue
  fi
  echo "  · $f"
  python3 -m markdown -x fenced_code -x tables -x toc "$f" >> "$OUT_HTML"
done

cat >> "$OUT_HTML" <<'FOOT_EOF'
<footer style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #e6e9ef; font-size: 0.85em; color: #9ca3af; text-align: center;">
  <p>Rumah Digital Guru — Panduan Klien · Generated dari Markdown</p>
  <p>Update terbaru: <code>docs/user-guide/60-panduan-client-guru.md</code></p>
</footer>
</body>
</html>
FOOT_EOF

# ---------- Convert HTML → PDF ----------
echo "→ Convert HTML → PDF via Chrome headless..."

"$BROWSER" \
  --headless \
  --disable-gpu \
  --no-sandbox \
  --run-all-compositor-stages-before-draw \
  --virtual-time-budget=10000 \
  --print-to-pdf="$OUT_PDF" \
  --print-to-pdf-no-header \
  "file://$(pwd)/$OUT_HTML" 2>&1 | grep -Ev "^\[|DevTools|Fontconfig|Chrome is being" || true

if [ -f "$OUT_PDF" ]; then
  SIZE=$(du -h "$OUT_PDF" | cut -f1)
  echo ""
  echo "✓ Bundle siap: $OUT_PDF ($SIZE)"
  echo "  HTML source: $OUT_HTML"
  echo ""
  echo "  Kirim PDF ini ke guru sebagai starter guide."
else
  echo "✗ Generate PDF gagal — cek log di atas"
  exit 1
fi
