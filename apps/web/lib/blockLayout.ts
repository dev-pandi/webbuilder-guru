// Block-level layout + theme override. Optional metadata attached to a block
// alongside its `props`. All fields optional — the renderer / canvas wrapper
// treats undefined as "use defaults".
//
// SHARED contract — same shape must be honoured by:
//   - apps/web/app/sites/[id]/editor/page.tsx (preview)
//   - apps/renderer/components/Blocks.tsx     (live render)
//   - apps/api/internal/exports/render.go     (static export)

import { hexToHslComponents, readableForeground } from "./color";

export type BlockLayout = {
  // Padding (rem). 0 disables (no inline style). Top/right/bottom/left.
  pt?: number;
  pr?: number;
  pb?: number;
  pl?: number;
  // Margin top/bottom (rem). Most flow layouts only need vertical margins.
  mt?: number;
  mb?: number;
  // Max width container — keeps long-line readability. "full" = stretch.
  maxWidth?: "full" | "narrow" | "prose" | "wide";
  // Horizontal alignment of the block content.
  align?: "left" | "center" | "right";
  // Optional background colour override on the block wrapper. Hex string;
  // undefined = transparent (block sees site bg).
  bg?: string;
};

// Per-block theme override. Only the colours commonly tweaked per-section
// (primary accent + bg/fg). Renderer maps these to `--color-primary` /
// `--color-bg` / `--color-fg` on the wrapper so EVERY child block element
// using those vars (most of the new Pro blocks + renderer Blocks.tsx) picks
// the local override automatically.
export type ThemeOverride = {
  primary?: string;
  secondary?: string;
  bg?: string;
  fg?: string;
};

export type LayoutMeta = {
  layout?: BlockLayout;
  themeOverride?: ThemeOverride;
};

// Tailwind-like max-width presets that match the renderer's design system.
const MAX_WIDTH_PX: Record<NonNullable<BlockLayout["maxWidth"]>, string> = {
  full: "100%",
  wide: "1280px",
  narrow: "640px",
  prose: "720px",
};

/**
 * Compute CSS for a block wrapper from its layout + theme override. Returns
 * an object suitable for `style={...}`. Empty layout → empty style (so the
 * block keeps its original behaviour).
 */
export function buildLayoutStyle(meta?: LayoutMeta): React.CSSProperties {
  const out: Record<string, string> = {};
  const L = meta?.layout;
  if (L) {
    if (L.pt != null) out.paddingTop = `${L.pt}rem`;
    if (L.pr != null) out.paddingRight = `${L.pr}rem`;
    if (L.pb != null) out.paddingBottom = `${L.pb}rem`;
    if (L.pl != null) out.paddingLeft = `${L.pl}rem`;
    if (L.mt != null) out.marginTop = `${L.mt}rem`;
    if (L.mb != null) out.marginBottom = `${L.mb}rem`;
    if (L.bg) out.backgroundColor = L.bg;
    if (L.align) out.textAlign = L.align;
  }
  const O = meta?.themeOverride;
  if (O) {
    // 1) Renderer-style raw vars — used by Pro blocks + any inline-style block
    //    that reads `var(--color-primary)` directly.
    if (O.primary) out["--color-primary"] = O.primary;
    if (O.secondary) out["--color-secondary"] = O.secondary;
    if (O.bg) out["--color-bg"] = O.bg;
    if (O.fg) out["--color-fg"] = O.fg;

    // 2) shadcn-style HSL tokens — necessary so STANDARD blocks (the ones
    //    using tailwind `bg-primary` / `text-foreground` etc.) also pick up
    //    the per-block override. Without this branch only Pro blocks would
    //    re-colour and the user reports "preview tidak berubah".
    if (O.primary) {
      const h = hexToHslComponents(O.primary);
      if (h) out["--primary"] = h;
      out["--primary-foreground"] = readableForeground(O.primary);
      out["--ring"] = h ?? out["--ring"];
    }
    if (O.secondary) {
      const h = hexToHslComponents(O.secondary);
      if (h) out["--secondary"] = h;
      out["--secondary-foreground"] = readableForeground(O.secondary);
    }
    if (O.bg) {
      const h = hexToHslComponents(O.bg);
      if (h) {
        out["--background"] = h;
        out["--card"] = h;
        out["--popover"] = h;
      }
      // 3) Paint the wrapper background directly. CSS vars alone aren't
      //    enough — most block markup doesn't use `bg-background`, so without
      //    a concrete background-color the user's "Latar" override stays
      //    invisible. layout.bg can still override (handled above) and wins
      //    when both are set because it's applied later in source order.
      if (!out.backgroundColor) out.backgroundColor = O.bg;
    }
    if (O.fg) {
      const h = hexToHslComponents(O.fg);
      if (h) {
        out["--foreground"] = h;
        out["--card-foreground"] = h;
        out["--popover-foreground"] = h;
        out["--muted-foreground"] = h;
      }
      // Cascade `color` so paragraphs/headings without explicit text class
      // pick up the override. Tailwind's `text-muted-foreground` etc. still
      // win via specificity if the block uses them.
      out.color = O.fg;
    }
  }
  return out as React.CSSProperties;
}

/**
 * If `maxWidth` is anything other than "full", we need a centred inner
 * container so the constraint actually narrows the block. Returns style for
 * the inner div; if maxWidth is "full" or undefined, returns null (caller
 * skips the wrapper entirely).
 */
export function buildMaxWidthStyle(meta?: LayoutMeta): React.CSSProperties | null {
  const mw = meta?.layout?.maxWidth;
  if (!mw || mw === "full") return null;
  return {
    maxWidth: MAX_WIDTH_PX[mw],
    marginLeft: "auto",
    marginRight: "auto",
    width: "100%",
  };
}

export function hasLayoutMeta(meta?: LayoutMeta): boolean {
  return Boolean(
    (meta?.layout && Object.keys(meta.layout).length > 0) ||
      (meta?.themeOverride && Object.keys(meta.themeOverride).length > 0),
  );
}
