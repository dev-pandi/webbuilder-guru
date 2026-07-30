"use client";

// Agent wallet dashboard — view saldo induk reseller (read-only). Agent
// tidak bisa top-up sendiri; kalau butuh dana, minta reseller.

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
  id: number;
  kind: string;
  amount: number;
  balance_after: number;
  description?: string;
  created_at: string;
};

type Wallet = {
  balance: number;
  currency: string;
  recent_ledger: LedgerEntry[];
};

export default function AgentWalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const w = await api<Wallet>("/api/v1/agent/wallet");
      setWallet(w);
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
            Saldo induk reseller — di-debit tiap Anda beli/perpanjang domain
            atas nama klien. Read-only: minta reseller kalau butuh top-up.
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
                Saldo induk reseller
              </p>
              <p className="mt-1 text-4xl font-bold tracking-tight">
                {loading && wallet === null ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : (
                  formatIDR(wallet?.balance ?? 0)
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {wallet?.currency || "IDR"}
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
          Anda tidak bisa top-up wallet ini secara langsung — saldonya milik
          reseller induk. Kalau saldo hampir habis, koordinasikan dengan reseller.
        </span>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Transaksi Terakhir</h3>
          {loading && wallet === null ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : !wallet?.recent_ledger?.length ? (
            <p className="py-4 text-sm text-muted-foreground">
              Belum ada transaksi.
            </p>
          ) : (
            <ul className="divide-y">
              {wallet.recent_ledger.map((e) => (
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
  const isCredit = entry.amount > 0;
  const label = kindLabel(entry.kind);
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
          {entry.description && (
            <p className="truncate text-xs text-muted-foreground">
              {entry.description}
            </p>
          )}
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
          {formatIDR(entry.amount)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          sisa {formatIDR(entry.balance_after)}
        </p>
      </div>
    </li>
  );
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    topup: "Top-up",
    debit_register: "Debit — Register Domain",
    debit_renew: "Debit — Renew Domain",
    credit_refund_epp: "Refund — EPP gagal",
    credit_refund_admin: "Refund — Admin",
    debit_admin: "Debit — Admin",
  };
  return map[kind] || kind;
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
