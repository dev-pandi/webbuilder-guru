#!/bin/bash
# regen-guru-screenshots.sh — one-shot regenerate semua screenshot yang
# dipakai bundle guru (client + guru role dari capture config).
#
# Usage:
#   ./regen-guru-screenshots.sh
#
# Prasyarat:
#   - Playwright + browsers sudah installed di capture-screenshots/
#   - .env sudah di-set (BASE_URL, CLIENT_EMAIL, CLIENT_PASSWORD,
#     ADMIN_EMAIL, ADMIN_PASSWORD, SAMPLE_SITE_ID kalau perlu pin ke site tertentu)
#   - Sample site dengan template `guru-pandi-upi` sudah ada di akun client
#     (idealnya sudah punya beberapa artikel + materi supaya list-list tidak kosong)

set -euo pipefail
cd "$(dirname "$0")"

CAP_DIR="capture-screenshots"

if [ ! -d "$CAP_DIR" ]; then
  echo "❌ Folder $CAP_DIR tidak ditemukan"
  exit 1
fi

if [ ! -f "$CAP_DIR/node_modules/.package-lock.json" ] && [ ! -d "$CAP_DIR/node_modules/@playwright" ]; then
  echo "→ Install dependencies capture-screenshots (sekali saja)..."
  (cd "$CAP_DIR" && npm install)
fi

if [ ! -f "$CAP_DIR/.env" ]; then
  echo "⚠  File $CAP_DIR/.env belum dibuat. Copy dari .env.example:"
  echo "     cp $CAP_DIR/.env.example $CAP_DIR/.env"
  echo "     # lalu edit isi BASE_URL, CLIENT_EMAIL, dst."
  exit 1
fi

echo "→ Capture semua screenshot untuk bundle guru (client + guru role)..."
echo "   Output: docs/user-guide/screenshots/"
echo ""

# Client role — cover semua editor + Rich Editor screenshots (fitur Q1 2026)
# Guru role — cover semua per-site guru screenshots (tulisan, forum, dsb)
# WAJIB pakai --env-file supaya .env (BASE_URL, credentials, SAMPLE_SITE_ID)
# ke-load. Tanpa flag ini, capture jalan dengan default localhost:3000.
(cd "$CAP_DIR" && node --env-file=.env capture.mjs client guru)

echo ""
echo "✓ Screenshot ter-regenerate. Cek folder screenshots/ untuk hasilnya."
echo ""
echo "  Selanjutnya:"
echo "    ./generate-pdf-guru.sh    # regenerate PDF dengan screenshot baru"
