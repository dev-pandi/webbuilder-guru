"use client";

// Ledger detail — paginated dari `/api/v1/wallet/ledger`. Filter kind
// client-side (backend belum support filter per reason — bisa di-add nanti).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Clock,
  History,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type LedgerListResp = {
  items: LedgerEntry[];
  page: number;
  limit: number;
};

type Topup = {
  id: string;
  amount: number;
  payment_method: string;
  status: string; // pending_payment | credited | failed | expired | cancelled
  created_at: string;
};

type TopupListResp = {
  items: Topup[];
  page: number;
  limit: number;
};

const REASON_FILTERS = [
  { value: "", label: "Semua" },
  { value: "topup", label: "Top-up" },
  { value: "debit_register", label: "Register" },
  { value: "debit_renew", label: "Renew" },
  { value: "refund", label: "Refund" },
  { value: "admin_adjust", label: "Adjust Admin" },
];

const PAGE_LIMIT = 30;

export default function LedgerPage() {
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [pendingTopups, setPendingTopups] = useState<Topup[]>([]);
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    Promise.allSettled([
      api<LedgerListResp>(`/api/v1/wallet/ledger?${q.toString()}`),
      // Ambil top-up pending supaya user tahu ada yang belum credited.
      // Kalau endpoint gagal (mis. topup feature disabled), skip diam-diam.
      api<TopupListResp>(`/api/v1/wallet/topup?limit=20`),
    ])
      .then(([ledger, topups]) => {
        if (ledger.status === "fulfilled") {
          setItems(ledger.value.items ?? []);
        } else {
          setErr((ledger.reason as Error).message);
        }
        if (topups.status === "fulfilled" && page === 1) {
          const pending = (topups.value.items ?? []).filter(
            (t) => t.status === "pending_payment",
          );
          setPendingTopups(pending);
        }
      })
      .finally(() => setLoading(false));
  }, [page]);

  // Client-side filter — backend belum expose `?reason=` param.
  const filtered = useMemo(() => {
    if (!reason) return items;
    return items.filter((e) => e.reason === reason);
  }, [items, reason]);

  const hasMore = items.length >= PAGE_LIMIT;

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

      <div>
        <div className="mb-1 flex items-center gap-2">
          <History className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Riwayat Transaksi</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Semua debit + credit di wallet Anda.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {REASON_FILTERS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setReason(k.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              reason === k.value
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-muted",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      {pendingTopups.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-2">
              <Clock className="size-4 shrink-0 translate-y-0.5 text-amber-600" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  Top-up belum selesai ({pendingTopups.length})
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Saldo di-credit otomatis setelah pembayaran dikonfirmasi
                  gateway. Klik untuk lanjut bayar atau lihat instruksi.
                </p>
              </div>
            </div>
            <ul className="divide-y">
              {pendingTopups.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge variant="warning" className="gap-1 text-[10px]">
                      <Clock className="size-3" />
                      Menunggu bayar
                    </Badge>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatIDR(t.amount)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t.payment_method} · {formatDate(t.created_at)}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/reseller/wallet/topup/${t.id}`}>Lihat</Link>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className={loading ? "p-5 opacity-60" : "p-5"}>
          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {reason
                  ? `Tidak ada transaksi untuk filter ${reason}.`
                  : "Belum ada transaksi credit/debit."}
              </p>
              {!reason && pendingTopups.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ada {pendingTopups.length} top-up menunggu pembayaran di atas —
                  saldo di-credit otomatis setelah gateway konfirmasi.
                </p>
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((e) => (
                <LedgerRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Halaman {page}</span>
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
            disabled={!hasMore || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </div>
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.delta > 0;
  const label = reasonLabel(entry.reason);
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={
            isCredit
              ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          }
        >
          {isCredit ? (
            <ArrowDownRight className="size-4" />
          ) : (
            <ArrowUpRight className="size-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDate(entry.created_at)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p
          className={
            isCredit
              ? "text-sm font-semibold text-emerald-600 dark:text-emerald-400"
              : "text-sm font-semibold"
          }
        >
          {isCredit ? "+" : ""}
          {formatIDR(entry.delta)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          sisa {formatIDR(entry.balance_after)}
        </p>
      </div>
    </li>
  );
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    topup: "Top-up",
    debit_register: "Debit — Register Domain",
    debit_renew: "Debit — Renew Domain",
    refund: "Refund",
    admin_adjust: "Adjustment Admin",
  };
  return map[reason] || reason;
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
