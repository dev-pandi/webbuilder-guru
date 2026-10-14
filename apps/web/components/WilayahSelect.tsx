"use client";

// WilayahSelect — ProvinceSelect + CitySelect pair untuk form kontak.
// Mencegah typo + non-ASCII input yang bikin EPP contact:create gagal
// dengan "Transaction rolled back".
//
// Country default fixed "ID" (platform ID-only). Province dropdown dari
// WILAYAH_INDONESIA. City dropdown filter berdasarkan province terpilih.
//
// Legacy data: kalau value yang tersimpan tidak match list (mis.
// "Jawa Barat - West Java" dari sebelum validasi ketat), komponen tetap
// render value tersebut sebagai item khusus "⚠ Nilai lama" supaya user
// sadar + dropdown turun ke list resmi.
//
// Searchable: trigger-nya kombobox custom (lightweight — zero deps baru;
// cmdk + popover tambah ~30KB tidak sepadan untuk 1 flow). Ketik di input
// → list ter-filter case-insensitive. ESC / click outside / pilih item →
// tutup. Keyboard: tab untuk fokus, up/down bisa ditambah nanti.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROVINCES,
  citiesOf,
  isKnownProvince,
  isKnownCity,
} from "@/lib/wilayah";

// SearchableSelect — kombobox custom tanpa dependency baru. Trigger button
// + floating panel dengan search filter. Dipakai untuk Province + City.
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  isLegacy,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
  // Kalau true, berarti value saat ini tidak ada di options (legacy data).
  // Trigger akan punya aria-invalid + warning styling.
  isLegacy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Autofocus search input saat panel terbuka.
  useEffect(() => {
    if (open) {
      // defer ke next tick biar DOM sudah mount.
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-invalid={isLegacy}
        aria-expanded={open}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm",
          "ring-offset-background placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isLegacy ? "border-amber-500 text-amber-700" : "border-input",
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || placeholder}
        </span>
        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            "absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md",
            "animate-in fade-in-0 zoom-in-95",
          )}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari…"
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {isLegacy && (
              <button
                type="button"
                onClick={() => {
                  // Pilih kembali current value tetap close dropdown.
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-amber-700 hover:bg-amber-50"
              >
                ⚠ {value} (nilai lama — ganti ke pilihan resmi)
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                Tidak ada hasil untuk &quot;{query}&quot;
              </div>
            ) : (
              filtered.map((opt) => {
                const selected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm",
                      "hover:bg-accent hover:text-accent-foreground",
                      selected && "bg-accent/60",
                    )}
                  >
                    <span className="truncate">{opt}</span>
                    {selected && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProvinceSelect({
  value,
  onChange,
  disabled,
  placeholder = "Pilih provinsi",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const isLegacy = value !== "" && !isKnownProvince(value);
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={PROVINCES}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      isLegacy={isLegacy}
    />
  );
}

export function CitySelect({
  province,
  value,
  onChange,
  disabled,
  placeholder = "Pilih kota/kabupaten",
  className,
}: {
  province: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const cities = useMemo(() => citiesOf(province), [province]);
  const isLegacy = value !== "" && !isKnownCity(province, value);
  const noProvince = !isKnownProvince(province);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={cities}
      placeholder={noProvince ? "Pilih provinsi dulu" : placeholder}
      disabled={disabled || noProvince}
      className={className}
      isLegacy={isLegacy}
    />
  );
}

// CountryBadge — static display "Indonesia (ID)" dengan hint. Dipakai di
// form yang previously punya field country manual. Platform tidak support
// multi-country saat ini, jadi fixed display + tooltip explain.
export function CountryBadge({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm ${className ?? ""}`}
      title="Platform saat ini hanya mendukung domain .id dan kontak Indonesia"
    >
      <span>🇮🇩</span>
      <span className="font-medium">Indonesia (ID)</span>
      <span className="ml-auto text-xs text-muted-foreground">fixed</span>
    </div>
  );
}
