"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Site = { id: string; name: string; theme: ThemeJson | null };
type ThemeJson = {
  colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
  font?: { heading?: string; body?: string };
  radius?: string;
};

export default function ThemePage() {
  const params = useParams<{ id: string }>();
  const [theme, setTheme] = useState<ThemeJson>({
    colors: { primary: "#2563eb", secondary: "#0ea5e9", bg: "#ffffff", fg: "#0f172a" },
    font: { heading: "Inter", body: "Inter" },
    radius: "0.75rem",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api<Site>(`/api/v1/sites/${params.id}`).then((s) => {
      if (s.theme && Object.keys(s.theme).length > 0) setTheme(s.theme);
    });
  }, [params.id]);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/v1/sites/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ theme }),
      });
      setStatus("Tersimpan ✓");
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function color(name: "primary" | "secondary" | "bg" | "fg") {
    return theme.colors?.[name] ?? "#000000";
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Warna</h2>
        {(["primary", "secondary", "bg", "fg"] as const).map((k) => (
          <div key={k} className="flex items-center justify-between">
            <label className="text-sm capitalize">{k}</label>
            <input
              type="color"
              value={color(k)}
              onChange={(e) =>
                setTheme((t) => ({ ...t, colors: { ...(t.colors ?? {}), [k]: e.target.value } }))
              }
              className="h-9 w-16 rounded border border-slate-200"
            />
          </div>
        ))}

        <h2 className="mt-6 font-semibold">Font</h2>
        <div>
          <label className="block text-sm">Heading</label>
          <input
            value={theme.font?.heading ?? ""}
            onChange={(e) => setTheme((t) => ({ ...t, font: { ...(t.font ?? {}), heading: e.target.value } }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm">Body</label>
          <input
            value={theme.font?.body ?? ""}
            onChange={(e) => setTheme((t) => ({ ...t, font: { ...(t.font ?? {}), body: e.target.value } }))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <h2 className="mt-6 font-semibold">Radius</h2>
        <input
          value={theme.radius ?? ""}
          onChange={(e) => setTheme((t) => ({ ...t, radius: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />

        <div className="flex items-center justify-between pt-4">
          {status && <span className="text-xs text-slate-500">{status}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>

      <div
        className="rounded-xl border border-slate-200 p-6"
        style={{ background: color("bg"), color: color("fg"), borderRadius: theme.radius }}
      >
        <h2 className="text-2xl font-bold" style={{ fontFamily: theme.font?.heading }}>
          Preview Tema
        </h2>
        <p className="mt-2" style={{ fontFamily: theme.font?.body }}>
          Ini contoh teks body. Tombol primer dan sekunder tampil di bawah.
        </p>
        <div className="mt-4 flex gap-3">
          <span className="rounded px-3 py-1.5 text-white" style={{ background: color("primary"), borderRadius: theme.radius }}>
            Primer
          </span>
          <span className="rounded px-3 py-1.5 text-white" style={{ background: color("secondary"), borderRadius: theme.radius }}>
            Sekunder
          </span>
        </div>
      </div>
    </div>
  );
}
