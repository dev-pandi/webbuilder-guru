import type { ThemeJson } from "./api";

// themeToCss — emit :root custom properties untuk semua var yang dibaca
// block renderer + GuruStyles. Guru template vars (--guru-navy, --guru-ink,
// dsb.) juga di-emit LANGSUNG di sini supaya ikut mengalir ke descendant
// tanpa bergantung ke indirection `var(--color-primary)` di GuruStyles yang
// kadang di-cache browser sebagai fallback value.
//
// Semua turunan `--guru-*` pakai color-mix() yang di-resolve ke static
// value di :root. Specificity: inline :root style di layout <head> menang
// atas apapun yang di-emit GuruStyles setelahnya (same selector, later wins
// per cascade — tapi karena nilainya DIRECT user color, bukan var() chain,
// resolution deterministic di semua browser).
// hexChannels — "#rrggbb"/"#rgb" → "R G B" untuk pola Tailwind
// `rgb(var(--x-rgb) / <alpha-value>)`. Warna non-hex (mis. nama CSS) tidak
// bisa dipecah kanal → pakai fallback supaya var tetap valid.
function hexChannels(hex: string, fallback: string): string {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function themeToCss(theme: ThemeJson | null): string {
  const c = theme?.colors ?? {};
  const f = theme?.font ?? {};
  const primary = c.primary ?? "#2563eb";
  const secondary = c.secondary ?? "#0ea5e9";
  const bg = c.bg ?? "#ffffff";
  const fg = c.fg ?? "#0f172a";
  return `
    :root {
      --color-primary: ${primary};
      --color-secondary: ${secondary};
      --color-bg: ${bg};
      --color-fg: ${fg};
      /* Kanal RGB untuk token Tailwind (foreground/background/primary) —
         tanpa ini kelas seperti bg-foreground/10 tidak bisa diberi alpha. */
      --color-primary-rgb: ${hexChannels(primary, "37 99 235")};
      --color-bg-rgb: ${hexChannels(bg, "255 255 255")};
      --color-fg-rgb: ${hexChannels(fg, "15 23 42")};
      --radius: ${theme?.radius ?? "0.75rem"};
      --font-heading: "${f.heading ?? "Inter"}", system-ui, sans-serif;
      --font-body: "${f.body ?? "Inter"}", system-ui, sans-serif;

      /* Guru template vars — direct derivation dari user theme supaya
         deterministic di semua browser (bypass var() chain yang kadang
         ke-cache sebagai fallback di Chromium). */
      --guru-navy: ${primary};
      --guru-ink: ${fg};
      --guru-cream: ${bg};
      --guru-red: ${secondary};
      --guru-navy-2: color-mix(in srgb, ${primary} 70%, #ffffff);
      --guru-muted: color-mix(in srgb, ${fg} 55%, ${bg});
      --guru-paper: color-mix(in srgb, ${bg} 30%, #ffffff);
      --guru-line: color-mix(in srgb, ${fg} 10%, ${bg});
      --guru-red-soft: color-mix(in srgb, ${secondary} 15%, ${bg});
      --guru-blue-soft: color-mix(in srgb, ${primary} 10%, ${bg});
      --guru-sage: color-mix(in srgb, ${primary} 6%, ${bg});
      --guru-gold: color-mix(in srgb, ${secondary} 60%, #d6a84d);
      --guru-shadow: 0 20px 60px color-mix(in srgb, ${primary} 20%, transparent);
      --guru-shadow-sm: 0 10px 30px color-mix(in srgb, ${primary} 15%, transparent);
    }
  `;
}

export function googleFontsUrl(theme: ThemeJson | null): string | null {
  const fams = new Set<string>();
  const h = theme?.font?.heading;
  const b = theme?.font?.body;
  if (h) fams.add(h);
  if (b) fams.add(b);
  if (fams.size === 0) return null;
  // Encode first, then turn spaces into "+": encoding "+" yields "%2B", which
  // Google rejects with 400 and takes every family in the request down with it.
  const families = [...fams]
    .map((f) => `family=${encodeURIComponent(f.trim()).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
