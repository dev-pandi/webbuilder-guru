"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FileText,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  BarChart3,
  Clock,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Metric = { used: number; max: number };
type Usage = {
  site_id: string;
  pages: Metric;
  assets: Metric;
  storage_bytes: Metric;
  at: string;
};

type Snapshot = {
  id: number;
  pages_count: number;
  assets_count: number;
  storage_bytes: number;
  captured_at: string;
};

export default function UsagePage() {
  const params = useParams<{ id: string }>();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [u, h] = await Promise.all([
        api<Usage>(`/api/v1/sites/${params.id}/usage`),
        api<Snapshot[]>(`/api/v1/sites/${params.id}/usage/history?limit=30`),
      ]);
      setUsage(u);
      setHistory(h);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { refresh(); }, [params.id]);

  if (loading && !usage) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-6 space-y-4 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-3 w-36 rounded bg-muted" />
                </div>
                <div className="space-y-1 text-right">
                  <div className="h-7 w-20 rounded bg-muted ml-auto" />
                  <div className="h-3 w-14 rounded bg-muted ml-auto" />
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-muted" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Memuat usage…
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span><span className="font-medium">Gagal memuat:</span> {err}</span>
      </div>
    );
  }

  if (!usage) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <BarChart3 className="size-4 text-blue-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Statistik Penggunaan
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Usage</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" />
            Diperbarui {new Date(usage.at).toLocaleString("id-ID")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh(true)}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <UsageCard
          title="Halaman"
          icon={FileText}
          iconClass="bg-violet-500/10 text-violet-600"
          used={usage.pages.used}
          max={usage.pages.max}
          formatter={(n) => `${n}`}
          unit="halaman"
          subtitle={`${usage.pages.used} dari ${usage.pages.max} halaman dibuat`}
        />
        <UsageCard
          title="Storage Aset"
          icon={HardDrive}
          iconClass="bg-blue-500/10 text-blue-600"
          used={usage.storage_bytes.used}
          max={usage.storage_bytes.max}
          formatter={fmtBytes}
          unit=""
          subtitle={`${usage.assets.used} file diunggah`}
          subtitleIcon={ImageIcon}
        />
      </div>

      {/* History table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b bg-muted/30 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Riwayat Usage</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Snapshot dicatat setiap kali halaman ini dibuka ·{" "}
              <span className="font-medium text-foreground">{history.length}</span> entri terakhir
            </p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="pl-5 font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  Waktu
                </div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5" />
                  Halaman
                </div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="size-3.5" />
                  Aset
                </div>
              </TableHead>
              <TableHead className="pr-5 font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="size-3.5" />
                  Storage
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((s, idx) => {
              const isLatest = idx === 0;
              return (
                <TableRow key={s.id} className="transition-colors">
                  <TableCell className="pl-5 py-3">
                    <div className="flex items-center gap-2">
                      {isLatest && (
                        <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      )}
                      <span className="text-sm text-muted-foreground">
                        {new Date(s.captured_at).toLocaleString("id-ID")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="tabular-nums font-medium">{s.pages_count}</span>
                    <span className="ml-1 text-xs text-muted-foreground">hal</span>
                  </TableCell>
                  <TableCell>
                    <span className="tabular-nums font-medium">{s.assets_count}</span>
                    <span className="ml-1 text-xs text-muted-foreground">file</span>
                  </TableCell>
                  <TableCell className="pr-5 tabular-nums font-medium">
                    {fmtBytes(s.storage_bytes)}
                  </TableCell>
                </TableRow>
              );
            })}
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <BarChart3 className="size-8 opacity-30" />
                    <p className="text-sm font-medium">Belum ada snapshot</p>
                    <p className="text-xs">Buka ulang halaman ini untuk merekam snapshot pertama</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function UsageCard({
  title,
  icon: Icon,
  iconClass,
  used,
  max,
  formatter,
  unit,
  subtitle,
  subtitleIcon: SubIcon,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  used: number;
  max: number;
  formatter: (n: number) => string;
  unit: string;
  subtitle?: string;
  subtitleIcon?: React.ComponentType<{ className?: string }>;
}) {
  const p = pct(used, max);
  const danger = p >= 90;
  const warn = p >= 70 && !danger;
  const barColor = danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500";
  const pctColor = danger
    ? "text-red-600 dark:text-red-400"
    : warn
    ? "text-amber-600 dark:text-amber-400"
    : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconClass}`}>
            <Icon className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {subtitle && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                {SubIcon && <SubIcon className="size-3" />}
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular-nums tracking-tight">
            {formatter(used)}
            {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
          </div>
          <div className="text-xs text-muted-foreground">dari {formatter(max)}{unit ? ` ${unit}` : ""}</div>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <Progress value={p} indicatorClassName={barColor} className="h-2 bg-muted" />
        <div className="flex items-center justify-between text-xs">
          <span className={`font-medium ${pctColor}`}>{p}% terpakai</span>
          {danger && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
              <AlertTriangle className="size-3" />
              Hampir penuh!
            </span>
          )}
          {warn && !danger && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
              <AlertTriangle className="size-3" />
              Mendekati batas
            </span>
          )}
          {!warn && !danger && (
            <span className="text-muted-foreground">{formatter(max - used)}{unit ? ` ${unit}` : ""} tersisa</span>
          )}
        </div>
      </div>
    </div>
  );
}


