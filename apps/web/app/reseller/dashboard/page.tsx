"use client";

// Reseller dashboard — Phase 1 skeleton. Empty state karena belum ada
// data (client / agent / domain). Phase 2-3 nanti populate real stats.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Clock,
  Globe2,
  Loader2,
  PlusCircle,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type PurchaseRow = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  client_id: string;
  client_name: string;
  client_email: string;
};

type WalletSnapshot = { balance: number; currency: string };

type Stats = {
  clients: number;
  clients_via_agents?: number; // klien yang di-invite agent (bukan direct)
  agents: number;
  active_domains: number;
  expiring_30_days: number;
  expiring_90_days: number;
  pending_jobs: number;
};

export default function ResellerDashboardPage() {
  const [purchases, setPurchases] = useState<PurchaseRow[] | null>(null);
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api<PurchaseRow[]>("/api/v1/reseller/purchases?limit=10")
      .then((r) => setPurchases(r ?? []))
      .catch(() => setPurchases([]));
    api<WalletSnapshot>("/api/v1/wallet")
      .then((w) => setWallet(w))
      .catch(() => setWallet({ balance: 0, currency: "IDR" }));
    api<Stats>("/api/v1/reseller/stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Selamat datang!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Portal reseller Anda. Mulai dari daftarkan klien baru atau undang agent
          ke tim.
        </p>
      </div>

      {/* Stat tiles — populated dari /reseller/stats (Phase 6). */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Klien saya"
          value={stats ? String(stats.clients) : "…"}
          sub={
            stats && (stats.clients_via_agents ?? 0) > 0
              ? `+${stats.clients_via_agents} via agent`
              : undefined
          }
          subTone="muted"
          href="/reseller/clients"
        />
        <StatTile
          icon={UserPlus}
          label="Agent"
          value={stats ? String(stats.agents) : "…"}
          href="/reseller/team"
        />
        <StatTile
          icon={Globe2}
          label="Domain aktif"
          value={stats ? String(stats.active_domains) : "…"}
          sub={
            stats && stats.expiring_30_days > 0
              ? `${stats.expiring_30_days} expire ≤ 30 hari`
              : undefined
          }
        />
        <StatTile
          icon={Wallet}
          label="Saldo Wallet"
          value={wallet ? formatIDR(wallet.balance) : "…"}
          href="/reseller/wallet"
        />
      </div>

      {/* Quick actions */}
      <Card>
        <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
          <QuickAction
            title="Daftarkan Klien Baru"
            desc="Tambah klien lalu beli domain atas nama mereka."
            icon={PlusCircle}
            href="/reseller/clients"
          />
          <QuickAction
            title="Undang Agent"
            desc="Tambahkan agent freelancer ke tim Anda."
            icon={UserPlus}
            href="/reseller/team"
          />
        </CardContent>
      </Card>

      {/* On-behalf-of purchases — Phase 3 */}
      <PurchasesCard rows={purchases} />

      {/* Getting started checklist */}
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Checklist onboarding</h3>
          <ul className="space-y-2 text-sm">
            <StepItem done label="Aplikasi disetujui" />
            <StepItem label="Set harga jual (agent + client)" href="/reseller/pricing" />
            <StepItem label="Top-up wallet awal" href="/reseller/wallet" />
            <StepItem label="Undang agent pertama (opsional)" />
            <StepItem label="Daftarkan klien pertama" />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function PurchasesCard({ rows }: { rows: PurchaseRow[] | null }) {
  async function downloadCSV() {
    // CSV endpoint di backend butuh auth header, jadi fetch + blob download
    // (bukan href langsung — <a> tag tidak kirim Authorization).
    const token = localStorage.getItem("wb_access_token");
    const base = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";
    try {
      const res = await fetch(`${base}/api/v1/reseller/purchases.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reseller-domains.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Gagal export CSV: " + (e as Error).message);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe2 className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Domain yang saya proses</h3>
          </div>
          {rows && rows.length > 0 && (
            <button
              type="button"
              onClick={downloadCSV}
              className="text-xs font-medium text-primary hover:underline"
            >
              Export CSV
            </button>
          )}
        </div>
        {rows === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Belum ada domain yang Anda beli atas nama klien. Buka daftar klien
            → tombol{" "}
            <span className="font-medium text-foreground">Beli Domain</span>.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.job_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium font-mono">{r.domain}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    untuk {r.client_name || r.client_email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  <Button size="sm" variant="ghost" asChild className="gap-1">
                    <Link href={`/sites/pending/${r.job_id}`}>
                      Buka
                      <ArrowRight className="size-3" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success" className="text-[10px]">Aktif</Badge>;
  if (status === "failed") return <Badge variant="destructive" className="text-[10px]">Gagal</Badge>;
  if (status === "cancelled") return <Badge variant="secondary" className="text-[10px]">Batal</Badge>;
  if (status === "expired") return <Badge variant="secondary" className="text-[10px]">Kadaluarsa</Badge>;
  return (
    <Badge variant="warning" className="gap-1 text-[10px]">
      <Clock className="size-2.5" />
      Proses
    </Badge>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  href,
  sub,
  subTone = "warn",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href?: string;
  sub?: string;
  // Warna sub-text: "warn" (amber, default — untuk expiring domain), "muted"
  // (muted-foreground, untuk info netral seperti "+N via agent").
  subTone?: "warn" | "muted";
}) {
  const body = (
    <Card className={href ? "transition-colors hover:border-primary" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2 text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        {sub && (
          <p
            className={
              subTone === "muted"
                ? "mt-0.5 text-[11px] text-muted-foreground"
                : "mt-0.5 text-[11px] text-amber-600"
            }
          >
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function QuickAction({
  title,
  desc,
  icon: Icon,
  href,
  disabled,
  note,
}: {
  title: string;
  desc: string;
  icon: React.ElementType;
  href: string;
  disabled?: boolean;
  note?: string;
}) {
  const content = (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-primary/10 p-2 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
        {disabled && note ? (
          <p className="mt-1 text-[10px] italic text-amber-600">{note}</p>
        ) : null}
      </div>
      {!disabled && <ArrowRight className="size-4 text-muted-foreground" />}
    </div>
  );
  if (disabled) {
    return (
      <div className="cursor-not-allowed rounded-lg border border-dashed p-3 opacity-60">
        {content}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-lg border p-3 transition-colors hover:border-primary hover:bg-primary/5"
    >
      {content}
    </Link>
  );
}

function StepItem({
  done,
  label,
  href,
}: {
  done?: boolean;
  label: string;
  href?: string;
}) {
  const inner = (
    <span className="flex items-center gap-2">
      <span
        className={
          done
            ? "inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white"
            : "inline-flex size-5 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-xs text-muted-foreground"
        }
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "line-through opacity-60" : ""}>{label}</span>
    </span>
  );
  if (href && !done) {
    return (
      <li>
        <Link
          href={href}
          className="inline-flex items-center gap-2 hover:text-foreground"
        >
          {inner}
          <span className="ml-auto text-xs text-primary">Buka →</span>
        </Link>
      </li>
    );
  }
  return <li>{inner}</li>;
}
