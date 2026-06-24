"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Globe2,
  FileText,
  ShieldCheck,
  Image as ImageIcon,
  HardDrive,
  TrendingUp,
  Activity,
  ArrowUpRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Stats = {
  user_count: number;
  admin_count: number;
  site_count: number;
  published_sites: number;
  page_count: number;
  domain_count: number;
  verified_domains: number;
  asset_count: number;
  total_storage_bytes: number;
};

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-5 animate-pulse">
      <div className="flex items-center justify-between mb-4">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-9 w-9 rounded-lg bg-muted" />
      </div>
      <div className="h-8 w-20 rounded bg-muted mb-2" />
      <div className="h-3 w-32 rounded bg-muted" />
    </div>
  );
}

export default function AdminOverviewPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/v1/admin/stats")
      .then(setS)
      .catch((e) => setErr((e as Error).message));
  }, []);

  const cards = s
    ? [
        {
          label: "User Terdaftar",
          value: String(s.user_count),
          hint: `${s.admin_count} admin`,
          icon: Users,
          color: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
          badge: null,
        },
        {
          label: "Situs Aktif",
          value: String(s.site_count),
          hint: `${s.published_sites} dipublikasikan`,
          icon: Globe2,
          color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
          badge: s.published_sites > 0 ? `${Math.round((s.published_sites / s.site_count) * 100)}% live` : null,
        },
        {
          label: "Total Halaman",
          value: String(s.page_count),
          hint: "di seluruh situs",
          icon: FileText,
          color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          badge: null,
        },
        {
          label: "Domain",
          value: String(s.domain_count),
          hint: `${s.verified_domains} terverifikasi`,
          icon: ShieldCheck,
          color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          badge: s.verified_domains > 0 ? `${s.verified_domains} verified` : null,
        },
        {
          label: "Aset",
          value: String(s.asset_count),
          hint: "file diunggah",
          icon: ImageIcon,
          color: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
          badge: null,
        },
        {
          label: "Storage Digunakan",
          value: fmtBytes(s.total_storage_bytes),
          hint: "total kapasitas terpakai",
          icon: HardDrive,
          color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
          badge: null,
        },
      ]
    : [];

  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Activity className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Admin Dashboard
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Statistik keseluruhan platform — {dateStr}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm shadow-sm">
          <TrendingUp className="size-4 text-emerald-500" />
          <span className="font-medium">Semua sistem berjalan normal</span>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="font-medium">Gagal memuat data:</span> {err}
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!s
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : cards.map((c) => (
              <Card
                key={c.label}
                className="group relative overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
              >
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3 pt-5 px-5">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {c.label}
                  </CardTitle>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
                    <c.icon className="size-4" />
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold tabular-nums tracking-tight">
                      {c.value}
                    </div>
                    {c.badge && (
                      <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <ArrowUpRight className="size-3" />
                        {c.badge}
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{c.hint}</p>
                </CardContent>
                {/* subtle accent line at bottom */}
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${c.color.replace("bg-", "bg-").split(" ")[0]}`} />
              </Card>
            ))}
      </div>

      {/* Summary bar */}
      {s && (
        <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Ringkasan</span>
            <span>
              <span className="font-semibold text-foreground">{s.user_count}</span> pengguna terdaftar
            </span>
            <span>
              <span className="font-semibold text-foreground">{s.published_sites}</span> situs live
            </span>
            <span>
              <span className="font-semibold text-foreground">{s.verified_domains}</span> domain aktif
            </span>
            <span>
              <span className="font-semibold text-foreground">{fmtBytes(s.total_storage_bytes)}</span> storage terpakai
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
