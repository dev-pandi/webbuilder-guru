import type { ThemeJson } from "./api";

export function themeToCss(theme: ThemeJson | null): string {
  const c = theme?.colors ?? {};
  const f = theme?.font ?? {};
  return `
    :root {
      --color-primary: ${c.primary ?? "#2563eb"};
      --color-secondary: ${c.secondary ?? "#0ea5e9"};
      --color-bg: ${c.bg ?? "#ffffff"};
      --color-fg: ${c.fg ?? "#0f172a"};
      --radius: ${theme?.radius ?? "0.75rem"};
      --font-heading: "${f.heading ?? "Inter"}", system-ui, sans-serif;
      --font-body: "${f.body ?? "Inter"}", system-ui, sans-serif;
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
