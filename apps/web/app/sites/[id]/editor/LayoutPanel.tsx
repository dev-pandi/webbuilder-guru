"use client";

import { useState } from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Layout,
  Maximize2,
  Monitor,
  Paintbrush,
  RotateCcw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ColorPopover } from "@/components/ColorPopover";
import type { BlockData } from "./PropEditor";
import type {
  BlockLayout,
  Breakpoint,
  ResponsiveLayoutPatch,
  ThemeOverride,
} from "@/lib/blockLayout";
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

const DEVICE_TABS: Array<{
  value: Breakpoint;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "mobile", label: "Mobile", icon: Smartphone },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "desktop", label: "Desktop", icon: Monitor },
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
  device,
  onDeviceChange,
}: {
  block: BlockData;
  onChange: (next: BlockData) => void;
  // The currently previewed device. Layout edits write to that breakpoint's
  // patch (or the base, for mobile). Driven by the editor toolbar so the
  // user doesn't have to toggle in two places.
  device: Breakpoint;
  onDeviceChange: (bp: Breakpoint) => void;
}) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  const layout = block.layout ?? {};
  const themeOverride = block.themeOverride ?? {};

  // For mobile we edit the BASE layout (mobile-first convention). For
  // tablet/desktop we edit the responsive patch — so removing a value from
  // tablet falls back to the mobile/base value via cascading @media rules.
  const editingBase = device === "mobile";
  const activePatch: ResponsiveLayoutPatch =
    (device !== "mobile" ? layout.responsive?.[device] : undefined) ?? {};

  // Effective layout fields the panel inputs read. For base, the layout's
  // own fields; for breakpoint, the patch's fields.
  const eff: ResponsiveLayoutPatch = editingBase
    ? {
        pt: layout.pt,
        pr: layout.pr,
        pb: layout.pb,
        pl: layout.pl,
        mt: layout.mt,
        mb: layout.mb,
        maxWidth: layout.maxWidth,
        align: layout.align,
        bg: layout.bg,
      }
    : activePatch;

  function setLayout(patch: Partial<BlockLayout>) {
    // Mobile = write base fields directly. Tablet/desktop = write into the
    // responsive patch keyed by device.
    if (editingBase) {
      const next = { ...layout, ...patch };
      // Strip undefineds so we don't persist noise.
      (Object.keys(next) as Array<keyof BlockLayout>).forEach(
        (k) => next[k] === undefined && delete next[k],
      );
      onChange({ ...block, layout: Object.keys(next).length ? next : undefined });
      return;
    }
    // Map BlockLayout keys → ResponsiveLayoutPatch (same field names, subset).
    const nextPatch: ResponsiveLayoutPatch = { ...(activePatch ?? {}) };
    const allowed: Array<keyof ResponsiveLayoutPatch> = [
      "pt", "pr", "pb", "pl", "mt", "mb", "maxWidth", "align", "bg",
    ];
    for (const k of allowed) {
      if (k in patch) {
        const v = (patch as Record<string, unknown>)[k];
        if (v === undefined) {
          delete nextPatch[k];
        } else {
          (nextPatch as Record<string, unknown>)[k] = v;
        }
      }
    }
    const responsive = { ...(layout.responsive ?? {}) };
    if (Object.keys(nextPatch).length) {
      responsive[device as "tablet" | "desktop"] = nextPatch;
    } else {
      delete responsive[device as "tablet" | "desktop"];
    }
    const nextLayout: BlockLayout = {
      ...layout,
      responsive: Object.keys(responsive).length ? responsive : undefined,
    };
    if (!nextLayout.responsive) delete nextLayout.responsive;
    onChange({
      ...block,
      layout: Object.keys(nextLayout).length ? nextLayout : undefined,
    });
  }

  function toggleHidden(bp: Breakpoint, hide: boolean) {
    const hidden = { ...(layout.hidden ?? {}) };
    if (hide) hidden[bp] = true;
    else delete hidden[bp];
    const nextLayout: BlockLayout = {
      ...layout,
      hidden: Object.keys(hidden).length ? hidden : undefined,
    };
    if (!nextLayout.hidden) delete nextLayout.hidden;
    onChange({
      ...block,
      layout: Object.keys(nextLayout).length ? nextLayout : undefined,
    });
  }
  const hiddenOnDevice = Boolean(layout.hidden?.[device]);

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
        {/* Device toggle — picks which breakpoint we're editing */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Edit untuk perangkat</Label>
            <button
              type="button"
              onClick={() => toggleHidden(device, !hiddenOnDevice)}
              title={
                hiddenOnDevice
                  ? `Tampilkan block di ${device}`
                  : `Sembunyikan block di ${device}`
              }
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                hiddenOnDevice
                  ? "bg-destructive/10 text-destructive"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {hiddenOnDevice ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {hiddenOnDevice ? "Tersembunyi" : "Terlihat"}
            </button>
          </div>
          <div className="inline-flex w-full items-center gap-0.5 rounded-md bg-muted p-0.5">
            {DEVICE_TABS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => onDeviceChange(d.value)}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-all",
                  device === d.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title={d.label}
              >
                <d.icon className="size-3" />
                <span className="hidden xs:inline">{d.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {editingBase
              ? "Nilai dasar — diterapkan ke semua ukuran kalau tidak ada override."
              : `Override untuk ${device}. Field kosong = ikut nilai dasar (mobile).`}
          </p>
        </div>

        {/* Max width preset */}
        <div className="space-y-1.5">
          <Label className="text-xs">Lebar Maksimal</Label>
          <div className="flex gap-1">
            {MAX_WIDTH_PRESETS.map((p) => (
              <ToggleChip
                key={p.value}
                active={(eff.maxWidth ?? (editingBase ? "full" : undefined)) === p.value}
                onClick={() =>
                  setLayout({ maxWidth: p.value === "full" ? undefined : p.value })
                }
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
                active={eff.align === p.value}
                onClick={() => setLayout({ align: eff.align === p.value ? undefined : p.value })}
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
            top={eff.pt}
            right={eff.pr}
            bottom={eff.pb}
            left={eff.pl}
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
              value={eff.mt}
              onChange={(v) => setLayout({ mt: v })}
              title="Margin atas"
            />
            <SmallNumber
              label="↓"
              value={eff.mb}
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
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{label}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{desc}</p>
                </div>
                <ColorPopover
                  value={v}
                  align="end"
                  onChange={(hex) => setTheme({ [key]: hex })}
                  onClear={() => setTheme({ [key]: undefined })}
                />
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
