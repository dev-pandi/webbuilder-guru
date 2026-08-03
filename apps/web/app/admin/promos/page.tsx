"use client";

// /admin/promos — CRUD kupon diskon. Simple list + create/edit dialog.
// Bahasa Indonesia; shadcn Dialog/Input/Button/Table.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { AlertCircle, Eye, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type Promo = {
  id: string;
  code: string;
  description: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  applies_to: "register" | "renew" | "both";
  allowed_tlds: string[];
  min_subtotal: number;
  max_discount: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number;
  max_uses_per_user: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminPromosPage() {
  const [items, setItems] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Promo | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const list = await api<Promo[]>("/api/v1/admin/promos");
      setItems(list ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onDelete(p: Promo) {
    if (!confirm(`Hapus promo ${p.code}?`)) return;
    try {
      await api(`/api/v1/admin/promos/${p.id}`, { method: "DELETE" });
      toast.success("Promo dihapus");
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
            <Tag className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Promo</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Kupon diskon untuk register / renew domain. Diaktifkan user via
            input di wizard checkout.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="size-4" />
          Tambah promo
        </Button>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <CardContent className={loading ? "p-0 opacity-60" : "p-0"}>
          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat…
            </div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Belum ada promo. Klik <strong>Tambah promo</strong> untuk mulai.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Diskon</TableHead>
                  <TableHead>Berlaku</TableHead>
                  <TableHead>Pemakaian</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-mono font-semibold">{p.code}</div>
                      {p.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {p.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.discount_type === "percent"
                        ? `${p.discount_value}%`
                        : formatIDR(p.discount_value)}
                      {p.max_discount > 0 && p.discount_type === "percent" && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Max {formatIDR(p.max_discount)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{appliesToLabel(p.applies_to)}</div>
                      {p.allowed_tlds.length > 0 && (
                        <div className="mt-0.5">
                          TLD: {p.allowed_tlds.map((t) => `.${t}`).join(", ")}
                        </div>
                      )}
                      {p.valid_until && (
                        <div className="mt-0.5">
                          sampai {formatDate(p.valid_until)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Total: {p.max_uses ?? "∞"} · Per-user: {p.max_uses_per_user}
                    </TableCell>
                    <TableCell>
                      {p.active ? (
                        <Badge variant="success" className="text-[10px]">Aktif</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Non-aktif</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" asChild className="gap-1">
                          <Link href={`/admin/promos/${p.id}`} title="Lihat detail + riwayat">
                            <Eye className="size-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(p)}
                          className="gap-1"
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(p)}
                          className="gap-1 text-destructive hover:text-destructive"
                          title="Hapus"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <PromoDialog
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PromoDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Promo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = initial != null;
  const [form, setForm] = useState({
    code: initial?.code ?? "",
    description: initial?.description ?? "",
    discount_type: (initial?.discount_type ?? "percent") as "percent" | "fixed",
    discount_value: initial?.discount_value ?? 10,
    applies_to: (initial?.applies_to ?? "both") as "register" | "renew" | "both",
    allowed_tlds: (initial?.allowed_tlds ?? []).join(", "),
    min_subtotal: initial?.min_subtotal ?? 0,
    max_discount: initial?.max_discount ?? 0,
    valid_from: initial?.valid_from ?? "",
    valid_until: initial?.valid_until ?? "",
    max_uses: initial?.max_uses?.toString() ?? "",
    max_uses_per_user: initial?.max_uses_per_user ?? 1,
    active: initial?.active ?? true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        applies_to: form.applies_to,
        allowed_tlds: form.allowed_tlds
          .split(",")
          .map((t) => t.trim().toLowerCase().replace(/^\./, ""))
          .filter(Boolean),
        min_subtotal: Number(form.min_subtotal) || 0,
        max_discount: Number(form.max_discount) || 0,
        valid_from: form.valid_from || undefined,
        valid_until: form.valid_until || undefined,
        max_uses: form.max_uses ? Number(form.max_uses) : undefined,
        max_uses_per_user: Number(form.max_uses_per_user) || 1,
        active: form.active,
      };
      if (isEdit) {
        await api(`/api/v1/admin/promos/${initial!.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Promo diperbarui");
      } else {
        await api("/api/v1/admin/promos", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Promo dibuat");
      }
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
      } else {
        setErr((e as Error).message);
      }
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Promo" : "Tambah Promo"}</DialogTitle>
          <DialogDescription>
            Kupon diskon untuk register / renew domain.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="code">Kode</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                required
                disabled={isEdit}
                placeholder="mis. WELCOME10"
                className="font-mono uppercase"
              />
              {isEdit && (
                <p className="text-[11px] text-muted-foreground">
                  Kode tidak bisa diubah. Hapus + buat baru kalau perlu.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Deskripsi</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="mis. Diskon selamat datang"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="discount_type">Jenis</Label>
              <select
                id="discount_type"
                value={form.discount_type}
                onChange={(e) =>
                  setForm({ ...form, discount_type: e.target.value as "percent" | "fixed" })
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="percent">Persen (%)</option>
                <option value="fixed">Nominal (IDR)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="discount_value">Nilai</Label>
              <Input
                id="discount_value"
                type="number"
                min="1"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_discount">Max diskon</Label>
              <Input
                id="max_discount"
                type="number"
                min="0"
                value={form.max_discount}
                onChange={(e) => setForm({ ...form, max_discount: Number(e.target.value) })}
                placeholder="0 = tanpa cap"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="applies_to">Berlaku untuk</Label>
              <select
                id="applies_to"
                value={form.applies_to}
                onChange={(e) =>
                  setForm({ ...form, applies_to: e.target.value as "register" | "renew" | "both" })
                }
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="both">Register + Renew</option>
                <option value="register">Register saja</option>
                <option value="renew">Renew saja</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="allowed_tlds">
                TLD (opsional) <span className="text-xs text-muted-foreground">koma-separated</span>
              </Label>
              <Input
                id="allowed_tlds"
                value={form.allowed_tlds}
                onChange={(e) => setForm({ ...form, allowed_tlds: e.target.value })}
                placeholder="id, co.id, com — kosong = semua"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="min_subtotal">Min subtotal (IDR)</Label>
              <Input
                id="min_subtotal"
                type="number"
                min="0"
                value={form.min_subtotal}
                onChange={(e) => setForm({ ...form, min_subtotal: Number(e.target.value) })}
                placeholder="0 = tanpa minimum"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_uses_per_user">Max pakai per user</Label>
              <Input
                id="max_uses_per_user"
                type="number"
                min="1"
                value={form.max_uses_per_user}
                onChange={(e) =>
                  setForm({ ...form, max_uses_per_user: Number(e.target.value) })
                }
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="max_uses">Max pakai total</Label>
              <Input
                id="max_uses"
                type="number"
                min="1"
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                placeholder="kosong = unlimited"
              />
            </div>
            <div className="space-y-1.5 sm:pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="size-4 rounded border"
                />
                <span>Aktifkan promo</span>
              </label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="valid_from">Berlaku dari (opsional)</Label>
              <Input
                id="valid_from"
                type="datetime-local"
                value={toDatetimeLocal(form.valid_from)}
                onChange={(e) =>
                  setForm({ ...form, valid_from: fromDatetimeLocal(e.target.value) })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valid_until">Berlaku sampai (opsional)</Label>
              <Input
                id="valid_until"
                type="datetime-local"
                value={toDatetimeLocal(form.valid_until)}
                onChange={(e) =>
                  setForm({ ...form, valid_until: fromDatetimeLocal(e.target.value) })
                }
              />
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? "Simpan" : "Buat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatIDR(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function appliesToLabel(v: string): string {
  if (v === "register") return "Register saja";
  if (v === "renew") return "Renew saja";
  return "Register + Renew";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// datetime-local input format: "YYYY-MM-DDTHH:mm" tanpa timezone.
// Convert ke/dari RFC3339 supaya form input work + backend terima ISO string.
function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromDatetimeLocal(v: string): string {
  if (!v) return "";
  try {
    // Interpret local time → convert ke ISO (UTC).
    return new Date(v).toISOString();
  } catch {
    return "";
  }
}
