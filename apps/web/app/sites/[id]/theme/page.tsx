"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FontPicker } from "@/components/FontPicker";

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
      toast.success("Tema tersimpan");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function color(name: "primary" | "secondary" | "bg" | "fg") {
    return theme.colors?.[name] ?? "#000000";
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Warna</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["primary", "secondary", "bg", "fg"] as const).map((k) => (
            <div key={k} className="flex items-center justify-between">
              <Label className="capitalize">{k}</Label>
              <input
                type="color"
                value={color(k)}
                onChange={(e) =>
                  setTheme((t) => ({
                    ...t,
                    colors: { ...(t.colors ?? {}), [k]: e.target.value },
                  }))
                }
                className="h-9 w-16 rounded border border-input"
              />
            </div>
          ))}

          <div className="border-t pt-4">
            <CardTitle className="mb-3 text-base">Font</CardTitle>
            <div className="space-y-3">
              <FontPicker
                label="Heading"
                value={theme.font?.heading ?? ""}
                onChange={(name) =>
                  setTheme((t) => ({ ...t, font: { ...(t.font ?? {}), heading: name } }))
                }
              />
              <FontPicker
                label="Body"
                value={theme.font?.body ?? ""}
                onChange={(name) =>
                  setTheme((t) => ({ ...t, font: { ...(t.font ?? {}), body: name } }))
                }
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <Label className="mb-1.5 block">Radius</Label>
            <Input
              value={theme.radius ?? ""}
              onChange={(e) => setTheme((t) => ({ ...t, radius: e.target.value }))}
              placeholder="0.5rem"
            />
          </div>

          <div className="flex items-center justify-end border-t pt-4">
            <Button onClick={save} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card
        className="p-6"
        style={{ background: color("bg"), color: color("fg"), borderRadius: theme.radius }}
      >
        <h2 className="text-2xl font-bold" style={{ fontFamily: theme.font?.heading }}>
          Preview Tema
        </h2>
        <p className="mt-2" style={{ fontFamily: theme.font?.body }}>
          Ini contoh teks body. Tombol primer dan sekunder tampil di bawah.
        </p>
        <div className="mt-4 flex gap-3">
          <span
            className="rounded px-3 py-1.5 text-white"
            style={{ background: color("primary"), borderRadius: theme.radius }}
          >
            Primer
          </span>
          <span
            className="rounded px-3 py-1.5 text-white"
            style={{ background: color("secondary"), borderRadius: theme.radius }}
          >
            Sekunder
          </span>
        </div>
      </Card>
    </div>
  );
}
