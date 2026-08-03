"use client";

// Reseller wallet dashboard — balance + recent ledger.
// Sumber data: `wallet_local` package (Phase 1 self-sufficient) via
// `/api/v1/wallet` endpoint. Legacy `/api/v1/reseller/wallet` (proxy ke
// registrar-api) sudah tidak dipakai — di-guard return 503 di backend
// kalau operator jalan di mode self-sufficient.
//
// Top-up flow di-defer sampai `wallet_local.Topup` di-implement. Untuk
// sementara, admin credit manual via `/admin/wallet/adjust`.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  History,
  Loader2,
  Wallet as WalletIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Shape dari GET /api/v1/wallet/ledger — items[] dari wallet_local.
type LedgerEntry = {
  id: string;       // uuid
  delta: number;    // + credit, - debit (IDR minor unit)
  reason: string;   // "topup" | "debit_register" | "debit_renew" | "refund" | "admin_adjust"
  balance_after: number;
  metadata?: Record<string, unknown>;
  created_at: string;
};

// Shape dari GET /api/v1/wallet — balance snapshot.
type WalletBalance = {
  balance: number;
  currency: string;
};

export default function ResellerWalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      // Paralel fetch balance + last 5 ledger entries.
      const [b, l] = await Promise.all([
        api<WalletBalance>("/api/v1/wallet"),
        api<{ items: LedgerEntry[] }>("/api/v1/wallet/ledger?limit=5"),
      ]);
      setBalance(b);
      setRecent(l.items || []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <WalletIcon className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Saldo prabayar untuk beli / perpanjang domain. Isi sekali, debit
            otomatis tiap transaksi.
          </p>
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Saldo saat ini
              </p>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {loading && balance === null ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  formatIDR(balance?.balance ?? 0)
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {balance?.currency || "IDR"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild className="gap-1.5">
                <Link href="/reseller/wallet/ledger">
                  <History className="size-4" />
                  Semua Transaksi
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Transaksi Terakhir</h3>
          {loading && recent.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : recent.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Belum ada transaksi. Hubungi admin untuk top-up saldo pertama.
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((e) => (
                <LedgerRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="text-amber-900 dark:text-amber-200">
            Fitur top-up mandiri sedang dalam pengembangan. Untuk isi saldo,
            hubungi admin untuk credit manual.
          </div>
        </CardContent>
      </Card>
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
