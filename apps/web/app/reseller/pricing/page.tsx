"use client";

// /reseller/pricing — reseller set harga jual per TLD (Phase 3.11).
// 4 kolom: agent_register, agent_renew, client_register, client_renew.
// Wholesale platform ditampilkan sebagai referensi (transparency); reseller
// tidak boleh set harga di bawah wholesale (backend enforce).

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  DollarSign,
  Info,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type ResellerPrice = {
  id: string;
  reseller_id: string;
  tld: string;
  agent_register_price: number;
  agent_renew_price: number;
  client_register_price: number;
  client_renew_price: number;
  currency: string;
  updated_at: string;
};

// PlatformTLD — 1 opsi TLD dari /reseller/pricing/platform-tlds. Wholesale
// nullable kalau admin belum sync dari registrar.
type PlatformTLD = {
  tld: string;
  currency: string;
  retail_register_price: number;
  retail_renew_price: number;
  wholesale_register_price?: number | null;
  wholesale_renew_price?: number | null;
};

type Resolved = {
  tld: string;
  currency: string;
  retail_register_price?: number | null;
  retail_renew_price?: number | null;
  wholesale_register_price?: number | null;
  wholesale_renew_price?: number | null;
};

export default function ResellerPricingPage() {
  const [items, setItems] = useState<ResellerPrice[]>([]);
  const [platformTLDs, setPlatformTLDs] = useState<PlatformTLD[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResellerPrice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [priceRes, tldRes] = await Promise.all([
        api<ResellerPrice[]>("/api/v1/reseller/pricing"),
        api<PlatformTLD[]>("/api/v1/reseller/pricing/platform-tlds"),
      ]);
      setItems(priceRes ?? []);
      setPlatformTLDs(tldRes ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // TLD yang belum di-set reseller — hanya ini yang muncul di dropdown
  // "Tambah TLD". Waktu edit, TLD current tetap accessible via `initial`.
  const usedTLDs = useMemo(() => new Set(items.map((p) => p.tld)), [items]);
  const availableTLDs = useMemo(
    () => platformTLDs.filter((t) => !usedTLDs.has(t.tld)),
    [platformTLDs, usedTLDs],
  );
  const noMoreTLDs = platformTLDs.length > 0 && availableTLDs.length === 0;
  const noPlatformTLDs = platformTLDs.length === 0;

  async function remove(id: string, tld: string) {
    if (!confirm(`Hapus price list untuk .${tld}? Nanti fallback ke retail platform.`)) return;
    try {
      await api(`/api/v1/reseller/pricing/${id}`, { method: "DELETE" });
      toast.success("Price list dihapus");
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
            <h1 className="text-2xl font-bold tracking-tight">Harga Jual</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Set harga jual per TLD ke agent + client. Agent bayar Anda sesuai
            kontrak (settlement out-of-system), client langsung charge sesuai
            harga di sini.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          disabled={noMoreTLDs || noPlatformTLDs}
          title={
            noPlatformTLDs
              ? "Platform belum punya TLD apa pun — hubungi admin"
              : noMoreTLDs
                ? "Semua TLD sudah Anda tambahkan"
                : undefined
          }
          className="gap-1.5"
        >
          <Plus className="size-4" />
          Tambah TLD
        </Button>
      </div>

      {noPlatformTLDs && !loading && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <div>
            <p className="font-medium">Platform belum punya TLD terkonfigurasi</p>
            <p className="mt-0.5 text-xs">
              Admin perlu setup harga wholesale + retail per TLD dari halaman
              Admin → Pricing dulu. Setelah itu Anda bisa set harga jual di sini.
            </p>
          </div>
        </div>
      )}

      {!noPlatformTLDs && noMoreTLDs && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0 translate-y-0.5" />
          <span>
            Anda sudah set harga untuk semua TLD ({platformTLDs.length} TLD).
            Tambahan TLD baru akan muncul di sini setelah admin aktifkan.
          </span>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <Info className="size-4 shrink-0 translate-y-0.5 text-primary" />
        <div className="text-xs text-muted-foreground">
          <b>Transparency:</b> Wallet Anda di-debit sesuai <b>wholesale</b>{" "}
          platform tiap register / renew. Selisih ke agent_price / client_price
          = margin Anda. Agent lihat cuma <b>agent_price</b> (client tidak
          lihat harga apapun kecuali retail default).
        </div>
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
                <TableHead>Agent (Register)</TableHead>
                <TableHead>Agent (Renew)</TableHead>
                <TableHead>Client (Register)</TableHead>
                <TableHead>Client (Renew)</TableHead>
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
                      <p className="text-sm font-medium">Belum ada price list</p>
                      <p className="max-w-md text-xs">
                        Tambahkan TLD untuk set harga jual custom. Kalau kosong,
                        fallback ke <b>retail</b> platform (Anda tidak dapat margin).
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono font-medium">.{p.tld}</TableCell>
                    <TableCell>{fmt(p.agent_register_price, p.currency)}</TableCell>
                    <TableCell>{fmt(p.agent_renew_price, p.currency)}</TableCell>
                    <TableCell>{fmt(p.client_register_price, p.currency)}</TableCell>
                    <TableCell>{fmt(p.client_renew_price, p.currency)}</TableCell>
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
        availableTLDs={availableTLDs}
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
  availableTLDs,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: ResellerPrice | null;
  availableTLDs: PlatformTLD[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    tld: "",
    agent_register_price: "",
    agent_renew_price: "",
    client_register_price: "",
    client_renew_price: "",
  });
  const [reference, setReference] = useState<Resolved | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        tld: initial.tld,
        agent_register_price: String(initial.agent_register_price),
        agent_renew_price: String(initial.agent_renew_price),
        client_register_price: String(initial.client_register_price),
        client_renew_price: String(initial.client_renew_price),
      });
    } else {
      setForm({
        tld: "",
        agent_register_price: "",
        agent_renew_price: "",
        client_register_price: "",
        client_renew_price: "",
      });
    }
    setErr(null);
    setReference(null);
  }, [open, initial]);

  // Ambil referensi wholesale + retail begitu TLD di-set (debounce).
  useEffect(() => {
    const tld = form.tld.trim().toLowerCase().replace(/^\./, "");
    if (!tld) {
      setReference(null);
      return;
    }
    const t = setTimeout(() => {
      api<Resolved>(`/api/v1/pricing/resolve/${encodeURIComponent(tld)}`)
        .then(setReference)
        .catch(() => setReference(null));
    }, 300);
    return () => clearTimeout(t);
  }, [form.tld]);

  async function submit() {
    setErr(null);
    const tld = form.tld.trim().toLowerCase().replace(/^\./, "");
    if (!tld) {
      setErr("TLD wajib diisi");
      return;
    }
    const parts = [
      form.agent_register_price,
      form.agent_renew_price,
      form.client_register_price,
      form.client_renew_price,
    ].map(Number);
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) {
      setErr("Semua harga harus angka >= 0");
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/reseller/pricing", {
        method: "POST",
        body: JSON.stringify({
          tld,
          agent_register_price: parts[0],
          agent_renew_price: parts[1],
          client_register_price: parts[2],
          client_renew_price: parts[3],
        }),
      });
      toast.success("Price list tersimpan");
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
            {initial ? `Edit Harga .${initial.tld}` : "Tambah TLD"}
          </DialogTitle>
          <DialogDescription>
            Set 4 harga per TLD (register + renew, untuk agent + client). Wallet
            Anda di-debit wholesale, selisih = margin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tld">TLD *</Label>
            {initial ? (
              // Edit mode — TLD locked (row identity). Tampilkan sebagai
              // input disabled supaya konsisten visual dengan mode create.
              <Input
                id="tld"
                value={form.tld}
                disabled
                className="font-mono"
              />
            ) : (
              <Select
                value={form.tld}
                onValueChange={(v) => {
                  const opt = availableTLDs.find((o) => o.tld === v);
                  // Auto-suggest markup: agent = retail * 0.9, client = retail.
                  // Reseller boleh adjust manual — ini cuma starting point.
                  const retailReg = opt?.retail_register_price ?? 0;
                  const retailRen = opt?.retail_renew_price ?? 0;
                  setForm({
                    tld: v,
                    agent_register_price: retailReg
                      ? String(Math.round(retailReg * 0.9))
                      : "",
                    agent_renew_price: retailRen
                      ? String(Math.round(retailRen * 0.9))
                      : "",
                    client_register_price: retailReg ? String(retailReg) : "",
                    client_renew_price: retailRen ? String(retailRen) : "",
                  });
                }}
                disabled={availableTLDs.length === 0}
              >
                <SelectTrigger id="tld" className="font-mono">
                  <SelectValue
                    placeholder={
                      availableTLDs.length === 0
                        ? "Tidak ada TLD tersisa untuk ditambahkan"
                        : "Pilih TLD dari daftar platform…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableTLDs.map((o) => (
                    <SelectItem key={o.tld} value={o.tld} className="font-mono">
                      .{o.tld}
                      <span className="ml-2 text-xs text-muted-foreground">
                        (retail {fmt(o.retail_register_price, o.currency)})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!initial && (
              <p className="text-[11px] text-muted-foreground">
                Daftar TLD di-batasi ke yang admin sudah aktifkan di platform.
                Kalau TLD yang Anda butuhkan belum ada, hubungi admin.
              </p>
            )}
          </div>

          {reference && (
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <p className="mb-1 font-medium text-muted-foreground">
                Referensi platform (.{reference.tld}):
              </p>
              <div className="grid gap-1 sm:grid-cols-2">
                <div>
                  Wholesale reg:{" "}
                  <span className="font-mono">
                    {reference.wholesale_register_price != null
                      ? fmt(reference.wholesale_register_price, reference.currency)
                      : "—"}
                  </span>
                </div>
                <div>
                  Wholesale renew:{" "}
                  <span className="font-mono">
                    {reference.wholesale_renew_price != null
                      ? fmt(reference.wholesale_renew_price, reference.currency)
                      : "—"}
                  </span>
                </div>
                <div>
                  Retail reg:{" "}
                  <span className="font-mono">
                    {reference.retail_register_price != null
                      ? fmt(reference.retail_register_price, reference.currency)
                      : "—"}
                  </span>
                </div>
                <div>
                  Retail renew:{" "}
                  <span className="font-mono">
                    {reference.retail_renew_price != null
                      ? fmt(reference.retail_renew_price, reference.currency)
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Untuk Agent
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ar" className="text-xs">Register (IDR)</Label>
                <Input
                  id="ar"
                  type="number"
                  min={0}
                  value={form.agent_register_price}
                  onChange={(e) => setForm((f) => ({ ...f, agent_register_price: e.target.value }))}
                  placeholder="75000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="arn" className="text-xs">Renew (IDR)</Label>
                <Input
                  id="arn"
                  type="number"
                  min={0}
                  value={form.agent_renew_price}
                  onChange={(e) => setForm((f) => ({ ...f, agent_renew_price: e.target.value }))}
                  placeholder="80000"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Untuk Client
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cr" className="text-xs">Register (IDR)</Label>
                <Input
                  id="cr"
                  type="number"
                  min={0}
                  value={form.client_register_price}
                  onChange={(e) => setForm((f) => ({ ...f, client_register_price: e.target.value }))}
                  placeholder="200000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crn" className="text-xs">Renew (IDR)</Label>
                <Input
                  id="crn"
                  type="number"
                  min={0}
                  value={form.client_renew_price}
                  onChange={(e) => setForm((f) => ({ ...f, client_renew_price: e.target.value }))}
                  placeholder="220000"
                />
              </div>
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
