"use client";

// Visual theme editor — colors + fonts + radius. Replaces JSON textarea di
// admin template edit page. Shape output selaras dengan `ThemeJson` di
// apps/renderer/lib/api.ts:
//
//   { colors: {primary, secondary, bg, fg}, font: {heading, body}, radius }
//
// Live preview panel di bawah render sample button + card + heading dengan
// theme current supaya admin lihat hasil sebelum simpan.
//
// Font loader — inject <link rel=stylesheet> ke Google Fonts on-the-fly saat
// admin ganti dropdown, supaya font actual ter-render di preview panel
// (bukan fallback system-ui).

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Type } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// -------- Types (mirror ThemeJson di renderer) --------

export type ThemeValue = {
  colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
  font?: { heading?: string; body?: string };
  radius?: string;
};

// Preset palettes — 5 warna sekaligus set. Terinspirasi dari common web design
// systems + selaras dengan warna yang UMKM Indonesia biasa pakai.
const PRESETS: {
  id: string;
  label: string;
  colors: Required<NonNullable<ThemeValue["colors"]>>;
}[] = [
  {
    id: "neutral",
    label: "Neutral",
    colors: { primary: "#0f172a", secondary: "#64748b", bg: "#ffffff", fg: "#0f172a" },
  },
  {
    id: "ocean",
    label: "Ocean",
    colors: { primary: "#0ea5e9", secondary: "#06b6d4", bg: "#f0f9ff", fg: "#0c4a6e" },
  },
  {
    id: "forest",
    label: "Forest",
    colors: { primary: "#059669", secondary: "#10b981", bg: "#f0fdf4", fg: "#064e3b" },
  },
  {
    id: "sunset",
    label: "Sunset",
    colors: { primary: "#f59e0b", secondary: "#f97316", bg: "#fff7ed", fg: "#7c2d12" },
  },
  {
    id: "berry",
    label: "Berry",
    colors: { primary: "#8b5cf6", secondary: "#ec4899", bg: "#faf5ff", fg: "#4c1d95" },
  },
  {
    id: "midnight",
    label: "Midnight",
    colors: { primary: "#818cf8", secondary: "#f472b6", bg: "#0f172a", fg: "#e2e8f0" },
  },
];

// Curated Google Fonts. Grouped by kategori supaya admin gampang pilih. Font
// yang ada di sini di-preload saat editor mount (biar preview panel langsung
// jalan tanpa flash).
const FONTS = {
  "Sans-serif": [
    "Inter",
    "Poppins",
    "Roboto",
    "Open Sans",
    "Nunito",
    "Work Sans",
    "Manrope",
    "Plus Jakarta Sans",
    "DM Sans",
  ],
  Serif: ["Playfair Display", "Merriweather", "Lora", "EB Garamond", "Cormorant Garamond"],
  Display: ["Bebas Neue", "Righteous", "Fredoka"],
  Mono: ["JetBrains Mono", "Fira Code"],
};

const RADIUS_PRESETS = [
  { id: "sharp", label: "Sharp", value: "0" },
  { id: "small", label: "Small", value: "0.375rem" },
  { id: "rounded", label: "Rounded", value: "0.75rem" },
  { id: "pill", label: "Pill", value: "1.5rem" },
];

const DEFAULT_COLORS = {
  primary: "#2563eb",
  secondary: "#0ea5e9",
  bg: "#ffffff",
  fg: "#0f172a",
};

// -------- Google Fonts loader --------
//
// Inject 1 stylesheet link per font family sekali di-mount. Kalau admin ganti
// font, tambah link baru untuk font yang belum di-load. Old link tidak
// di-hapus supaya switch balik tetap instant.

function googleFontLink(family: string): string {
  const q = family.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${q}:wght@400;500;600;700&display=swap`;
}

function useLoadGoogleFont(family: string | undefined) {
  useEffect(() => {
    if (!family) return;
    const id = `wb-gf-${family.replace(/\s+/g, "-")}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = googleFontLink(family);
    document.head.appendChild(link);
  }, [family]);
}

// -------- Component --------

