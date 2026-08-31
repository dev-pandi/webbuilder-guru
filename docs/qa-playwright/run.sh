#!/bin/bash
# run.sh — helper untuk quick run + auto-open Excel report.
#
# Usage:
#   ./run.sh              # run semua test
#   ./run.sh admin        # run cuma admin
#   ./run.sh admin client # run 2 role
#   ./run.sh --headed     # tampilkan browser (debug)

set -euo pipefail
cd "$(dirname "$0")"

# Install browsers kalau belum ada
if ! [ -d "$HOME/Library/Caches/ms-playwright/chromium"* ] 2>/dev/null &&
   ! [ -d "$HOME/.cache/ms-playwright/chromium"* ] 2>/dev/null; then
  echo "→ Chromium belum ter-install, installing..."
  npx playwright install chromium 2>&1 | tail -3
fi

# Filter test dari argument
FILTER=""
HEADED=""
for arg in "$@"; do
  case "$arg" in
    --headed)
      HEADED="--headed"
      ;;
    client|agent|reseller|admin|auth)
      FILTER="$FILTER tests/*${arg}*"
      ;;
    *)
      FILTER="$FILTER $arg"
      ;;
  esac
done

echo ""
echo "🧪 Running Playwright QA tests..."
echo ""

# Run tests via npx
npx playwright test $FILTER $HEADED || true

# Auto-open Excel report kalau ada (macOS)
LATEST_XLSX="results/qa-report-latest.xlsx"
if [ -f "$LATEST_XLSX" ]; then
  echo "✓ Excel report: $LATEST_XLSX"
  if command -v open >/dev/null 2>&1; then
    echo "→ Membuka Excel..."
    open "$LATEST_XLSX" || true
  fi
fi
