"use client";

// /admin/wallet/topups — approve/reject wallet top-up dari user.
// Manual bank flow: user upload bukti transfer → admin verify di rekening
// → klik Approve → invoice mark-paid → wallet ledger credited otomatis.

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Filter,
  Loader2,
  Receipt,
  Wallet as WalletIcon,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type AdminTopup = {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  invoice_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: string;
  reason?: string;
  ledger_id?: string;
  credited_at?: string;
  proof_mime?: string;
  proof_size?: number;
  proof_note?: string;
  proof_uploaded_at?: string;
  created_at: string;
  updated_at: string;
};

type ListResp = {
  items: AdminTopup[];
  page: number;
  limit: number;
  total: number;
};

const STATUS_FILTERS = [
  { value: "", label: "Semua" },
  { value: "pending_payment", label: "Pending" },
  { value: "credited", label: "Credited" },
  { value: "failed", label: "Failed" },
  { value: "expired", label: "Expired" },
];

const PROOF_FILTERS = [
  { value: "", label: "Semua bukti" },
  { value: "true", label: "Sudah upload" },
  { value: "false", label: "Belum upload" },
];

const PAGE_LIMIT = 30;

export default function AdminWalletTopupsPage() {
  const [items, setItems] = useState<AdminTopup[]>([]);
  const [status, setStatus] = useState("pending_payment");
  const [hasProof, setHasProof] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<AdminTopup | null>(null);
  const [rejecting, setRejecting] = useState<AdminTopup | null>(null);
  const [approving, setApproving] = useState<AdminTopup | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
      });
      if (status) q.set("status", status);
      if (hasProof) q.set("has_proof", hasProof);
      const res = await api<ListResp>(`/api/v1/admin/wallet/topups?${q}`);
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasProof, page]);


  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <WalletIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Wallet Top-up</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Approve / reject permintaan top-up wallet dari user. Manual bank
          flow: user upload bukti transfer, admin verify di rekening, lalu
          Approve — wallet di-credit otomatis via invoice mark-paid.
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
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  status === f.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="mx-2 h-4 w-px bg-border" />
          <div className="flex flex-wrap gap-1.5">
            {PROOF_FILTERS.map((f) => (
              <button
                key={f.value || "any"}
                type="button"
                onClick={() => {
                  setHasProof(f.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  hasProof === f.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted",
                )}
              >
                {f.label}
              </button>
            ))}
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
              <TableHead>Pengguna</TableHead>
              <TableHead>Nominal</TableHead>
              <TableHead>Metode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bukti</TableHead>
              <TableHead>Dibuat</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Tidak ada top-up untuk filter ini.
                </TableCell>
              </TableRow>
            ) : (
              items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{t.user_name || t.user_email}</div>
                    <div className="text-xs text-muted-foreground">{t.user_email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm font-semibold">
                    {formatIDR(t.amount)}
                  </TableCell>
                  <TableCell className="text-sm">{t.payment_method}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                    {t.reason && (
                      <div className="mt-0.5 max-w-[200px] truncate text-[10px] text-muted-foreground">
                        {t.reason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.proof_uploaded_at ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreview(t)}
                        className="gap-1.5"
                      >
                        <Eye className="size-3.5" />
                        Lihat
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(t.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.status === "pending_payment" ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejecting(t)}
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          <XCircle className="size-3.5" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setApproving(t)}
                          className="gap-1"
                        >
                          <CheckCircle2 className="size-3.5" />
                          Approve
                        </Button>
                      </div>
                    ) : t.status === "credited" ? (
                      <span className="text-xs text-emerald-600">✓ Credited</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {total > 0 ? `${total} total` : "0 total"} · Halaman {page} dari {totalPages}
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
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </div>

      {preview && (
        <ProofPreview topup={preview} onClose={() => setPreview(null)} />
      )}
      {rejecting && (
        <RejectDialog
          topup={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            refresh();
          }}
        />
      )}
      {approving && (
        <ApproveDialog
          topup={approving}
          onClose={() => setApproving(null)}
          onDone={() => {
            setApproving(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ProofPreview({ topup, onClose }: { topup: AdminTopup; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ image: string; type: string; note?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ image: string; type: string; note?: string }>(
      `/api/v1/admin/wallet/topups/${topup.id}/proof`,
    )
      .then((r) => {
        if (!cancelled) setPreview(r);
      })
      .catch((e) => !cancelled && setErr((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [topup.id]);

  const isPdf = preview?.type === "application/pdf";
  const isImage = preview?.type?.startsWith("image/");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4 text-primary" />
            Bukti transfer — {formatIDR(topup.amount)}
          </DialogTitle>
          <DialogDescription>
            {topup.user_name || topup.user_email} · {topup.payment_method} ·{" "}
            di-upload {topup.proof_uploaded_at ? formatDate(topup.proof_uploaded_at) : "—"}
          </DialogDescription>
        </DialogHeader>

        {topup.proof_note && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Catatan dari user:
            </p>
            <p className="mt-1">{topup.proof_note}</p>
          </div>
        )}

        <div className="max-h-[65vh] overflow-auto rounded-lg border bg-muted/20">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat bukti…
            </div>
          )}
          {!loading && err && (
            <div className="flex items-start gap-2 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}
          {!loading && preview && isImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={preview.image}
              alt="bukti transfer"
              className="mx-auto block max-h-[60vh] w-auto object-contain"
            />
          )}
          {!loading && preview && isPdf && (
            <iframe src={preview.image} title="bukti" className="h-[60vh] w-full" />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApproveDialog({
  topup,
  onClose,
  onDone,
}: {
  topup: AdminTopup;
  onClose: () => void;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  // Simple confirmation check — mirip "type DELETE to confirm" — untuk cegah
  // trigger accidental. Admin harus centang manual sebelum tombol enabled.
  const [confirmed, setConfirmed] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api(`/api/v1/admin/wallet/topups/${topup.id}/approve`, {
        method: "POST",
      });
      toast.success("Top-up di-approve · wallet credited");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
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
                Approve top-up wallet
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                Wallet user akan langsung di-credit dan invoice ditandai paid.
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
                {formatIDR(topup.amount)}
              </span>
            </div>
            <div className="mt-3 grid gap-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Pengguna</span>
                <span className="truncate text-right font-medium">
                  {topup.user_name || topup.user_email}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="truncate text-right font-mono text-xs">
                  {topup.user_email}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Metode</span>
                <Badge variant="secondary" className="text-[10px]">
                  {topup.payment_method}
                </Badge>
              </div>
              {topup.proof_uploaded_at && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Bukti upload</span>
                  <span className="text-right text-xs">
                    {formatDate(topup.proof_uploaded_at)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {topup.proof_note && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Catatan dari user
              </p>
              <p className="mt-1 text-sm italic">&ldquo;{topup.proof_note}&rdquo;</p>
            </div>
          )}

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
                Approve &amp; credit wallet
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  topup,
  onClose,
  onDone,
}: {
  topup: AdminTopup;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      toast.error("Alasan wajib diisi");
      return;
    }
    setSubmitting(true);
    try {
      await api(`/api/v1/admin/wallet/topups/${topup.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast.success("Top-up di-reject");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject top-up</DialogTitle>
          <DialogDescription>
            {formatIDR(topup.amount)} dari {topup.user_email}. Alasan akan
            di-simpan di kolom reason dan status jadi failed.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="mis. Bukti transfer tidak sesuai nominal / rekening tujuan salah / tidak ada dana masuk di rekening"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={500}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={submitting || !reason.trim()}
            className="gap-2"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "credited") return <Badge variant="success">Credited</Badge>;
  if (status === "pending_payment") {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock className="size-3" />
        Pending
      </Badge>
    );
  }
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "expired") return <Badge variant="destructive">Expired</Badge>;
  if (status === "cancelled") return <Badge variant="secondary">Cancelled</Badge>;
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
