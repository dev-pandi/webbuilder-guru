"use client";

// Ledger detail — paginated dari `/api/v1/wallet/ledger` (Phase 1
// self-sufficient). Filter kind client-side (backend belum support filter
// per reason — bisa di-add nanti).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  History,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
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
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    api<LedgerListResp>(`/api/v1/wallet/ledger?${q.toString()}`)
      .then((res) => setItems(res.items ?? []))
      .catch((e) => setErr((e as Error).message))
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

      <Card>
        <CardContent className={loading ? "p-5 opacity-60" : "p-5"}>
          {loading && items.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada transaksi{reason ? ` untuk filter ${reason}` : ""}.
            </p>
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
