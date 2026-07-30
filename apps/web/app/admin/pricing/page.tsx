"use client";

// /admin/pricing — CRUD platform_prices per TLD (Phase 3.10).
// Kolom: TLD | Retail Register | Retail Renew | Wholesale Register | Wholesale Renew | Aksi.
// Wholesale nullable (fetch dari registrar; admin isi manual sekarang).

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  DollarSign,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
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

// Shape dari GET /admin/pricing/registrar-tlds — daftar TLD yang reseller
// boleh handle + harga wholesale awal, plus flag cross-check apakah sudah
// di-import ke platform_prices lokal.
type RegistrarTLD = {
  tld: string;
  currency: string;
  wholesale_register_price: number;
  wholesale_renew_price: number;
  suggested_retail_register_price: number;
  suggested_retail_renew_price: number;
  require_document: boolean;
  auto_approved: boolean;
  nik_auto_approved: boolean;
  local_exists: boolean;
  local_out_of_sync: boolean;
};

// Initial values yang dikirim ke UpsertDialog waktu admin klik "Import" —
// pre-fill semua field + tandai TLD sebagai locked (bukan edit row lokal).
type InitialForm = {
  tld: string;
  retail_register_price: number;
  retail_renew_price: number;
  wholesale_register_price: number;
  wholesale_renew_price: number;
};

export default function AdminPricingPage() {
  const [items, setItems] = useState<PlatformPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlatformPrice | null>(null);
  const [initialForm, setInitialForm] = useState<InitialForm | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [registrarTLDs, setRegistrarTLDs] = useState<RegistrarTLD[] | null>(null);
  const [registrarErr, setRegistrarErr] = useState<string | null>(null);
  const [registrarLoading, setRegistrarLoading] = useState(false);

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

  async function loadRegistrarTLDs() {
    setRegistrarLoading(true);
    setRegistrarErr(null);
    try {
      const res = await api<RegistrarTLD[]>("/api/v1/admin/pricing/registrar-tlds");
      setRegistrarTLDs(res ?? []);
    } catch (e) {
      // 503 = registrar client belum di-wire — beda pesan supaya admin tahu
      // ini bukan network error tapi config missing.
      if (e instanceof ApiError && e.status === 503) {
        setRegistrarErr(
          "Registrar-api belum terhubung. Set REGISTRAR_API_URL + credentials di .env untuk enable sync.",
        );
      } else {
        setRegistrarErr((e as Error).message);
      }
      setRegistrarTLDs([]);
    } finally {
      setRegistrarLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    loadRegistrarTLDs();
  }, []);

  function importFromRegistrar(t: RegistrarTLD) {
    setInitialForm({
      tld: t.tld,
      retail_register_price: t.suggested_retail_register_price,
      retail_renew_price: t.suggested_retail_renew_price,
      wholesale_register_price: t.wholesale_register_price,
      wholesale_renew_price: t.wholesale_renew_price,
    });
    setEditing(null);
    setDialogOpen(true);
  }

  function syncWholesale(t: RegistrarTLD, existing: PlatformPrice) {
    // Update wholesale-only — retail biarkan sesuai admin markup sebelumnya.
    setInitialForm({
      tld: existing.tld,
      retail_register_price: existing.retail_register_price,
      retail_renew_price: existing.retail_renew_price,
      wholesale_register_price: t.wholesale_register_price,
      wholesale_renew_price: t.wholesale_renew_price,
    });
    setEditing(existing);
    setDialogOpen(true);
  }

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
            setInitialForm(null);
            setDialogOpen(true);
          }}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          Tambah TLD
        </Button>
      </div>

      <RegistrarSyncCard
        tlds={registrarTLDs}
        loading={registrarLoading}
        err={registrarErr}
        localByTLD={Object.fromEntries(items.map((p) => [p.tld, p]))}
        onReload={loadRegistrarTLDs}
        onImport={importFromRegistrar}
        onSyncWholesale={syncWholesale}
      />

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
        prefill={initialForm}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          setInitialForm(null);
          refresh();
          // Sync ulang badge "sudah imported" pasca upsert.
          loadRegistrarTLDs();
        }}
      />
    </div>
  );
}

