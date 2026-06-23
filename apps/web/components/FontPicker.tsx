"use client";

import { useEffect, useState } from "react";
import { buildCatalogFontsUrl, categoryLabels, fonts, fontStyle, type FontCategory } from "@/lib/fonts";

// Inserts a single <link> for the whole font catalog on first use, so all
// picker previews render in their real typeface.
function ensureFontCatalogLoaded() {
  if (typeof document === "undefined") return;
  const id = "wb-font-catalog";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = buildCatalogFontsUrl();
  document.head.appendChild(link);
}

export function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Load catalog as soon as the trigger is mounted so the trigger label
  // also renders in the chosen font.
  useEffect(() => {
    ensureFontCatalogLoaded();
  }, []);

  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50"
      >
        <span style={fontStyle(value)} className="truncate">
          {value || "Pilih font..."}
        </span>
        <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <FontModal
          current={value}
          onClose={() => setOpen(false)}
          onPick={(name) => {
            onChange(name);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FontModal({
  current,
  onClose,
  onPick,
}: {
  current: string;
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  const [cat, setCat] = useState<FontCategory>("sans");
  const [q, setQ] = useState("");

  const filtered = fonts.filter(
    (f) =>
      f.category === cat &&
      (q.trim() === "" || f.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-semibold">Pilih Font</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <div className="flex gap-1">
            {(Object.keys(categoryLabels) as FontCategory[]).map((k) => (
              <button
                key={k}
                onClick={() => setCat(k)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  cat === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {categoryLabels[k]}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari font..."
            className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((f) => (
              <button
                key={f.name}
                onClick={() => onPick(f.name)}
                className={`rounded-lg border p-3 text-left transition hover:border-brand-500 ${
                  current === f.name ? "border-brand-500 bg-brand-50" : "border-slate-200"
                }`}
              >
                <div className="text-xs text-slate-500">{f.name}</div>
                <div
                  style={{ ...fontStyle(f.name), fontWeight: 700 }}
                  className="mt-1 text-2xl leading-tight"
                >
                  Aa Bb Cc
                </div>
                <div style={fontStyle(f.name)} className="mt-1 text-sm text-slate-600">
                  The quick brown fox jumps.
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-slate-500">
                Tidak ada font yang cocok.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
