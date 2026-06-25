"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { cn } from "@/lib/utils";

/**
 * Small color popover that DOES close on outside click / Esc, unlike the OS
 * native colour picker. Built on react-colorful (~3 kB) for the actual
 * HSL/hex picker UI.
 *
 * - `value` accepts hex (#rrggbb) or empty string (no colour set).
 * - `onChange` fires on every drag — wrap with debounce upstream if needed.
 * - `size`: trigger swatch dimensions; "md" matches input row height.
 * - `align`: where the popover sits relative to the trigger.
 */
export function ColorPopover({
  value,
  onChange,
  onClear,
  size = "md",
  align = "start",
  placeholder = "Pilih warna",
}: {
  value: string;
  onChange: (hex: string) => void;
  onClear?: () => void;
  size?: "sm" | "md";
  align?: "start" | "end";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Hex string the picker is currently showing. We keep this internal so the
  // text input feels responsive while typing partial hex (#ff isn't valid yet
  // but the user is on the way).
  const [draft, setDraft] = useState(value || "#000000");
  useEffect(() => {
    if (value && /^#[0-9a-fA-F]{6}$/.test(value)) setDraft(value);
  }, [value]);

  // Close on outside click + Escape. We attach on the document so any
  // ancestor (including the radix dialog backdrop) can't swallow the event.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commitHex(s: string) {
    let v = s.trim();
    if (!v.startsWith("#")) v = "#" + v;
    setDraft(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toLowerCase());
  }

  const swatchSize = size === "sm" ? "size-6" : "size-7";

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "cursor-pointer rounded border border-input shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          swatchSize,
        )}
        style={{ background: value || "transparent" }}
        title={value || placeholder}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {!value && (
          <span className="grid h-full w-full place-items-center text-xs text-muted-foreground">
            ?
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          className={cn(
            "absolute z-50 mt-1.5 w-[220px] rounded-lg border bg-popover p-2 shadow-xl",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {/* react-colorful picker */}
          <HexColorPicker
            color={draft}
            onChange={(v) => {
              setDraft(v);
              onChange(v);
            }}
            style={{ width: "100%", height: 160 }}
          />

          {/* Hex text input — lets users paste exact codes */}
          <div className="mt-2 flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">HEX</span>
            <input
              type="text"
              value={draft}
              onChange={(e) => commitHex(e.target.value)}
              className="h-7 flex-1 rounded border border-input bg-background px-1.5 font-mono text-xs uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {onClear && value && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Reset warna"
              >
                Reset
              </button>
            )}
          </div>

          {/* Preset swatches — common picks save 3-4 clicks */}
          <div className="mt-2 grid grid-cols-8 gap-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setDraft(p);
                  onChange(p);
                }}
                className="size-5 rounded border border-input transition-transform hover:scale-110"
                style={{ background: p }}
                title={p}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Curated palette — saves the common "I need a sane brand color" case.
const PRESETS = [
  "#0f172a", "#374151", "#6b7280", "#9ca3af",
  "#ef4444", "#f59e0b", "#10b981", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#ffffff", "#f3f4f6", "#fef3c7", "#dbeafe",
];
