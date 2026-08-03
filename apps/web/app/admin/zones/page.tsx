"use client";

// /admin/zones — CRUD TLD catalog. Kolom: TLD, Label, Active, Require Doc,
// Auto Approved, NIK Auto, Min/Max Years, Sort Order.

import { useEffect, useState } from "react";
import { Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Zone = {
  id: string;
  tld: string;
  label: string;
  active: boolean;
  require_document: boolean;
  auto_approved: boolean;
  nik_auto_approved: boolean;
  min_years: number;
  max_years: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type FormState = {
  tld: string;
  label: string;
  active: boolean;
  require_document: boolean;
  auto_approved: boolean;
  nik_auto_approved: boolean;
  min_years: number;
  max_years: number;
  sort_order: number;
};

const emptyForm = (): FormState => ({
  tld: "",
  label: "",
  active: true,
  require_document: false,
  auto_approved: true,
  nik_auto_approved: false,
  min_years: 1,
  max_years: 10,
  sort_order: 0,
});

export default function AdminZonesPage() {
  const [items, setItems] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api<{ items: Zone[] }>("/api/v1/admin/zones");
      setItems(res.items || []);
    } catch (e: unknown) {
      toast.error("Gagal load zones", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(z: Zone) {
    setEditing(z);
    setForm({
      tld: z.tld,
      label: z.label,
      active: z.active,
      require_document: z.require_document,
      auto_approved: z.auto_approved,
      nik_auto_approved: z.nik_auto_approved,
      min_years: z.min_years,
      max_years: z.max_years,
      sort_order: z.sort_order,
    });
    setModalOpen(true);
  }

  async function save() {
    // Validation client-side.
    if (!form.tld.trim()) {
      toast.error("TLD wajib diisi");
      return;
    }
    if (form.tld.startsWith(".")) {
      toast.error("TLD tanpa titik di depan (contoh: 'id' bukan '.id')");
      return;
    }
    if (form.min_years < 1) {
      toast.error("Min years minimal 1");
      return;
    }
    if (form.max_years < form.min_years) {
      toast.error("Max years tidak boleh kurang dari min years");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api(`/api/v1/admin/zones/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            label: form.label || undefined,
            active: form.active,
            require_document: form.require_document,
            auto_approved: form.auto_approved,
            nik_auto_approved: form.nik_auto_approved,
            min_years: form.min_years,
            max_years: form.max_years,
            sort_order: form.sort_order,
          }),
        });
        toast.success(`Zone .${form.tld} diperbarui`);
      } else {
        await api("/api/v1/admin/zones", {
          method: "POST",
          body: JSON.stringify(form),
        });
        toast.success(`Zone .${form.tld} dibuat`);
      }
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error("Gagal simpan", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function del(z: Zone) {
    if (!confirm(`Hapus zone .${z.tld}? Ini akan mempengaruhi wizard cari domain.`)) return;
    try {
      await api(`/api/v1/admin/zones/${z.id}`, { method: "DELETE" });
      toast.success(`Zone .${z.tld} dihapus`);
      await load();
    } catch (e: unknown) {
      toast.error("Gagal hapus", { description: (e as Error).message });
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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <MapPin className="mt-1 h-6 w-6" />
          <div>
            <h1 className="text-2xl font-semibold">Zones (TLD Catalog)</h1>
            <p className="text-sm text-muted-foreground">
              TLD yang bisa dibeli user via wizard. Zone yang tidak active tidak akan tampil.
            </p>
          </div>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" />
          Tambah Zone
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>TLD</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Dokumen</TableHead>
              <TableHead>Auto Approve</TableHead>
              <TableHead>NIK Auto</TableHead>
              <TableHead className="text-right">Years</TableHead>
              <TableHead className="text-right">Sort</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Belum ada zone. Klik "Tambah Zone" untuk mulai.
                </TableCell>
              </TableRow>
            )}
            {items.map((z) => (
              <TableRow key={z.id}>
                <TableCell className="font-mono font-medium">.{z.tld}</TableCell>
                <TableCell>{z.label}</TableCell>
                <TableCell>
                  <Badge variant={z.active ? "success" : "secondary"}>
                    {z.active ? "active" : "inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {z.require_document ? (
                    <Badge variant="warning">wajib</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {z.auto_approved ? "✓" : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {z.nik_auto_approved ? "✓" : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {z.min_years}–{z.max_years}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{z.sort_order}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(z)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del(z)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit .${editing.tld}` : "Tambah Zone Baru"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "TLD tidak bisa diubah setelah dibuat — hapus + create baru kalau perlu."
                : "Contoh TLD: 'id', 'co.id', 'com' (tanpa titik di depan)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tld">TLD</Label>
                <Input
                  id="tld"
                  value={form.tld}
                  onChange={(e) => setForm({ ...form, tld: e.target.value })}
                  placeholder="id"
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder=".id"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min_years">Min Tahun</Label>
                <Input
                  id="min_years"
                  type="number"
                  min={1}
                  value={form.min_years}
                  onChange={(e) => setForm({ ...form, min_years: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_years">Max Tahun</Label>
                <Input
                  id="max_years"
                  type="number"
                  min={1}
                  value={form.max_years}
                  onChange={(e) => setForm({ ...form, max_years: parseInt(e.target.value) || 10 })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sort_order">Sort Order (untuk urutan tampil)</Label>
              <Input
                id="sort_order"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <CheckboxField
                id="active"
                label="Active (tampil di wizard)"
                checked={form.active}
                onChange={(v) => setForm({ ...form, active: v })}
              />
              <CheckboxField
                id="require_document"
                label="Butuh dokumen (KTP/NPWP untuk .id family)"
                checked={form.require_document}
                onChange={(v) => setForm({ ...form, require_document: v })}
              />
              <CheckboxField
                id="auto_approved"
                label="Auto-approved (skip admin review)"
                checked={form.auto_approved}
                onChange={(v) => setForm({ ...form, auto_approved: v })}
              />
              <CheckboxField
                id="nik_auto_approved"
                label="NIK cukup (skip upload dokumen fisik)"
                checked={form.nik_auto_approved}
                onChange={(v) => setForm({ ...form, nik_auto_approved: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editing ? "Update" : "Buat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
