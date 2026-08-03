"use client";

// /admin/settings — system_settings key-value admin. Grouped by namespace:
//   tax.*   → PPN (rate, label, enabled toggle)
//   brand.* → brand info (name, company, address, tax_id, support email/phone)
//
// Setiap key edit-in-place via PATCH /api/v1/admin/settings/:key.

import { useEffect, useState } from "react";
import { Loader2, Save, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Setting = {
  key: string;
  value: string;
  description: string;
  updated_at: string;
};

// Grouping supaya UI rapi. Setiap group = 1 Card dengan field editable.
const GROUPS: { title: string; description: string; keys: string[] }[] = [
  {
    title: "Pajak (PPN)",
    description: "Konfigurasi PPN untuk invoice. Rate ditangkap saat invoice diterbitkan — perubahan tidak retroaktif.",
    keys: ["tax.ppn_enabled", "tax.ppn_rate", "tax.ppn_label"],
  },
  {
    title: "Brand",
    description: "Nama brand + kontak untuk header, footer, dan invoice.",
    keys: [
      "brand.name",
      "brand.company_name",
      "brand.company_address",
      "brand.tax_id",
      "brand.support_email",
      "brand.support_phone",
    ],
  },
];

// Label per key untuk UI Indonesia.
const LABELS: Record<string, string> = {
  "tax.ppn_enabled": "Aktifkan PPN",
  "tax.ppn_rate": "Rate PPN (desimal, mis. 0.11 = 11%)",
  "tax.ppn_label": "Label PPN di invoice",
  "brand.name": "Nama Brand",
  "brand.company_name": "Nama Perusahaan (badan hukum)",
  "brand.company_address": "Alamat Perusahaan",
  "brand.tax_id": "NPWP",
  "brand.support_email": "Email Support",
  "brand.support_phone": "Nomor Telepon Support",
};

export default function AdminSettingsPage() {
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: Setting[] }>("/api/v1/admin/settings");
      setItems(res.items || []);
      setEdits({}); // reset local edits
    } catch (e: unknown) {
      toast.error("Gagal load settings", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function currentValue(key: string): string {
    if (key in edits) return edits[key];
    const s = items.find((i) => i.key === key);
    return s?.value ?? "";
  }

  function isDirty(key: string): boolean {
    if (!(key in edits)) return false;
    const s = items.find((i) => i.key === key);
    return (s?.value ?? "") !== edits[key];
  }

  async function saveOne(key: string) {
    const value = edits[key];
    if (value === undefined) return;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await api(`/api/v1/admin/settings/${encodeURIComponent(key)}`, {
        method: "PATCH",
        body: JSON.stringify({ value }),
      });
      toast.success("Tersimpan ✓", { description: LABELS[key] || key });
      // Refresh items untuk pick up updated_at.
      await load();
    } catch (e: unknown) {
      toast.error("Gagal simpan", { description: (e as Error).message });
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  }

  const isEnabled = (key: string) => {
    const v = currentValue(key).toLowerCase();
    return v === "true" || v === "1" || v === "yes" || v === "on";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-semibold">Pengaturan Sistem</h1>
          <p className="text-sm text-muted-foreground">
            Konfigurasi PPN + brand yang muncul di invoice dan email.
          </p>
        </div>
      </div>

      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {group.keys.map((key, idx) => {
              const setting = items.find((i) => i.key === key);
              const isBool = key.endsWith("_enabled");
              return (
                <div key={key}>
                  {idx > 0 && <Separator className="my-4" />}
                  <div className="space-y-1.5">
                    <Label htmlFor={key}>{LABELS[key] || key}</Label>
                    {isBool ? (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled(key)}
                          onClick={() => setEdits((e) => ({ ...e, [key]: isEnabled(key) ? "false" : "true" }))}
                          className={`inline-flex h-6 w-11 items-center rounded-full transition ${
                            isEnabled(key) ? "bg-primary" : "bg-muted"
                          }`}
                        >
                          <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                              isEnabled(key) ? "translate-x-5" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        <span className="text-sm text-muted-foreground">
                          {isEnabled(key) ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>
                    ) : (
                      <Input
                        id={key}
                        value={currentValue(key)}
                        onChange={(e) => setEdits((s) => ({ ...s, [key]: e.target.value }))}
                        placeholder={setting?.value || ""}
                      />
                    )}
                    {setting?.description && (
                      <p className="text-xs text-muted-foreground">{setting.description}</p>
                    )}
                    {isDirty(key) && (
                      <Button
                        size="sm"
                        onClick={() => saveOne(key)}
                        disabled={saving[key]}
                        className="mt-2"
                      >
                        {saving[key] ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Simpan
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
