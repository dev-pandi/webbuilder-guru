"use client";

// Admin overview — KPI + actionable alerts + business breakdown.
// Alert card di paling atas supaya admin langsung lihat kalau ada yang
// butuh intervensi (topup approve pending, purchase stuck, dst).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  DollarSign,
  Globe2,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Stats = {
  // Users & roles
  user_count: number;
  admin_count: number;
  active_resellers: number;
  total_agents: number;
  managed_clients: number;

  // Sites
  site_count: number;
  published_sites: number;
  page_count: number;

  // Custom hostname (SSL / DNS mapping)
  custom_hostnames: number;
  verified_domains: number;

  // Registered domains (EPP-owned)
  registered_domains: number;
  expiring_30d: number;

  // Financial
  total_revenue_idr: number;
  revenue_this_month_idr: number;
  unpaid_invoices: number;
  total_wallet_balance_idr: number;

  // Actionable alerts
  topups_awaiting_review: number;
  stuck_pending_provisioning: number;
  failed_purchases_today: number;

  // Storage
  asset_count: number;
  total_storage_bytes: number;
};

function fmtIDR(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}k`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default function AdminOverviewPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/v1/admin/stats")
      .then(setS)
      .catch((e) => setErr((e as Error).message));
  }, []);

  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const alertCount = s
    ? s.topups_awaiting_review + s.stuck_pending_provisioning + s.failed_purchases_today
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Activity className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Admin Dashboard
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{dateStr}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm shadow-sm">
          {alertCount > 0 ? (
            <>
              <ShieldAlert className="size-4 text-amber-500" />
              <span className="font-medium">
                {alertCount} item butuh perhatian
              </span>
            </>
          ) : (
            <>
              <TrendingUp className="size-4 text-emerald-500" />
              <span className="font-medium">Semua sistem berjalan normal</span>
            </>
          )}
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="font-medium">Gagal memuat data:</span> {err}
        </div>
      )}

      {!s ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat statistik…
        </div>
      ) : (
        <>
          {/* Alert section — muncul cuma kalau ada item aksi */}
          {alertCount > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-amber-600" />
                  <h2 className="text-sm font-semibold">
                    Butuh Perhatian Admin
                  </h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {s.topups_awaiting_review > 0 && (
                    <AlertRow
                      href="/admin/wallet/topups?status=pending_payment&has_proof=true"
                      icon={Wallet}
                      label="Top-up menunggu review"
                      count={s.topups_awaiting_review}
                      hint="Manual bank + bukti sudah upload"
                    />
                  )}
                  {s.stuck_pending_provisioning > 0 && (
                    <AlertRow
                      href="/admin/domain/purchases?status=pending_provisioning"
                      icon={Wrench}
                      label="Domain stuck di provisioning"
                      count={s.stuck_pending_provisioning}
                      hint="> 10 menit tidak transisi"
                    />
                  )}
                  {s.failed_purchases_today > 0 && (
                    <AlertRow
                      href="/admin/domain/purchases?status=failed"
                      icon={Zap}
                      label="Purchase gagal hari ini"
                      count={s.failed_purchases_today}
                      hint="EPP execute error"
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* KPI utama — 4 kolom */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPI
              label="Revenue Bulan Ini"
              value={fmtIDR(s.revenue_this_month_idr)}
              hint={`Total lifetime ${fmtIDR(s.total_revenue_idr)}`}
              icon={DollarSign}
              color="emerald"
            />
            <KPI
              label="Domain Aktif"
              value={String(s.registered_domains)}
              hint={
                s.expiring_30d > 0
                  ? `${s.expiring_30d} akan expire ≤ 30 hari`
                  : "Semua sehat"
              }
              hintUrgent={s.expiring_30d > 0}
              icon={Globe2}
              color="blue"
            />
            <KPI
              label="Wallet Pool"
              value={fmtIDR(s.total_wallet_balance_idr)}
              hint={`${s.unpaid_invoices} invoice belum bayar`}
              icon={Wallet}
              color="violet"
            />
            <KPI
              label="Pengguna"
              value={String(s.user_count)}
              hint={`${s.admin_count} admin · ${s.managed_clients} klien dikelola`}
              icon={Users}
              color="rose"
            />
          </div>

          {/* Business breakdown — role composition + sites */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Mini
              icon={Briefcase}
              label="Reseller Aktif"
              value={s.active_resellers}
            />
            <Mini icon={Users} label="Agent" value={s.total_agents} />
            <Mini
              icon={ShieldCheck}
              label="Situs Live"
              value={s.published_sites}
              suffix={` / ${s.site_count}`}
            />
            <Mini
              icon={Receipt}
              label="Halaman"
              value={s.page_count}
            />
          </div>

          {/* Infra section */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <HardDrive className="size-4 text-cyan-500" />
                  <h3 className="text-sm font-semibold">Storage</h3>
                </div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {fmtBytes(s.total_storage_bytes)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.asset_count} file di seluruh situs
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ImageIcon className="size-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">Custom Hostname</h3>
                </div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {s.custom_hostnames}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {s.verified_domains} verified · SSL aktif
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Receipt className="size-4 text-orange-500" />
                  <h3 className="text-sm font-semibold">Invoice</h3>
                </div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {s.unpaid_invoices}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Menunggu pembayaran user
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// KPI card — highlight utama dengan tint color per kategori.
function KPI({
  label,
  value,
  hint,
  hintUrgent,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  hint: string;
  hintUrgent?: boolean;
  icon: React.ElementType;
  color: "emerald" | "blue" | "violet" | "rose";
}) {
  const tint: Record<typeof color, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  return (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="p-5">
        <div className="mb-3 flex items-start justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <div
            className={`flex size-9 items-center justify-center rounded-lg ${tint[color]}`}
          >
            <Icon className="size-4" />
          </div>
        </div>
        <p className="text-3xl font-bold tabular-nums tracking-tight">{value}</p>
        <p
          className={`mt-1.5 text-xs ${hintUrgent ? "text-destructive font-medium" : "text-muted-foreground"}`}
        >
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}

// Mini stat — 1 baris compact.
function Mini({
  icon: Icon,
  label,
  value,
  suffix,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold tabular-nums tracking-tight">
            {value}
            {suffix && (
              <span className="text-sm font-normal text-muted-foreground">
                {suffix}
              </span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Alert row inside "Butuh Perhatian" card — clickable ke halaman aksi.
function AlertRow({
  href,
  icon: Icon,
  label,
  count,
  hint,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  count: number;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-amber-500/20 bg-background/60 p-3 transition-colors hover:border-amber-500/50 hover:bg-amber-500/5"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{label}</p>
          <Badge variant="warning" className="text-[10px]">
            {count}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
