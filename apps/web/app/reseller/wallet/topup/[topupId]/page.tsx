"use client";

// Halaman status top-up. Untuk gateway flow → user redirect ke payment_url,
// balik ke sini kalau polling. Untuk manual_transfer → tampilkan instruksi
// bank + upload proof form.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TopupStatus = {
  topup_id: string;
  amount: number;
  status: string;
  payment_method: string;
  payment_url?: string;
  reason?: string;
  credited_at?: string;
};

type Bank = {
  id: number;
  bank_name: string;
  account_number: string;
  account_holder: string;
  branch?: string;
};

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set(["credited", "failed", "expired", "rejected"]);

export default function TopupStatusPage({
  params,
}: {
  params: { topupId: string };
}) {
  const [status, setStatus] = useState<TopupStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api<TopupStatus>(
        `/api/v1/reseller/wallet/topup/${params.topupId}/status`,
      );
      setStatus(s);
      // Stop polling saat terminal.
      if (TERMINAL_STATUSES.has(s.status)) {
        if (timerRef.current) clearTimeout(timerRef.current);
      } else {
        timerRef.current = setTimeout(fetchStatus, POLL_INTERVAL_MS);
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [params.topupId]);

  useEffect(() => {
    fetchStatus();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchStatus]);

  // Ambil bank list untuk tampilkan instruksi manual transfer.
  useEffect(() => {
    if (status?.payment_method !== "manual_transfer") return;
    api<Bank[]>("/api/v1/reseller/wallet/topup/banks")
      .then((b) => setBanks(b ?? []))
      .catch(() => {});
  }, [status?.payment_method]);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/reseller/wallet">
            <ArrowLeft className="size-4" />
            Wallet
          </Link>
        </Button>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      {!status ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Memuat status top-up…
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <StatusIcon status={status.status} />
                <div>
                  <h1 className="text-lg font-bold">{statusLabel(status.status)}</h1>
                  <p className="text-xs text-muted-foreground">
                    Top-up ID: <span className="font-mono">{status.topup_id}</span>
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Nominal</p>
                  <p className="text-xl font-bold tracking-tight">
                    {formatIDR(status.amount)}
                  </p>
                </div>
              </div>

              {status.reason && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  {status.reason}
                </div>
              )}

              {/* Gateway flow — user redirect out */}
              {status.payment_url && status.status === "pending_payment" && (
                <Button asChild className="mt-4 gap-1.5">
                  <a href={status.payment_url} target="_blank" rel="noopener noreferrer">
                    Buka Halaman Pembayaran
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              )}

              {status.status === "credited" && (
                <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                  ✓ Saldo sudah masuk. Terkredit{" "}
                  {status.credited_at ? formatDate(status.credited_at) : "—"}.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual transfer flow */}
          {status.payment_method === "manual_transfer" &&
            (status.status === "awaiting_proof" ||
              status.status === "pending_verification") && (
              <ManualTransferPanel
                topupID={status.topup_id}
                amount={status.amount}
                status={status.status}
                banks={banks}
                onProofUploaded={fetchStatus}
              />
            )}
        </>
      )}
    </div>
  );
}

