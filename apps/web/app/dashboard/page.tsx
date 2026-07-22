"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Pencil,
  BarChart3,
  Globe2,
  CheckCircle2,
  Clock,
  Archive,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
  FileText,
  HardDrive,
  ExternalLink,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Site = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  quota_max_pages: number;
  quota_max_storage_bytes: number;
  updated_at: string;
};

type SiteUsage = {
  pages: { used: number; max: number };
  storage_bytes: { used: number; max: number };
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; class: string }> = {
  published: {
    label: "Published",
    icon: CheckCircle2,
    class: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400",
  },
  draft: {
    label: "Draft",
    icon: Clock,
    class: "bg-muted text-muted-foreground border-border",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    class: "bg-muted text-muted-foreground border-border",
  },
};

// Purchase = shape yang di-return /api/v1/domains/purchases. Kita hanya butuh
// subset di dashboard untuk kartu "sedang diproses"; polling detail dilakukan
// di /sites/pending/[jobId].
type DomainPurchase = {
  job_id: string;
  domain: string;
  status: string;
  payment_url?: string;
};

// Status yang layak ditampilkan di kartu "sedang diproses" dashboard.
// active + failed + expired = terminal, tidak perlu dashboard prompt lagi
// (active yang belum di-attach ditangani di /sites/pending/[jobId] template picker).
const ACTIONABLE_STATUSES = new Set([
  "pending_payment",
  "pending_document",
  "pending_provisioning",
]);

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, SiteUsage>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);
  const [pendingPurchases, setPendingPurchases] = useState<DomainPurchase[]>([]);

  async function refresh() {
    setLoadingSites(true);
    try {
      const list = await api<Site[]>("/api/v1/sites");
      setSites(list);
      const entries = await Promise.all(
        list.map(async (s) => {
          try {
            const u = await api<SiteUsage>(`/api/v1/sites/${s.id}/usage`);
            return [s.id, u] as const;
          } catch {
            return null;
          }
        }),
      );
      const m: Record<string, SiteUsage> = {};
      for (const e of entries) if (e) m[e[0]] = e[1];
      setUsageMap(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingSites(false);
    }
  }

  useEffect(() => {
    refresh();
    // Domain purchases — best effort. Kalau endpoint 404 (registrar disabled),
    // kartu ini tidak muncul.
    //
    // Polling 30s untuk auto-refresh kartu "sedang diproses" — user tidak
    // perlu manual reload saat webhook fire dari registrar. Interval berhenti
    // diam-diam kalau tidak ada pending (no unnecessary requests).
    let cancelled = false;
    async function refreshPurchases() {
      try {
        const list = await api<DomainPurchase[]>("/api/v1/domains/purchases?limit=10");
        if (cancelled) return;
        setPendingPurchases((list ?? []).filter((p) => ACTIONABLE_STATUSES.has(p.status)));
      } catch {
        /* silent — dashboard tidak block */
      }
    }
    refreshPurchases();
    const iv = setInterval(refreshPurchases, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header — 1 domain = 1 situs; tidak ada quota. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Globe2 className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dashboard
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Situs Saya</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loadingSites
              ? "Memuat…"
              : sites.length === 0
                ? "Belum ada situs — beli domain untuk mulai."
                : `${sites.length} situs aktif · 1 domain = 1 situs`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Primary + satu-satunya alur create: beli domain lalu buat situs.
              Free subdomain flow sudah dihapus (produk decision). */}
          <Button className="gap-2 shadow-sm" asChild>
            <Link href="/sites/new-with-domain">
              <Globe2 className="size-4" />
              <span className="hidden sm:inline">Beli Domain + Buat Situs</span>
              <span className="sm:hidden">Beli Domain</span>
            </Link>
          </Button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span><span className="font-medium">Gagal memuat:</span> {err}</span>
        </div>
      )}

      {/* Domain pending — kartu prompt supaya user tidak lupa lanjutkan alurnya */}
      {pendingPurchases.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <Loader2 className="size-4 animate-spin" />
              Domain sedang diproses
            </div>
            <Link
              href="/settings/domains"
              className="text-xs font-medium text-amber-900 underline underline-offset-4 hover:text-amber-700 dark:text-amber-200"
            >
              Lihat semua domain
            </Link>
          </div>
          <div className="space-y-2">
            {pendingPurchases.map((p) => (
              <Link
                key={p.job_id}
                href={`/sites/pending/${p.job_id}`}
                className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary"
              >
                <div className="flex items-center gap-2">
                  <Globe2 className="size-4 text-muted-foreground" />
                  <code className="font-medium">{p.domain}</code>
                  <Badge variant="secondary" className="text-xs">
                    {statusCopy(p.status)}
                  </Badge>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Site grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loadingSites &&
          sites.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-4 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-full rounded bg-muted" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-8 rounded-md bg-muted" />
                <div className="h-8 rounded-md bg-muted" />
                <div className="h-8 rounded-md bg-muted" />
              </div>
            </div>
          ))}

        {!loadingSites && sites.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Belum ada situs</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Beli domain untuk mulai — 1 domain = 1 situs.
            </p>
            <Button asChild className="mt-5 gap-2 shadow-sm">
              <Link href="/sites/new-with-domain">
                <Globe2 className="size-4" />
                Beli Domain + Buat Situs
              </Link>
            </Button>
          </div>
        )}

        {sites.map((s) => {
          const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.draft;
          const Icon = cfg.icon;
          const updated = new Date(s.updated_at).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          return (
            <div
              key={s.id}
              className="group relative flex flex-col rounded-xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 overflow-hidden"
            >
              {s.status === "published" && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500" />
              )}

              <div className="p-5 flex-1 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{s.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      <span className="text-muted-foreground/50">/</span>{s.slug}
                    </p>
                  </div>
                  <Badge className={`shrink-0 gap-1 text-xs ${cfg.class}`}>
                    <Icon className="size-3" />
                    {cfg.label}
                  </Badge>
                </div>

                <SiteUsageMini usage={usageMap[s.id]} />

                <p className="text-[11px] text-muted-foreground">Diperbarui {updated}</p>
              </div>

              <div className="border-t bg-muted/20 px-3 py-2.5 grid grid-cols-3 gap-1.5">
                <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/editor`}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/usage`}>
                    <BarChart3 className="size-3.5" />
                    Statistik
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/domains`}>
                    <Globe2 className="size-3.5" />
                    Domain
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}

        {!loadingSites && sites.length > 0 && (
          <Link
            href="/sites/new-with-domain"
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/10 p-8 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground hover:border-primary/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed">
              <Globe2 className="size-5" />
            </div>
            <span className="text-sm font-medium">Beli Domain + Buat Situs</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function SiteUsageMini({ usage }: { usage: SiteUsage | undefined }) {
  if (!usage) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-full rounded bg-muted animate-pulse" />
        <div className="h-5 w-full rounded bg-muted animate-pulse" />
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <UsageRow
        icon={FileText}
        label="Halaman"
        usedText={`${usage.pages.used} / ${usage.pages.max}`}
        percent={pct(usage.pages.used, usage.pages.max)}
      />
      <UsageRow
        icon={HardDrive}
        label="Storage"
        usedText={`${fmtBytes(usage.storage_bytes.used)} / ${fmtBytes(usage.storage_bytes.max)}`}
        percent={pct(usage.storage_bytes.used, usage.storage_bytes.max)}
      />
    </div>
  );
}

function UsageRow({
  icon: Icon,
  label,
  usedText,
  percent,
}: {
  icon: React.ElementType;
  label: string;
  usedText: string;
  percent: number;
}) {
  const barColor =
    percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    percent >= 90
      ? "text-red-600 dark:text-red-400"
      : percent >= 70
      ? "text-amber-600 dark:text-amber-400"
      : "";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon className="size-3" />
          {label}
        </span>
        <span className={`tabular-nums font-medium ${textColor}`}>{usedText}</span>
      </div>
      <Progress value={percent} indicatorClassName={barColor} className="h-1.5 bg-muted" />
    </div>
  );
}

// statusCopy — mapping raw registrar status → label Indonesia untuk kartu
// "Domain sedang diproses" di dashboard. Sinkron dengan STATUS_INFO di
// /sites/pending/[jobId] tapi ringkas (satu kata) untuk badge kecil.
function statusCopy(status: string): string {
  switch (status) {
    case "pending_payment":
      return "Menunggu bayar";
    case "pending_document":
      return "Menunggu dokumen";
    case "pending_provisioning":
      return "Diproses registrar";
    default:
      return status;
  }
}