function RegistrarSyncCard({
  tlds,
  loading,
  err,
  localByTLD,
  onReload,
  onImport,
  onSyncWholesale,
}: {
  tlds: RegistrarTLD[] | null;
  loading: boolean;
  err: string | null;
  localByTLD: Record<string, PlatformPrice>;
  onReload: () => void;
  onImport: (t: RegistrarTLD) => void;
  onSyncWholesale: (t: RegistrarTLD, existing: PlatformPrice) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Cloud className="size-4 text-primary" />
              TLD dari Registrar
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Daftar TLD yang reseller boleh handle + harga wholesale awal.
              Sumber: <code>POST /reseller/domain/check</code> di registrar-api.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onReload}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Sinkron ulang
          </Button>
        </div>

        {err && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="size-3.5 shrink-0 translate-y-0.5" />
            <span>{err}</span>
          </div>
        )}

        {!err && tlds !== null && tlds.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">
            Registrar tidak mengembalikan TLD apa pun. Cek <code>allowed_zones</code>{" "}
            reseller di admin registrar-api.
          </p>
        )}

        {tlds && tlds.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tlds.map((t) => {
              const existing = localByTLD[t.tld];
              return (
                <RegistrarTLDChip
                  key={t.tld}
                  tld={t}
                  existing={existing}
                  onImport={() => onImport(t)}
                  onSync={() => existing && onSyncWholesale(t, existing)}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RegistrarTLDChip({
  tld,
  existing,
  onImport,
  onSync,
}: {
  tld: RegistrarTLD;
  existing?: PlatformPrice;
  onImport: () => void;
  onSync: () => void;
}) {
  const wholesaleFmt = fmt(tld.wholesale_register_price, tld.currency);
  if (!existing) {
    // Belum di-import — button "Import" pre-fill dialog dengan wholesale +
    // retail suggested (wholesale * 1.2).
    return (
      <button
        type="button"
        onClick={onImport}
        className="group inline-flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-xs transition-colors hover:border-primary hover:bg-primary/5"
        title={`Reg: ${wholesaleFmt} · Ren: ${fmt(tld.wholesale_renew_price, tld.currency)}`}
      >
        <span className="font-mono font-medium">.{tld.tld}</span>
        <span className="text-muted-foreground">{wholesaleFmt}</span>
        {tld.require_document && (
          <FileText className="size-3 text-amber-600" />
        )}
        <Plus className="size-3 opacity-60 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }
  if (tld.local_out_of_sync) {
    return (
      <button
        type="button"
        onClick={onSync}
        className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 transition-colors hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200"
        title={`Wholesale registrar: ${wholesaleFmt}. Sync untuk update.`}
      >
        <span className="font-mono font-medium">.{tld.tld}</span>
        <AlertCircle className="size-3" />
        <span>Wholesale beda</span>
      </button>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
      title="Sudah imported dan wholesale sesuai registrar"
    >
      <span className="font-mono font-medium">.{tld.tld}</span>
      <CheckCircle2 className="size-3" />
    </span>
  );
}

function UpsertDialog({
  open,
  initial,
  prefill,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: PlatformPrice | null;
  prefill: InitialForm | null;
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
    // Prefill dari registrar sync menang atas both initial + kosong — kalau
    // ada initial (edit existing), gabungkan: TLD locked ke initial, wholesale
    // di-override dari registrar, retail biarkan sesuai state initial.
    if (prefill) {
      setForm({
        tld: prefill.tld,
        retail_register_price: String(prefill.retail_register_price),
        retail_renew_price: String(prefill.retail_renew_price),
        wholesale_register_price: String(prefill.wholesale_register_price),
        wholesale_renew_price: String(prefill.wholesale_renew_price),
      });
    } else if (initial) {
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
  }, [open, initial, prefill]);

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
            {initial
              ? `Edit Pricing .${initial.tld}`
              : prefill
                ? `Import Pricing .${prefill.tld}`
                : "Tambah Pricing TLD"}
          </DialogTitle>
          <DialogDescription>
            {prefill && !initial ? (
              <>
                Wholesale + retail suggested (wholesale × 1.2) sudah dipre-fill
                dari registrar. Adjust markup sebelum simpan.
              </>
            ) : (
              <>
                Harga dalam IDR (rupiah, tanpa desimal). Wholesale opsional —
                kalau kosong, wallet debit reseller/agent fallback ke retail.
              </>
            )}
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
              disabled={!!initial || !!prefill}
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
