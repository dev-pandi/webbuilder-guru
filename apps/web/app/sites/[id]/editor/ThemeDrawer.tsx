"use client";

import { Loader2, Palette, Save, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FontPicker } from "@/components/FontPicker";
import { ColorPopover } from "@/components/ColorPopover";
import { cn } from "@/lib/utils";

export type ThemeJson = {
  colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
  font?: { heading?: string; body?: string };
  radius?: string;
};

const COLOR_FIELDS = [
  { key: "primary", label: "Primer", desc: "Tombol & aksen utama" },
  { key: "secondary", label: "Sekunder", desc: "Aksen pendukung" },
  { key: "bg", label: "Latar", desc: "Background halaman" },
  { key: "fg", label: "Teks", desc: "Warna teks utama" },
] as const;

const RADIUS_PRESETS = [
  { v: "0rem", label: "Tajam" },
  { v: "0.375rem", label: "Halus" },
  { v: "0.75rem", label: "Sedang" },
  { v: "1.5rem", label: "Bulat" },
];

export function ThemeDrawer({
  open,
  onClose,
  theme,
  onChange,
  onSave,
  saving,
  dirty,
}: {
  open: boolean;
  onClose: () => void;
  theme: ThemeJson;
  onChange: (t: ThemeJson) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const color = (k: "primary" | "secondary" | "bg" | "fg") =>
    theme.colors?.[k] ?? "#000000";

  return (
    <>
      {/* Scrim — clicks close */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Side panel */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-background shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10">
              <Palette className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Tema Situs</h2>
              <p className="text-[11px] text-muted-foreground">
                Warna, font, dan radius — diterapkan live di preview.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
            <X className="size-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Colors */}
          <section className="space-y-3">
            <SectionLabel>Warna</SectionLabel>
            <div className="space-y-2">
              {COLOR_FIELDS.map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                      {color(key).toUpperCase()}
                    </span>
                    <ColorPopover
                      value={color(key)}
                      align="end"
                      onChange={(hex) =>
                        onChange({
                          ...theme,
                          colors: { ...(theme.colors ?? {}), [key]: hex },
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Separator className="my-5" />

          {/* Fonts */}
          <section className="space-y-3">
            <SectionLabel>Tipografi</SectionLabel>
            <FontPicker
              label="Heading"
              value={theme.font?.heading ?? ""}
              onChange={(name) =>
                onChange({ ...theme, font: { ...(theme.font ?? {}), heading: name } })
              }
            />
            <FontPicker
              label="Body"
              value={theme.font?.body ?? ""}
              onChange={(name) =>
                onChange({ ...theme, font: { ...(theme.font ?? {}), body: name } })
              }
            />
          </section>

          <Separator className="my-5" />

          {/* Radius */}
          <section className="space-y-2">
            <SectionLabel>Sudut (Border Radius)</SectionLabel>
            <div className="flex gap-1.5">
              {RADIUS_PRESETS.map((r) => {
                const active = (theme.radius ?? "") === r.v;
                return (
                  <button
                    key={r.v}
                    type="button"
                    onClick={() => onChange({ ...theme, radius: r.v })}
                    className={cn(
                      "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-all",
                      active
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "hover:border-input hover:bg-muted",
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <Label
              htmlFor="radius-custom"
              className="mt-2 text-[11px] text-muted-foreground"
            >
              Atau nilai kustom
            </Label>
            <Input
              id="radius-custom"
              value={theme.radius ?? ""}
              onChange={(e) => onChange({ ...theme, radius: e.target.value })}
              placeholder="0.5rem"
              className="font-mono"
            />
          </section>

          <Separator className="my-5" />

          {/* Mini preview */}
          <section className="space-y-2">
            <SectionLabel>Pratinjau</SectionLabel>
            <div
              className="overflow-hidden rounded-lg border p-4 transition-all"
              style={{
                background: color("bg"),
                color: color("fg"),
                borderRadius: theme.radius,
                fontFamily: theme.font?.body,
              }}
            >
              <p
                className="text-xs font-semibold uppercase tracking-widest opacity-50"
                style={{ fontFamily: theme.font?.heading }}
              >
                Eyebrow
              </p>
              <h3
                className="mt-1 text-xl font-bold leading-tight"
                style={{ fontFamily: theme.font?.heading }}
              >
                Halo, judul dengan font heading
              </h3>
              <p className="mt-1 text-sm leading-relaxed opacity-75">
                Body text — periksa keterbacaan kombinasi font dan warna ini.
              </p>
              <div className="mt-3 flex gap-2">
                <span
                  className="rounded px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                  style={{ background: color("primary"), borderRadius: theme.radius }}
                >
                  Primer
                </span>
                <span
                  className="rounded px-3 py-1.5 text-xs font-medium text-white shadow-sm"
                  style={{ background: color("secondary"), borderRadius: theme.radius }}
                >
                  Sekunder
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {dirty ? (
              <>
                <span className="size-1.5 rounded-full bg-amber-500" />
                Ada perubahan belum disimpan
              </>
            ) : (
              <>
                <Sparkles className="size-3" />
                Tema tersimpan
              </>
            )}
          </div>
          <Button onClick={onSave} disabled={saving || !dirty} size="sm" className="gap-1.5">
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {saving ? "Menyimpan…" : "Simpan Tema"}
          </Button>
        </div>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}
