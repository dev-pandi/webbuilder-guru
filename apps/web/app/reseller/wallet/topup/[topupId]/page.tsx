"use client";

// /reseller/wallet/topup/[topupId] — polling status top-up.
//
// Status enum (backend):
//   pending_payment  → tombol "Buka halaman pembayaran"
//   credited         → success (terminal, redirect ke wallet)
//   failed / expired / cancelled → terminal error state

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Wallet,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Topup = {
  id: string;
  user_id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_url?: string;
  instructions?: string;
  status: string;
  reason?: string;
  ledger_id?: string;
  credited_at?: string;
  created_at: string;
  updated_at: string;
};

function isTerminal(status: string): boolean {
  return (
    status === "credited" ||
    status === "failed" ||
    status === "expired" ||
    status === "cancelled"
  );
}

function formatIDR(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default function TopupStatusPage() {
  const router = useRouter();
  const params = useParams<{ topupId: string }>();
  const topupID = params.topupId;

  const [topup, setTopup] = useState<Topup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Polling interval: pending_payment poll cepat (2s), terminal state stop.
  const pollInterval = topup?.status === "pending_payment" ? 2000 : 3000;

  useEffect(() => {
    if (!topupID) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    async function fetchOnce() {
      try {
        const t = await api<Topup>(`/api/v1/wallet/topup/${topupID}`);
        if (cancelled) return;
        setTopup(t);
        setErr(null);
        setNotFound(false);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setNotFound(true);
          return;
        }
        setErr((e as Error).message);
      }
    }

    fetchOnce();
    const interval = setInterval(() => {
      if (topup && isTerminal(topup.status)) return;
      fetchOnce();
    }, pollInterval);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topupID, pollInterval]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/reseller/wallet">
            <ArrowLeft className="size-4" /> Wallet
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center">
            <XCircle className="mx-auto size-8 text-destructive" />
            <p className="mt-3 font-medium">Top-up tidak ditemukan</p>
            <p className="mt-1 text-sm text-muted-foreground">
              ID tidak valid atau bukan milik akun Anda.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!topup) {
    return (
      <div className="mx-auto max-w-2xl py-10">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/reseller/wallet">
            <ArrowLeft className="size-4" /> Wallet
          </Link>
        </Button>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <Wallet className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">
            Top-up {formatIDR(topup.amount)}
          </h1>
          <StatusBadge status={topup.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Metode: <span className="font-medium">{topup.payment_method}</span>
        </p>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      {topup.status === "pending_payment" && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <Clock className="size-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">Menunggu pembayaran</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Klik tombol di bawah untuk lanjut ke halaman pembayaran.
                  Setelah bayar, halaman ini akan otomatis refresh.
                </p>
              </div>
            </div>
            {topup.payment_url ? (
              <Button asChild size="lg" className="w-full gap-2">
                <a href={topup.payment_url} target="_blank" rel="noopener noreferrer">
                  Buka halaman pembayaran
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            ) : topup.instructions ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {topup.instructions}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Menyiapkan link
                pembayaran…
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {topup.status === "credited" && (
        <Card className="border-emerald-500/30">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  Saldo berhasil di-credit
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatIDR(topup.amount)} sudah masuk ke wallet Anda per{" "}
                  {topup.credited_at
                    ? new Date(topup.credited_at).toLocaleString("id-ID")
                    : "sekarang"}
                  .
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/api/v1/invoices/${topup.invoice_id}/pdf`}
                  target="_blank"
                >
                  Cetak invoice
                </Link>
              </Button>
              <Button size="sm" onClick={() => router.push("/reseller/wallet")}>
                Ke wallet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(topup.status === "failed" ||
        topup.status === "expired" ||
        topup.status === "cancelled") && (
        <Card className="border-destructive/30">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <XCircle className="size-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  {topup.status === "failed" && "Top-up gagal"}
                  {topup.status === "expired" && "Top-up kedaluwarsa"}
                  {topup.status === "cancelled" && "Top-up dibatalkan"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {topup.reason ||
                    "Silakan buat top-up baru untuk isi saldo wallet."}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" asChild>
                <Link href="/reseller/wallet/topup">Mulai top-up baru</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-1 p-5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Topup ID</span>
            <code className="font-mono">{topup.id.slice(0, 8)}…</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invoice ID</span>
            <code className="font-mono">{topup.invoice_id.slice(0, 8)}…</code>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dibuat</span>
            <span>{new Date(topup.created_at).toLocaleString("id-ID")}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "credited") {
    return <Badge variant="success">Sukses</Badge>;
  }
  if (status === "pending_payment") {
    return (
      <Badge variant="warning" className="gap-1">
        <Clock className="size-3" />
        Menunggu bayar
      </Badge>
    );
  }
  if (status === "failed" || status === "expired") {
    return <Badge variant="destructive">{status === "failed" ? "Gagal" : "Kedaluwarsa"}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}
