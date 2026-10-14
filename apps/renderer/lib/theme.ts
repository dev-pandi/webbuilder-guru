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
  const families = [...fams]
    .map((f) => `family=${encodeURIComponent(f.replace(/ /g, "+"))}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
