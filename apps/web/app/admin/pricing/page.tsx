"use client";

// /admin/pricing — CRUD platform_prices per TLD. Self-sufficient: harga
// wholesale + retail di-input manual oleh admin (sumber otoritatif = local
// DB). Legacy sync dari external registrar-api sudah dihapus di Phase 3.

import { useEffect, useState } from "react";
import {
  AlertCircle,
  DollarSign,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type PlatformPrice = {
  id: string;
  tld: string;
  retail_register_price: number;
  retail_renew_price: number;
  wholesale_register_price?: number | null;
  wholesale_renew_price?: number | null;
  currency: string;
  updated_at: string;
};

export default function AdminPricingPage() {
  const [items, setItems] = useState<PlatformPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformPrice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<PlatformPrice[]>("/api/v1/admin/pricing/platform");
      setItems(res ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function remove(id: string, tld: string) {
    if (!confirm(`Hapus pricing untuk .${tld}?`)) return;
    try {
      await api(`/api/v1/admin/pricing/platform/${id}`, { method: "DELETE" });
      toast.success("Pricing dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <DollarSign className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Pricing Platform</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Harga retail (client self-purchase) + wholesale (cost dari registrar,
            di-debit wallet reseller/agent).
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          Tambah TLD
        </Button>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>TLD</TableHead>
                <TableHead>Retail Register</TableHead>
                <TableHead>Retail Renew</TableHead>
                <TableHead>Wholesale Register</TableHead>
                <TableHead>Wholesale Renew</TableHead>
                <TableHead className="w-0">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={loading ? "opacity-60" : ""}>
              {loading && items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <DollarSign className="size-8 opacity-30" />
                      <p className="text-sm font-medium">Belum ada pricing</p>
                      <p className="text-xs">
                        Klik <b>Tambah TLD</b> untuk mulai konfigurasi harga.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-medium">.{p.tld}</TableCell>
                    <TableCell>{fmt(p.retail_register_price, p.currency)}</TableCell>
                    <TableCell>{fmt(p.retail_renew_price, p.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.wholesale_register_price != null ? fmt(p.wholesale_register_price, p.currency) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.wholesale_renew_price != null ? fmt(p.wholesale_renew_price, p.currency) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(p);
                            setDialogOpen(true);
                          }}
                          className="gap-1"
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(p.id, p.tld)}
                          className="gap-1 text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <UpsertDialog
        open={dialogOpen}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

function UpsertDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: PlatformPrice | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    tld: "",
    retail_register_price: "",
    retail_renew_price: "",
    wholesale_register_price: "",
    wholesale_renew_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        tld: initial.tld,
        retail_register_price: String(initial.retail_register_price),
        retail_renew_price: String(initial.retail_renew_price),
        wholesale_register_price:
          initial.wholesale_register_price != null ? String(initial.wholesale_register_price) : "",
        wholesale_renew_price:
          initial.wholesale_renew_price != null ? String(initial.wholesale_renew_price) : "",
      });
    } else {
      setForm({
        tld: "",
        retail_register_price: "",
        retail_renew_price: "",
        wholesale_register_price: "",
        wholesale_renew_price: "",
      });
    }
    setErr(null);
  }, [open, initial]);

  async function submit() {
    setErr(null);
    const tld = form.tld.trim().toLowerCase().replace(/^\./, "");
    if (!tld) {
      setErr("TLD wajib diisi");
      return;
    }
    const retReg = Number(form.retail_register_price);
    const retRen = Number(form.retail_renew_price);
    if (!Number.isFinite(retReg) || retReg < 0 || !Number.isFinite(retRen) || retRen < 0) {
      setErr("Harga retail harus angka >= 0");
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/admin/pricing/platform", {
        method: "POST",
        body: JSON.stringify({
          tld,
          retail_register_price: retReg,
          retail_renew_price: retRen,
          wholesale_register_price: form.wholesale_register_price
            ? Number(form.wholesale_register_price)
            : undefined,
          wholesale_renew_price: form.wholesale_renew_price
            ? Number(form.wholesale_renew_price)
            : undefined,
        }),
      });
      toast.success("Pricing tersimpan");
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? `Edit Pricing .${initial.tld}` : "Tambah Pricing TLD"}
          </DialogTitle>
          <DialogDescription>
            Harga dalam IDR (rupiah, tanpa desimal). Wholesale opsional —
            kalau kosong, wallet debit reseller/agent fallback ke retail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tld">TLD *</Label>
            <Input
              id="tld"
              value={form.tld}
              onChange={(e) => setForm((f) => ({ ...f, tld: e.target.value }))}
              placeholder="co.id"
              disabled={!!initial}
              className="font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Tanpa titik depan. Contoh: <span className="font-mono">co.id</span>,{" "}
              <span className="font-mono">com</span>
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rr">Retail Register (IDR) *</Label>
              <Input
                id="rr"
                type="number"
                min={0}
                value={form.retail_register_price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, retail_register_price: e.target.value }))
                }
                placeholder="100000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rrn">Retail Renew (IDR) *</Label>
              <Input
                id="rrn"
                type="number"
                min={0}
                value={form.retail_renew_price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, retail_renew_price: e.target.value }))
                }
                placeholder="100000"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wr">Wholesale Register (IDR)</Label>
              <Input
                id="wr"
                type="number"
                min={0}
                value={form.wholesale_register_price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wholesale_register_price: e.target.value }))
                }
                placeholder="55000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wrn">Wholesale Renew (IDR)</Label>
              <Input
                id="wrn"
                type="number"
                min={0}
                value={form.wholesale_renew_price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, wholesale_renew_price: e.target.value }))
                }
                placeholder="55000"
              />
            </div>
          </div>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={submit} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-3.5 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmt(amount: number, currency: string): string {
  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return `${currency} ${amount.toLocaleString("id-ID")}`;
}
