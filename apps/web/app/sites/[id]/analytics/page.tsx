"use client";

// Analytics MVP — daily-bucket page view chart + top pages + summary card.
// Data dari GET /api/v1/sites/:id/analytics (aggregated per hari).
//
// Chart: bar chart sederhana pakai pure CSS (bar-height % dari max). Tidak
// pakai library chart (recharts/etc.) supaya bundle tetap lean.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  BarChart3,
  Loader2,
  AlertCircle,
  TrendingUp,
  Eye,
  FileText,
  Inbox,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type DailyPoint = { date: string; views: number };
type PageTotal = { page_slug: string; views: number };
type Summary = {
  total_views: number;
  total_days: number;
  daily: DailyPoint[];
  top_pages: PageTotal[];
  views_today: number;
  views_yesterday: number;
};

type Form = { id: string; name: string };

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const siteID = params.id;
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [formCount, setFormCount] = useState<{ forms: number; submissions: number } | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [s, forms] = await Promise.all([
        api<Summary>(`/api/v1/sites/${siteID}/analytics?days=${days}`),
        api<Form[]>(`/api/v1/sites/${siteID}/forms`).catch(() => [] as Form[]),
      ]);
      setSummary(s);
      // Count submissions across all forms — parallel fetch.
      if (forms.length > 0) {
        const results = await Promise.allSettled(
          forms.map((f) =>
            api<{ items: unknown[]; total: number }>(
              `/api/v1/forms/${f.id}/submissions?page=1&page_size=1`,
            ),
          ),
        );
        const totalSub = results.reduce(
          (acc, r) => acc + (r.status === "fulfilled" ? (r.value.total ?? 0) : 0),
          0,
        );
        setFormCount({ forms: forms.length, submissions: totalSub });
      } else {
        setFormCount({ forms: 0, submissions: 0 });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteID, days]);

  // Isi date gap dengan 0 supaya chart tidak sparse.
  const filled = useMemo(() => {
    if (!summary) return [];
    const map = new Map<string, number>();
    for (const p of summary.daily) {
      const key = new Date(p.date).toISOString().slice(0, 10);
      map.set(key, p.views);
    }
    const out: DailyPoint[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ date: key, views: map.get(key) ?? 0 });
    }
    return out;
  }, [summary, days]);

  const maxView = useMemo(() => filled.reduce((m, p) => Math.max(m, p.views), 0), [filled]);
  const delta = summary
    ? summary.views_today - summary.views_yesterday
    : 0;
  const deltaPct =
    summary && summary.views_yesterday > 0
      ? Math.round((delta / summary.views_yesterday) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <BarChart3 className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Analitik
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Analitik</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jumlah kunjungan halaman + form submissions dalam {days} hari terakhir.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-background p-0.5 text-xs font-medium">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d as 7 | 30 | 90)}
                className={
                  "rounded-md px-3 py-1 transition-colors " +
                  (days === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {d}d
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </Button>
        </div>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Headline stat cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Eye}
          label="Views hari ini"
          value={summary?.views_today ?? 0}
          hint={
            summary && summary.views_yesterday > 0 ? (
              <span
                className={
                  delta > 0
                    ? "text-emerald-600"
                    : delta < 0
                      ? "text-destructive"
                      : "text-muted-foreground"
                }
              >
                {delta > 0 ? "+" : ""}
                {deltaPct}% dari kemarin
              </span>
            ) : (
              "Baseline — belum ada data kemarin"
            )
          }
        />
        <StatCard
          icon={TrendingUp}
          label={`Total ${days} hari`}
          value={summary?.total_views ?? 0}
        />
        <StatCard
          icon={Inbox}
          label="Form submissions (all-time)"
          value={formCount?.submissions ?? 0}
          hint={formCount ? `${formCount.forms} form aktif` : undefined}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="size-4 text-muted-foreground" />
            Kunjungan per hari
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !summary ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat…
            </div>
          ) : filled.length === 0 || summary?.total_views === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <BarChart3 className="size-8 opacity-30" />
              <p>Belum ada kunjungan tercatat di window ini.</p>
              <p className="text-xs">Publish situs + tunggu visitor pertama.</p>
            </div>
          ) : (
            <BarChart data={filled} max={maxView} />
          )}
        </CardContent>
      </Card>

      {/* Top pages */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-muted-foreground" />
            Halaman paling ramai
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!summary || summary.top_pages.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Belum ada data.
            </p>
          ) : (
            <ul className="divide-y">
              {summary.top_pages.map((p) => (
                <li key={p.page_slug} className="flex items-center gap-3 py-2.5">
                  <code className="min-w-0 flex-1 truncate text-sm">
                    {p.page_slug || "/"}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {p.page_slug ? "" : "(homepage)"}
                    </span>
                  </code>
                  <Badge variant="secondary" className="text-xs">
                    {p.views.toLocaleString("id-ID")} views
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        <div className="text-3xl font-bold tabular-nums">
          {value.toLocaleString("id-ID")}
        </div>
        {hint && <div className="mt-1 text-xs">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// BarChart — pure CSS, no library. Height % dari max value; label MM/DD di bar
// pertama + terakhir + peak untuk konteks tanpa clutter.
function BarChart({ data, max }: { data: DailyPoint[]; max: number }) {
  const effectiveMax = Math.max(max, 1);
  const peakIndex = data.reduce(
    (best, p, i) => (p.views > data[best].views ? i : best),
    0,
  );

  return (
    <div className="w-full">
      <div className="flex h-40 items-end gap-1">
        {data.map((p, i) => {
          const pct = (p.views / effectiveMax) * 100;
          const showLabel = i === 0 || i === data.length - 1 || i === peakIndex;
          return (
            <div
              key={p.date}
              className="group relative flex flex-1 flex-col items-center justify-end"
              title={`${formatDate(p.date)}: ${p.views} views`}
            >
              <div
                className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(pct, 1)}%` }}
              />
              {showLabel && (
                <span className="mt-1 text-[9px] tabular-nums text-muted-foreground">
                  {formatDateShort(p.date)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "numeric",
    });
  } catch {
    return iso;
  }
}
