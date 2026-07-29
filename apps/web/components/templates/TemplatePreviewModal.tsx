"use client";

// Template live preview modal — iframe ke renderer route
// /template-preview/<slug> dengan device switcher (Desktop/Tablet/Mobile).
//
// Cross-origin: renderer di host berbeda dari dashboard. Iframe display tetap
// jalan (browser allow rendering cross-origin), kita tidak baca DOM-nya.

import { useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Device = "desktop" | "tablet" | "mobile";

// Device dimension untuk iframe width. Height ambil sisa viewport modal.
const DEVICES: { key: Device; label: string; icon: typeof Monitor; width: number }[] = [
  { key: "desktop", label: "Desktop", icon: Monitor, width: 1280 },
  { key: "tablet", label: "Tablet", icon: Tablet, width: 768 },
  { key: "mobile", label: "Mobile", icon: Smartphone, width: 390 },
];

const RENDERER_BASE =
  process.env.NEXT_PUBLIC_RENDERER_BASE ?? "http://localhost";

export function TemplatePreviewModal({
  open,
  slug,
  name,
  description,
  onClose,
  onSelect,
  selectLabel = "Pakai template ini",
}: {
  open: boolean;
  slug: string;
  name: string;
  description?: string;
  onClose: () => void;
  // onSelect opsional — kalau di-set, tombol "Pakai template ini" muncul di
  // header modal. Kalau nil, modal hanya view-only (misal admin preview).
  onSelect?: () => void;
  selectLabel?: string;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [iframeLoaded, setIframeLoaded] = useState(false);

  if (!open) return null;

  const currentDevice = DEVICES.find((d) => d.key === device) ?? DEVICES[0];
  const previewURL = `${RENDERER_BASE}/template-preview/${encodeURIComponent(slug)}`;

  return (
    // Custom modal — bukan pakai shadcn Dialog karena butuh full-screen +
    // custom header controls (device switcher). Portal implicit via fixed.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        // Close saat klik backdrop, bukan child.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{name}</h2>
            {description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          {/* Device switcher */}
          <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
            {DEVICES.map((d) => {
              const Icon = d.icon;
              const active = device === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDevice(d.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                  title={`${d.label} (${d.width}px)`}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{d.label}</span>
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className="gap-1 text-xs">
              <a href={previewURL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3" />
                <span className="hidden sm:inline">Tab baru</span>
              </a>
            </Button>
            {onSelect && (
              <Button
                size="sm"
                onClick={() => {
                  onSelect();
                  onClose();
                }}
                className="gap-1.5 text-xs"
              >
                {selectLabel}
                <ArrowRight className="size-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Tutup preview"
              className="size-8"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Iframe container — center + responsive width per device */}
        <div className="relative flex-1 overflow-auto bg-muted/50">
          <div
            className="mx-auto h-full transition-all duration-300"
            style={{ maxWidth: `${currentDevice.width}px` }}
          >
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Memuat preview…
                </div>
              </div>
            )}
            <iframe
              key={slug + device} // remount saat ganti device — pastikan layout re-render
              src={previewURL}
              className="h-full w-full border-0 bg-white"
              title={`Preview ${name}`}
              // Sandbox: allow-scripts + allow-same-origin (renderer host).
              // Same-origin karena renderer di internal caddy sama URL root;
              // kalau lint suggest lebih restrictive, tambah allow-forms /
              // allow-popups sesuai kebutuhan block yang di-render.
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => setIframeLoaded(true)}
            />
          </div>
        </div>

        {/* Footer hint */}
        <div className="border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="font-mono">{previewURL}</span> · lebar {currentDevice.width}
          px
        </div>
      </div>
    </div>
  );
}
