"use client";

// Agent ledger detail — paginated, read-only. Mirror /reseller/wallet/ledger
// tapi fetch dari /agent endpoint (agent lihat ledger induk reseller).

import { useEffect, useState } from "react";
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
  id: number;
  kind: string;
  amount: number;
  balance_after: number;
  description?: string;
  created_at: string;
};

type LedgerListResp = {
  items: LedgerEntry[];
  pagination?: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

const KIND_FILTERS = [
  { value: "", label: "Semua" },
  { value: "topup", label: "Top-up" },
  { value: "debit_register", label: "Register" },
  { value: "debit_renew", label: "Renew" },
  { value: "credit_refund_epp", label: "Refund" },
];

export default function AgentLedgerPage() {
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const q = new URLSearchParams({ page: String(page), page_size: "30" });
    if (kind) q.set("kind", kind);
    api<LedgerListResp>(`/api/v1/agent/wallet/ledger?${q.toString()}`)
      .then((res) => {
        setItems(res.items ?? []);
        setTotalPages(res.pagination?.total_pages ?? 1);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [kind, page]);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/agent/wallet">
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
          Semua debit + credit di wallet induk reseller.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {KIND_FILTERS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => {
              setKind(k.value);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              kind === k.value
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
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada transaksi{kind ? ` untuk filter ${kind}` : ""}.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((e) => (
                <LedgerRow key={e.id} entry={e} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Halaman {page} dari {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
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
