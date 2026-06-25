"use client";

import { useState } from "react";
import { ChevronDown, Layout, Maximize2, Paintbrush, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { BlockData } from "./PropEditor";
import type { BlockLayout, ThemeOverride } from "@/lib/blockLayout";
import { cn } from "@/lib/utils";

const MAX_WIDTH_PRESETS: Array<{ value: NonNullable<BlockLayout["maxWidth"]>; label: string }> = [
  { value: "full", label: "Full" },
  { value: "wide", label: "Wide" },
  { value: "prose", label: "Prose" },
  { value: "narrow", label: "Narrow" },
];

const ALIGN_PRESETS: Array<{ value: NonNullable<BlockLayout["align"]>; label: string; icon: string }> = [
  { value: "left", label: "Kiri", icon: "⇤" },
  { value: "center", label: "Tengah", icon: "⇿" },
  { value: "right", label: "Kanan", icon: "⇥" },
];

const COLOR_FIELDS: Array<{ key: keyof ThemeOverride; label: string; desc: string }> = [
  { key: "primary", label: "Primer", desc: "Tombol & aksen di block ini" },
  { key: "secondary", label: "Sekunder", desc: "Aksen pendukung" },
  { key: "bg", label: "Latar", desc: "Background block" },
  { key: "fg", label: "Teks", desc: "Warna teks" },
];

/**
 * Per-block layout + theme override panel. Sits ABOVE the schema-driven
 * PropEditor fields. Keeps the schema authors blissfully unaware of these —
 * every block gets them for free.
 */
export function LayoutPanel({
  block,
  onChange,
}: {
  block: BlockData;
  onChange: (next: BlockData) => void;
}) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  const layout = block.layout ?? {};
  const themeOverride = block.themeOverride ?? {};

  function setLayout(patch: Partial<BlockLayout>) {
    const next = { ...layout, ...patch };
    // Clean up undefineds so the persisted object stays tidy.
    Object.keys(next).forEach((k) => next[k as keyof BlockLayout] === undefined && delete next[k as keyof BlockLayout]);
    onChange({ ...block, layout: Object.keys(next).length ? next : undefined });
  }

  function setTheme(patch: Partial<ThemeOverride>) {
    const next = { ...themeOverride, ...patch };
    Object.keys(next).forEach((k) => {
      const v = next[k as keyof ThemeOverride];
      if (!v) delete next[k as keyof ThemeOverride];
    });
    onChange({ ...block, themeOverride: Object.keys(next).length ? next : undefined });
  }

  function resetLayout() {
    onChange({ ...block, layout: undefined });
  }
  function resetTheme() {
    onChange({ ...block, themeOverride: undefined });
  }

  const hasLayout = Object.keys(layout).length > 0;
  const hasTheme = Object.keys(themeOverride).length > 0;

  return (
    <div className="space-y-3">
      {/* --- Layout & Spacing --- */}
      <CollapsibleSection
        open={layoutOpen}
        onToggle={() => setLayoutOpen((v) => !v)}
        icon={<Layout className="size-3.5" />}
        title="Layout & Jarak"
        dirty={hasLayout}
        onReset={hasLayout ? resetLayout : undefined}
      >
        {/* Max width preset */}
        <div className="space-y-1.5">
          <Label className="text-xs">Lebar Maksimal</Label>
          <div className="flex gap-1">
            {MAX_WIDTH_PRESETS.map((p) => (
              <ToggleChip
                key={p.value}
                active={(layout.maxWidth ?? "full") === p.value}
                onClick={() => setLayout({ maxWidth: p.value === "full" ? undefined : p.value })}
              >
                {p.label}
              </ToggleChip>
            ))}
          </div>
        </div>

        {/* Alignment */}
        <div className="space-y-1.5">
          <Label className="text-xs">Perataan Teks</Label>
          <div className="flex gap-1">
            {ALIGN_PRESETS.map((p) => (
              <ToggleChip
                key={p.value}
                active={layout.align === p.value}
                onClick={() => setLayout({ align: layout.align === p.value ? undefined : p.value })}
              >
                <span className="mr-1">{p.icon}</span>
                {p.label}
              </ToggleChip>
            ))}
          </div>
        </div>

        {/* Padding box */}
        <div className="space-y-1.5">
          <Label className="text-xs">Padding (rem)</Label>
          <BoxInput
            top={layout.pt}
            right={layout.pr}
            bottom={layout.pb}
            left={layout.pl}
            onChange={(side, v) =>
              setLayout({
                [`p${side}` as "pt" | "pr" | "pb" | "pl"]: v,
              } as Partial<BlockLayout>)
            }
          />
        </div>

        {/* Margin (vertical only) */}
        <div className="space-y-1.5">
          <Label className="text-xs">Margin Atas/Bawah (rem)</Label>
          <div className="flex gap-1.5">
            <SmallNumber
              label="↑"
              value={layout.mt}
              onChange={(v) => setLayout({ mt: v })}
              title="Margin atas"
            />
            <SmallNumber
              label="↓"
              value={layout.mb}
              onChange={(v) => setLayout({ mb: v })}
              title="Margin bawah"
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* --- Per-block colour override --- */}
      <CollapsibleSection
        open={colorOpen}
        onToggle={() => setColorOpen((v) => !v)}
        icon={<Paintbrush className="size-3.5" />}
        title="Warna Block"
        dirty={hasTheme}
        onReset={hasTheme ? resetTheme : undefined}
      >
        <p className="text-[11px] text-muted-foreground">
          Override warna khusus untuk block ini. Kosongkan untuk pakai tema situs.
        </p>
        <div className="space-y-2">
          {COLOR_FIELDS.map(({ key, label, desc }) => {
            const v = themeOverride[key] ?? "";
            return (
              <div key={key} className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{label}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={v || "#888888"}
                    onChange={(e) => setTheme({ [key]: e.target.value })}
                    className="size-7 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  {v && (
                    <button
                      type="button"
                      onClick={() => setTheme({ [key]: undefined })}
                      title="Reset"
                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function CollapsibleSection({
  open,
  onToggle,
  icon,
  title,
  dirty,
  onReset,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  dirty?: boolean;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          {icon}
          <span>{title}</span>
          {dirty && <span className="size-1.5 rounded-full bg-amber-500" />}
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 transition-transform",
              open ? "rotate-180" : "",
            )}
          />
        </button>
        {dirty && onReset && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            onClick={onReset}
            title="Reset"
          >
            <RotateCcw className="size-3" />
          </Button>
        )}
      </div>
      {open && <div className="space-y-3 border-t px-3 py-3">{children}</div>}
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md border px-2 py-1 text-xs transition-all",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "hover:border-input hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function SmallNumber({
  label,
  value,
  onChange,
  title,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  title?: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
      <span className="text-xs text-muted-foreground" title={title}>
        {label}
      </span>
      <Input
        type="number"
        step="0.25"
        min="0"
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        className="h-6 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

/**
 * Box-style padding editor — 4 inputs around a visual centre to mimic Figma/
 * Webflow's spacing control.
 */
function BoxInput({
  top,
  right,
  bottom,
  left,
  onChange,
}: {
  top: number | undefined;
  right: number | undefined;
  bottom: number | undefined;
  left: number | undefined;
  onChange: (side: "t" | "r" | "b" | "l", v: number | undefined) => void;
}) {
  function field(side: "t" | "r" | "b" | "l", v: number | undefined) {
    return (
      <Input
        type="number"
        step="0.25"
        min="0"
        value={v ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          onChange(side, Number.isFinite(n) ? n : undefined);
        }}
        className="h-7 w-12 px-1 text-center text-xs"
      />
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 rounded-md border bg-muted/30 p-2">
      <div />
      {field("t", top)}
      <div />
      {field("l", left)}
      <div className="grid h-7 place-items-center text-muted-foreground">
        <Maximize2 className="size-3" />
      </div>
      {field("r", right)}
      <div />
      {field("b", bottom)}
      <div />
    </div>
  );
}
