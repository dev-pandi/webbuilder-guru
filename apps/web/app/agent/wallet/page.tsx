"use client";

// Agent wallet dashboard — view saldo agent (read-only). Data dari
// `wallet_local` via `/api/v1/wallet` (Phase 1 self-sufficient).
//
// Note: di flow self-sufficient, tiap user (termasuk agent) punya balance
// sendiri di `wallet_balances`. Top-up mandiri belum tersedia — admin
// credit manual via /admin/wallet/adjust.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  History,
  Info,
  Loader2,
  Wallet as WalletIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type WalletBalance = {
  balance: number;
  currency: string;
};

export default function AgentWalletPage() {
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
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
            Saldo prabayar Anda — di-debit tiap Anda beli/perpanjang domain
            atas nama klien.
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
            <Button variant="outline" asChild className="gap-1.5">
              <Link href="/agent/wallet/ledger">
                <History className="size-4" />
                Semua Transaksi
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 translate-y-0.5 text-primary" />
        <span>
          Fitur top-up mandiri sedang dalam pengembangan. Untuk isi saldo,
          hubungi admin untuk credit manual.
        </span>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Transaksi Terakhir</h3>
          {loading && recent.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : recent.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Belum ada transaksi.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((e) => (
                <LedgerRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
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