function ManualTransferPanel({
  topupID,
  amount,
  status,
  banks,
  onProofUploaded,
}: {
  topupID: string;
  amount: number;
  status: string;
  banks: Bank[];
  onProofUploaded: () => void;
}) {
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      setErr("Isi semua field pengirim (bank, nomor rekening, atas nama)");
      return;
    }
    if (!file) {
      setErr("Pilih file bukti transfer");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Ukuran file maksimal 5 MiB");
      return;
    }
    if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type)) {
      setErr("Format file harus PNG, JPG, atau PDF");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("bank_name", bankName.trim());
      form.append("account_number", accountNumber.trim());
      form.append("account_holder", accountHolder.trim());
      // transfer_amount HARUS match nominal topup — registrar reject kalau
      // beda. Auto-fill dari `amount` supaya user tidak salah ketik.
      form.append("transfer_amount", String(amount));
      if (transferDate) {
        form.append("transfer_date", transferDate);
      }
      // Fetch langsung — api() helper hanya support JSON body.
      const token = localStorage.getItem("wb_access_token");
      const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";
      const res = await fetch(
        `${base}/api/v1/reseller/wallet/topup/${topupID}/proof`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      toast.success("Bukti transfer terunggah. Menunggu verify admin.");
      onProofUploaded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Instruksi Transfer Manual</h3>
        </div>

        {banks.length === 0 ? (
          <p className="text-xs text-muted-foreground">Memuat instruksi…</p>
        ) : (
          <div className="rounded-lg border bg-muted/20 p-4 text-sm">
            <p className="mb-2 text-xs text-muted-foreground">
              Transfer sesuai nominal ke salah satu rekening di bawah. Jangan
              lupa tulis <b>topup ID</b> di berita transfer.
            </p>
            <div className="mb-3 space-y-2">
              {banks.map((b) => (
                <div key={b.id} className="rounded-md border bg-background p-3">
                  <p className="font-semibold">{b.bank_name}</p>
                  <p className="font-mono text-sm">{b.account_number}</p>
                  <p className="text-xs text-muted-foreground">
                    a/n {b.account_holder}
                    {b.branch ? ` — ${b.branch}` : ""}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-xs">
              <div>
                <p className="text-muted-foreground">Nominal transfer</p>
                <p className="font-bold text-primary">{formatIDR(amount)}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Berita transfer</p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(topupID);
                    toast.success("Top-up ID disalin");
                  }}
                  className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                >
                  {topupID}
                  <Copy className="size-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {status === "awaiting_proof" ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-md border bg-background p-3 text-xs">
              <div className="mb-3 font-medium text-muted-foreground">
                Data pengirim (harus sesuai bukti transfer)
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-bank" className="text-xs">
                    Bank pengirim *
                  </Label>
                  <Input
                    id="p-bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="BCA, Mandiri, BRI, …"
                    maxLength={64}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-acc" className="text-xs">
                    Nomor rekening *
                  </Label>
                  <Input
                    id="p-acc"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="1234567890"
                    inputMode="numeric"
                    className="font-mono"
                    maxLength={32}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-holder" className="text-xs">
                    Atas nama pengirim *
                  </Label>
                  <Input
                    id="p-holder"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    placeholder="Nama sesuai buku tabungan"
                    maxLength={128}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-date" className="text-xs">
                    Tanggal transfer
                  </Label>
                  <Input
                    id="p-date"
                    type="date"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                  />
                </div>
              </div>
              <p className="mt-3 rounded border border-primary/30 bg-primary/5 p-2 text-[11px] text-muted-foreground">
                Nominal transfer:{" "}
                <b className="text-primary">{formatIDR(amount)}</b> (harus persis
                — kalau beda, admin akan reject).
              </p>
            </div>

            <div>
              <Label htmlFor="p-file" className="mb-1.5 block text-xs">
                Bukti transfer *
              </Label>
              <input
                ref={inputRef}
                id="p-file"
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="gap-1.5"
                >
                  <Upload className="size-4" />
                  {file ? "Ganti file" : "Pilih file"}
                </Button>
                {file && (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                PNG / JPG / PDF, maks 5 MiB
              </p>
            </div>

            {err && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {err}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={uploading} className="gap-1.5">
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengunggah…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Kirim Bukti Transfer
                  </>
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Bukti transfer terunggah. Admin akan verify — status akan update
            otomatis saat sudah di-approve.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "credited") {
    return (
      <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
        <CheckCircle2 className="size-5" />
      </div>
    );
  }
  if (status === "failed" || status === "rejected" || status === "expired") {
    return (
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <XCircle className="size-5" />
      </div>
    );
  }
  return (
    <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
      <Clock className="size-5" />
    </div>
  );
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending_payment: "Menunggu Pembayaran",
    awaiting_proof: "Menunggu Bukti Transfer",
    pending_verification: "Menunggu Verifikasi Admin",
    credited: "Saldo Terkredit",
    failed: "Gagal",
    expired: "Kadaluarsa",
    rejected: "Ditolak",
  };
  return map[status] || status;
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

