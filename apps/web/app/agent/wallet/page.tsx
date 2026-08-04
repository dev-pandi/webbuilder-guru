"use client";

// Agent wallet page — read-only view. Agent tidak punya wallet terpisah:
// setiap purchase/renew di-debit dari wallet reseller induk. Halaman ini
// hanya tampilkan aktivitas agent (dari wallet_ledger reseller, filter
// metadata.agent_id) supaya agent bisa lihat kontribusinya.

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Info,
  Loader2,
  ShieldCheck,
  Wallet as WalletIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export default function AgentWalletPage() {
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: LedgerEntry[] }>("/api/v1/wallet/agent-activity?limit=50")
      .then((res) => setItems(res.items || []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <WalletIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Sebagai agent, transaksi register / renew domain di-debit dari saldo
          reseller Anda — bukan wallet pribadi. Anda tidak perlu top-up.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div className="flex-1 space-y-1.5">
            <h3 className="text-sm font-semibold">Saldo dikelola reseller</h3>
            <p className="text-sm text-muted-foreground">
              Saldo tidak ditampilkan di sini demi privasi reseller.
              Kalau saldo reseller habis, transaksi Anda akan ditolak dengan
              pesan &ldquo;saldo tidak cukup&rdquo; — minta reseller untuk
              top-up.
            </p>
            <p className="text-xs text-muted-foreground">
              Reseller bisa lihat rincian transaksi per-agent di halaman
              wallet mereka.
            </p>
          </div>
        </CardContent>
      </Card>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Aktivitas Anda</h3>
            <span className="text-xs text-muted-foreground">
              {items.length} transaksi
            </span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Memuat…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Info className="size-6 text-muted-foreground/60" />
              <p>Belum ada transaksi.</p>
              <p className="text-xs">
                Aktivitas akan muncul setelah Anda beli atau perpanjang domain
                dengan metode pembayaran <code>deposit_wallet</code>.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((e) => (
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
  const label = reasonLabel(entry.reason);
  const forClient = (entry.metadata?.for_client_id as string) || undefined;
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ArrowUpRight className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDate(entry.created_at)}
            {forClient && ` · untuk klien ${forClient.slice(0, 8)}…`}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">
          {formatIDR(entry.delta)}
        </p>
      </div>
    </li>
  );
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    debit_register: "Debit — Register Domain",
    debit_renew: "Debit — Renew Domain",
    refund: "Refund",
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