export function ThemeEditor({
  value,
  onChange,
}: {
  value: ThemeValue;
  onChange: (next: ThemeValue) => void;
}) {
  const colors = { ...DEFAULT_COLORS, ...(value.colors ?? {}) };
  const font = value.font ?? {};
  const radius = value.radius ?? "0.5rem";

  // Load font current supaya preview panel render dengan font actual.
  useLoadGoogleFont(font.heading);
  useLoadGoogleFont(font.body);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(value, null, 2));

  // Sync jsonText saat parent-nya update via preset click (bidirectional).
  useEffect(() => {
    setJsonText(JSON.stringify(value, null, 2));
  }, [value]);

  function setColor(key: keyof typeof DEFAULT_COLORS, hex: string) {
    onChange({
      ...value,
      colors: { ...(value.colors ?? {}), [key]: hex },
    });
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    onChange({
      ...value,
      colors: { ...preset.colors },
    });
  }

  function setFont(key: "heading" | "body", family: string) {
    onChange({
      ...value,
      font: { ...(value.font ?? {}), [key]: family || undefined },
    });
  }

  function setRadius(v: string) {
    onChange({ ...value, radius: v });
  }

  function applyRawJSON() {
    try {
      const parsed = JSON.parse(jsonText);
      onChange(parsed);
    } catch {
      // eslint-disable-next-line no-alert
      alert("JSON tidak valid — tidak di-apply");
    }
  }

  // Kalau semua 4 color match salah satu preset, highlight chip aktif.
  const activePresetId = useMemo(() => {
    return (
      PRESETS.find(
        (p) =>
          p.colors.primary.toLowerCase() === (colors.primary ?? "").toLowerCase() &&
          p.colors.secondary.toLowerCase() === (colors.secondary ?? "").toLowerCase() &&
          p.colors.bg.toLowerCase() === (colors.bg ?? "").toLowerCase() &&
          p.colors.fg.toLowerCase() === (colors.fg ?? "").toLowerCase(),
      )?.id ?? null
    );
  }, [colors]);

  const activeRadius = RADIUS_PRESETS.find((r) => r.value === radius)?.id ?? null;

  return (
    <div className="space-y-6">
      {/* Preset palettes */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Palette preset
        </Label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = activePresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "group relative flex items-center gap-2 rounded-md border p-2 pr-3 transition-all",
                  active ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
                )}
                title={p.label}
              >
                {/* 4 swatch mini */}
                <div className="flex gap-0.5">
                  {(["primary", "secondary", "bg", "fg"] as const).map((k) => (
                    <span
                      key={k}
                      className="size-4 rounded border border-black/10"
                      style={{ backgroundColor: p.colors[k] }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium">{p.label}</span>
                {active && <Check className="size-3 text-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Individual color pickers */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ColorField label="Primary" value={colors.primary} onChange={(v) => setColor("primary", v)} hint="Warna utama tombol, link, CTA" />
        <ColorField label="Secondary" value={colors.secondary} onChange={(v) => setColor("secondary", v)} hint="Aksen sekunder (gradient, highlight)" />
        <ColorField label="Background" value={colors.bg} onChange={(v) => setColor("bg", v)} hint="Warna latar body" />
        <ColorField label="Foreground" value={colors.fg} onChange={(v) => setColor("fg", v)} hint="Warna text utama" />
      </div>

      {/* Fonts */}
      <div className="grid gap-3 sm:grid-cols-2">
        <FontField
          label="Font Heading"
          value={font.heading}
          onChange={(v) => setFont("heading", v)}
          sampleText="Judul Halaman"
          heading
        />
        <FontField
          label="Font Body"
          value={font.body}
          onChange={(v) => setFont("body", v)}
          sampleText="Kalimat isi paragraf yang lebih panjang."
        />
      </div>

      {/* Radius */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Border radius
        </Label>
        <div className="flex flex-wrap gap-2">
          {RADIUS_PRESETS.map((r) => {
            const active = activeRadius === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRadius(r.value)}
                className={cn(
                  "flex items-center gap-2 border px-3 py-2 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:border-primary/40",
                )}
                style={{ borderRadius: r.value }}
              >
                <span
                  className="inline-block size-4 border"
                  style={{ borderRadius: r.value, background: "currentColor", opacity: 0.4 }}
                />
                {r.label}
              </button>
            );
          })}
          {/* Custom manual input */}
          <div className="flex items-center gap-2 rounded-md border px-2 py-1">
            <span className="text-[10px] uppercase text-muted-foreground">Custom</span>
            <input
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-24 bg-transparent text-xs outline-none"
              placeholder="0.75rem"
            />
          </div>
        </div>
      </div>

      {/* Live preview panel */}
      <ThemePreview colors={colors} font={font} radius={radius} />

      {/* Advanced: raw JSON — collapsible */}
      <div className="rounded-lg border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50"
        >
          <span>Advanced: Edit JSON mentah</span>
          {advancedOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        {advancedOpen && (
          <div className="space-y-2 border-t p-4">
            <textarea
              rows={8}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full rounded border bg-background p-2 font-mono text-xs"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={applyRawJSON}
                className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Apply JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// -------- Sub-components --------

function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="h-9 font-mono text-xs"
          maxLength={9}
        />
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FontField({
  label,
  value,
  onChange,
  sampleText,
  heading,
}: {
  label: string;
  value?: string;
  onChange: (family: string) => void;
  sampleText: string;
  heading?: boolean;
}) {
  useLoadGoogleFont(value);

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs">
        <Type className="size-3" />
        {label}
      </Label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">— System default —</option>
        {Object.entries(FONTS).map(([group, families]) => (
          <optgroup key={group} label={group}>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div
        className={cn(
          "min-h-[3rem] rounded-md border bg-muted/20 px-3 py-2",
          heading ? "text-lg font-bold" : "text-sm",
        )}
        style={{
          fontFamily: value ? `"${value}", system-ui, sans-serif` : undefined,
        }}
      >
        {sampleText}
      </div>
    </div>
  );
}

// ThemePreview — sample HTML "site" with heading/paragraph/button/card
// styled dengan theme yang di-edit. Live update setiap perubahan.
function ThemePreview({
  colors,
  font,
  radius,
}: {
  colors: Required<NonNullable<ThemeValue["colors"]>>;
  font: NonNullable<ThemeValue["font"]>;
  radius: string;
}) {
  const style: React.CSSProperties = {
    background: colors.bg,
    color: colors.fg,
    fontFamily: font.body ? `"${font.body}", system-ui, sans-serif` : "system-ui, sans-serif",
  };
  const headingStyle: React.CSSProperties = {
    fontFamily: font.heading ? `"${font.heading}", system-ui, sans-serif` : "inherit",
    color: colors.fg,
  };
  const btnStyle: React.CSSProperties = {
    background: colors.primary,
    color: "#fff",
    borderRadius: radius,
  };
  const btnSecondaryStyle: React.CSSProperties = {
    background: colors.secondary,
    color: "#fff",
    borderRadius: radius,
  };
  const cardStyle: React.CSSProperties = {
    background: "#fff",
    color: colors.fg,
    borderRadius: radius,
    borderColor: `${colors.primary}20`,
  };

  return (
    <Card>
      <CardContent className="space-y-2 p-0">
        <div className="px-4 pt-3 text-xs uppercase tracking-wider text-muted-foreground">
          Live preview
        </div>
        <div
          className="space-y-4 border-t p-6"
          style={style}
        >
          <h1 className="text-3xl font-bold leading-tight" style={headingStyle}>
            Judul Halaman Contoh
          </h1>
          <p className="text-base leading-relaxed opacity-90">
            Ini paragraf sample untuk menampilkan body text. Ganti warna dan
            font di atas untuk lihat hasilnya real-time.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold shadow-sm transition-transform hover:scale-105"
              style={btnStyle}
            >
              Tombol Primary
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold shadow-sm transition-transform hover:scale-105"
              style={btnSecondaryStyle}
            >
              Tombol Secondary
            </button>
          </div>
          <div className="border p-4" style={cardStyle}>
            <div className="text-sm font-bold" style={headingStyle}>
              Kartu Sample
            </div>
            <p className="mt-2 text-xs opacity-70">
              Radius kartu ini mengikuti setting <code>{radius}</code>.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
