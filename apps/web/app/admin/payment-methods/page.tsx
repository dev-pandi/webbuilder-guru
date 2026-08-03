"use client";

// /admin/payment-methods — CRUD payment gateway config.
// List card per method, edit config JSON per type via modal.

import { useEffect, useState } from "react";
import { CreditCard, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PaymentMethod = {
  id: string;
  code: string;
  label: string;
  type: "gateway" | "manual" | "wallet";
  enabled: boolean;
  config: Record<string, unknown>;
  sort_order: number;
  updated_at: string;
};

// Per-type config field schema — driver untuk render form yang tepat.
type FieldDef = { key: string; label: string; type: "text" | "password" | "bool" | "url" | "textarea"; placeholder?: string };

const CONFIG_SCHEMA: Record<string, FieldDef[]> = {
  midtrans: [
    { key: "server_key", label: "Server Key", type: "password", placeholder: "SB-Mid-server-..." },
    { key: "client_key", label: "Client Key", type: "password", placeholder: "SB-Mid-client-..." },
    { key: "is_production", label: "Production mode", type: "bool" },
    { key: "snap_url", label: "Snap URL (opsional, auto-derive kalau kosong)", type: "url" },
  ],
  paylabs: [
    { key: "merchant_id", label: "Merchant ID", type: "password", placeholder: "MC-..." },
    { key: "api_key", label: "API Key", type: "password" },
    { key: "endpoint", label: "Endpoint URL", type: "url", placeholder: "https://api.paylabs.co.id/v1" },
  ],
  manual_bank: [
    { key: "instructions_md", label: "Instruksi tambahan (markdown)", type: "textarea", placeholder: "Setelah transfer, upload bukti di dashboard." },
  ],
  deposit_wallet: [
    { key: "topup_min", label: "Minimum top-up (IDR)", type: "text", placeholder: "100000" },
    { key: "topup_max", label: "Maximum top-up (IDR)", type: "text", placeholder: "100000000" },
  ],
};

export default function AdminPaymentMethodsPage() {
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formEnabled, setFormEnabled] = useState(false);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  // Manual bank: list of banks structured — separate state.
  const [formBanks, setFormBanks] = useState<{ name: string; account_number: string; account_holder: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: PaymentMethod[] }>("/api/v1/admin/payment-methods");
      setItems(res.items || []);
    } catch (e: unknown) {
      toast.error("Gagal load payment methods", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function openEdit(m: PaymentMethod) {
    setEditing(m);
    setFormLabel(m.label);
    setFormEnabled(m.enabled);
    setFormSortOrder(m.sort_order);
    // Config: convert non-bool values to string for input state.
    const cfg: Record<string, string> = {};
    Object.entries(m.config || {}).forEach(([k, v]) => {
      if (k === "banks") return; // handled separately
      if (typeof v === "boolean") {
        cfg[k] = v ? "true" : "false";
      } else if (v === null || v === undefined) {
        cfg[k] = "";
      } else {
        cfg[k] = String(v);
      }
    });
    setFormConfig(cfg);
    // Banks (manual_bank only).
    const banks = (m.config?.banks as Array<{ name: string; account_number: string; account_holder: string }>) || [];
    setFormBanks(banks.length > 0 ? banks : []);
  }

  function closeEdit() {
    setEditing(null);
    setFormConfig({});
    setFormBanks([]);
  }

  function buildConfigPayload(): Record<string, unknown> {
    if (!editing) return {};
    const schema = CONFIG_SCHEMA[editing.code] || [];
    const out: Record<string, unknown> = {};
    // Preserve existing keys that aren't in schema (custom gateway).
    Object.entries(editing.config || {}).forEach(([k, v]) => {
      out[k] = v;
    });
    // Override with form values.
    for (const field of schema) {
      const v = formConfig[field.key];
      if (field.type === "bool") {
        out[field.key] = v === "true";
      } else if (v === "") {
        // Only preserve if there's existing value; otherwise omit.
        if (editing.config?.[field.key] !== undefined) {
          out[field.key] = editing.config[field.key];
        }
      } else if (field.key === "topup_min" || field.key === "topup_max") {
        // Coerce to number kalau bisa.
        const n = parseInt(v, 10);
        out[field.key] = isNaN(n) ? v : n;
      } else {
        out[field.key] = v;
      }
    }
    // Manual bank: replace banks array.
    if (editing.code === "manual_bank") {
      out.banks = formBanks.filter((b) => b.name || b.account_number);
    }
    return out;
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/api/v1/admin/payment-methods/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: formLabel,
          enabled: formEnabled,
          sort_order: formSortOrder,
          config: buildConfigPayload(),
        }),
      });
      toast.success("Tersimpan ✓");
      closeEdit();
      await load();
    } catch (e: unknown) {
      toast.error("Gagal simpan", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(m: PaymentMethod) {
    try {
      await api(`/api/v1/admin/payment-methods/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !m.enabled }),
      });
      toast.success(`${m.label} ${!m.enabled ? "aktif" : "nonaktif"}`);
      await load();
    } catch (e: unknown) {
      toast.error("Gagal toggle", { description: (e as Error).message });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-1 h-6 w-6" />
        <div>
          <h1 className="text-2xl font-semibold">Payment Methods</h1>
          <p className="text-sm text-muted-foreground">
            Konfigurasi payment gateway dan metode pembayaran. Hanya method aktif yang muncul di wizard checkout user.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {items.map((m) => (
          <Card key={m.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{m.label}</CardTitle>
                  <Badge variant={m.enabled ? "success" : "secondary"}>
                    {m.enabled ? "Aktif" : "Nonaktif"}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {m.type}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Code: <code className="text-xs">{m.code}</code>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleEnabled(m)}>
                  {m.enabled ? "Nonaktifkan" : "Aktifkan"}
                </Button>
                <Button size="sm" onClick={() => openEdit(m)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Config
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ConfigPreview code={m.code} config={m.config} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && closeEdit()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Konfigurasi {editing?.label}</DialogTitle>
            <DialogDescription>
              Credentials tersimpan di server terenkripsi. Field password tampak sebagai *** di list.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="label">Label yang tampil ke user</Label>
                <Input
                  id="label"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="enabled" className="cursor-pointer">
                  Aktifkan method ini
                </Label>
              </div>

              {(CONFIG_SCHEMA[editing.code] || []).map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  {field.type === "bool" ? (
                    <div className="flex items-center gap-2">
                      <input
                        id={field.key}
                        type="checkbox"
                        checked={formConfig[field.key] === "true"}
                        onChange={(e) => setFormConfig({ ...formConfig, [field.key]: e.target.checked ? "true" : "false" })}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-muted-foreground">
                        {formConfig[field.key] === "true" ? "Yes" : "No"}
                      </span>
                    </div>
                  ) : field.type === "textarea" ? (
                    <textarea
                      id={field.key}
                      className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formConfig[field.key] || ""}
                      onChange={(e) => setFormConfig({ ...formConfig, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <Input
                      id={field.key}
                      type={field.type === "password" ? "password" : "text"}
                      value={formConfig[field.key] || ""}
                      onChange={(e) => setFormConfig({ ...formConfig, [field.key]: e.target.value })}
                      placeholder={field.placeholder}
                    />
                  )}
                </div>
              ))}

              {editing.code === "manual_bank" && (
                <div className="space-y-2">
                  <Label>Bank Accounts</Label>
                  {formBanks.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <Input
                        placeholder="Nama Bank"
                        value={b.name}
                        onChange={(e) => {
                          const next = [...formBanks];
                          next[i].name = e.target.value;
                          setFormBanks(next);
                        }}
                      />
                      <Input
                        placeholder="Nomor Rekening"
                        value={b.account_number}
                        onChange={(e) => {
                          const next = [...formBanks];
                          next[i].account_number = e.target.value;
                          setFormBanks(next);
                        }}
                      />
                      <Input
                        placeholder="Atas Nama"
                        value={b.account_holder}
                        onChange={(e) => {
                          const next = [...formBanks];
                          next[i].account_holder = e.target.value;
                          setFormBanks(next);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFormBanks(formBanks.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFormBanks([...formBanks, { name: "", account_number: "", account_holder: "" }])}
                  >
                    + Bank
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit} disabled={saving}>
              Batal
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ConfigPreview({ code, config }: { code: string; config: Record<string, unknown> }) {
  if (!config || Object.keys(config).length === 0) {
    return <p className="text-xs text-muted-foreground">Belum dikonfigurasi.</p>;
  }
  if (code === "manual_bank") {
    const banks = (config.banks as Array<{ name: string; account_number: string }>) || [];
    return (
      <div className="text-xs text-muted-foreground">
        {banks.length > 0 ? `${banks.length} bank(s): ${banks.map((b) => b.name).join(", ")}` : "Belum ada rekening bank"}
      </div>
    );
  }
  const preview = Object.entries(config)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === "boolean" ? v : "***"}`)
    .join(" · ");
  return <p className="text-xs text-muted-foreground font-mono">{preview || "—"}</p>;
}
