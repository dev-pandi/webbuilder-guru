"use client";

// /admin/invoices — list invoices. Detail + PDF preview + mark-paid + cancel
// via row action.

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileDown,
  Filter,
  Loader2,
  Receipt,
  Search,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, openBlob } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Invoice = {
  id: string;
  number: string;
  user_id: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_gw_ref?: string;
  paid_at?: string;
  due_at: string;
  created_at: string;
};

const STATUS_FILTERS = [
  { value: "", label: "Semua" },
  { value: "unpaid", label: "Belum bayar" },
  { value: "paid", label: "Paid" },
  { value: "draft", label: "Draft" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "expired", label: "Expired" },
];

const PAGE_LIMIT = 50;

export default function AdminInvoicesPage() {
  const [items, setItems] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [markPaidTarget, setMarkPaidTarget] = useState<Invoice | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<{ items: Invoice[] }>(
        `/api/v1/admin/invoices?page=${page}&limit=${PAGE_LIMIT}`,
      );
      setItems(res.items || []);
    } catch (e: unknown) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Client-side filter — API belum expose status/q params, jadi filter list
  // yang sudah ke-fetch per halaman.
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((inv) => {
      if (status && inv.status !== status) return false;
      if (query && !inv.number.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, status, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const inv of items) c[inv.status] = (c[inv.status] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Receipt className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Daftar invoice semua user. Mark-paid manual untuk pembayaran transfer bank yang di-verify admin.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="size-3.5" />
            Filter
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value || "all"}
                type="button"
                onClick={() => setStatus(f.value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  status === f.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted",
                )}
              >
                {f.label}
                {f.value && counts[f.value] ? (
                  <span className="ml-1 text-muted-foreground/80">
                    ({counts[f.value]})
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nomor invoice…"
              className="h-9 pl-8"
            />
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Dibuat</TableHead>
              <TableHead>Dibayar</TableHead>
              <TableHead className="w-[180px] text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {items.length === 0
                    ? "Belum ada invoice."
                    : `Tidak ada invoice untuk filter ini.`}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    {inv.number}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={inv.status} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {inv.payment_method}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {formatIDR(inv.total)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(inv.created_at)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {inv.paid_at ? formatDate(inv.paid_at) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() =>
                          openBlob(`/api/v1/admin/invoices/${inv.id}/pdf`).catch((e) =>
                            toast.error("Gagal buka PDF", {
                              description: (e as Error).message,
                            }),
                          )
                        }
                      >
                        <FileDown className="size-3.5" />
                        PDF
                      </Button>
                      {(inv.status === "unpaid" || inv.status === "draft") && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => setMarkPaidTarget(inv)}
                            title="Tandai paid (manual verify)"
                          >
                            <CheckCircle2 className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setCancelTarget(inv)}
                            title="Batalkan invoice"
                          >
                            <XCircle className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {items.length > 0
            ? `${filtered.length} dari ${items.length} · Halaman ${page}`
            : "0 total"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Sebelumnya
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={items.length < PAGE_LIMIT || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </div>

      {markPaidTarget && (
        <MarkPaidDialog
          invoice={markPaidTarget}
          onClose={() => setMarkPaidTarget(null)}
          onDone={() => {
            setMarkPaidTarget(null);
            load();
          }}
        />
      )}
      {cancelTarget && (
        <CancelDialog
          invoice={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={() => {
            setCancelTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function MarkPaidDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const [providerRef, setProviderRef] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api(`/api/v1/admin/invoices/${invoice.id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({
          provider_ref: providerRef.trim() || undefined,
        }),
      });
      toast.success(`${invoice.number} ditandai paid`);
      onDone();
    } catch (e) {
      toast.error("Gagal mark-paid", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="border-b bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="size-5" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-base font-semibold">
                Tandai invoice sebagai paid
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                Invoice akan langsung transisi ke status <b>paid</b> dan
                trigger provisioning (register/renew domain atau credit wallet).
                Pastikan dana sudah masuk di rekening tujuan.
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nominal
              </span>
              <span className="text-2xl font-bold tracking-tight">
                {formatIDR(invoice.total)}
              </span>
            </div>
            <div className="mt-3 grid gap-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Nomor</span>
                <span className="truncate text-right font-mono text-xs">
                  {invoice.number}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Metode</span>
                <Badge variant="secondary" className="text-[10px]">
                  {invoice.payment_method}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Dibuat</span>
                <span className="text-right text-xs">
                  {formatDate(invoice.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-ref">
              Nomor referensi bank{" "}
              <span className="font-normal text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="provider-ref"
              value={providerRef}
              onChange={(e) => setProviderRef(e.target.value)}
              placeholder="mis. BCA-20260806-12345"
            />
            <p className="text-xs text-muted-foreground">
              Disimpan di kolom <code className="text-[10px]">payment_gw_ref</code>{" "}
              untuk audit trail.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background p-3 text-sm transition-colors hover:bg-muted/40">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 cursor-pointer accent-emerald-600"
            />
            <span className="text-muted-foreground">
              Saya sudah verify dana masuk di rekening tujuan sesuai nominal
              dan pengirim.
            </span>
          </label>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !confirmed}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Memproses…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Tandai paid
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api(`/api/v1/admin/invoices/${invoice.id}/cancel`, {
        method: "POST",
        body: reason.trim() ? JSON.stringify({ reason: reason.trim() }) : undefined,
      });
      toast.success(`${invoice.number} dibatalkan`);
      onDone();
    } catch (e) {
      toast.error("Gagal cancel", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <XCircle className="size-4 text-destructive" />
            Batalkan invoice
          </DialogTitle>
          <DialogDescription>
            Invoice <span className="font-mono text-xs">{invoice.number}</span>{" "}
            senilai <b>{formatIDR(invoice.total)}</b> akan ditandai cancelled.
            Aksi ini tidak bisa di-undo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason">
            Alasan{" "}
            <span className="font-normal text-muted-foreground">(opsional)</span>
          </Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. Duplicate invoice / user request cancel / expired"
            rows={3}
            maxLength={500}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Tutup
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={submitting}
            className="gap-2"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Batalkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="size-3" />
        Paid
      </Badge>
    );
  }
  if (status === "unpaid") {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock className="size-3" />
        Belum bayar
      </Badge>
    );
  }
  if (status === "draft") return <Badge variant="secondary">Draft</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
  if (status === "expired") return <Badge variant="destructive">Expired</Badge>;
  if (status === "refund") return <Badge variant="outline">Refund</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function formatIDR(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
