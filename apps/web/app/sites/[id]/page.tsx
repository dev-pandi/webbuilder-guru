"use client";

// Dashboard Ringkasan (spec §21) — landing setiap site setelah user pilih
// dari dashboard. Menampilkan agregat statistik + list tulisan/tanggapan
// terbaru. Semua endpoint sudah tenant-safe; angka 0 kalau site belum
// pakai fitur guru (bukan error).

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Clock,
  Eye,
  FileText,
  Loader2,
  Megaphone,
  MessageSquare,
  Newspaper,
  Pencil,
  Rocket,
} from "lucide-react";
import {
  api,
  GURU_RUBRIC_LABEL,
  RESPONSE_ROLE_LABEL,
  type Article,
  type Banner,
  type LearningMaterial,
  type ResponseItem,
  type SiteStats,
} from "@/lib/api";
import type { PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
  tone?: "default" | "warning";
  href?: string;
};

function StatCard({ label, value, icon: Icon, sub, tone = "default", href }: StatCardProps) {
  const inner = (
    <Card
      className={`transition-all ${
        href ? "hover:border-primary/40 hover:shadow-md" : ""
      }`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {value}
            </p>
            {sub && (
              <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
            )}
          </div>
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
              tone === "warning"
                ? "bg-amber-500/10 text-amber-600"
                : "bg-violet-500/10 text-violet-600"
            }`}
          >
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min}m lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}h lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

export default function SiteDashboardPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;

  const [stats, setStats] = useState<SiteStats | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [latestArticles, setLatestArticles] = useState<Article[]>([]);
  const [latestResponses, setLatestResponses] = useState<ResponseItem[]>([]);
  const [materialsCount, setMaterialsCount] = useState<number | null>(null);
  const [bannersCount, setBannersCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        // Parallel fetch — kalau ada yg gagal (mis. rate-limit), yang lain
        // tetap tampil. Fallback ke null / [] per section.
        const [statsRes, pendingRes, articlesRes, respRes, materialsRes, bannersRes] =
          await Promise.all([
            api<SiteStats>(`/api/v1/sites/${sid}/site-stats`).catch(() => null),
            api<PaginatedResult<ResponseItem>>(
              `/api/v1/sites/${sid}/responses?status=pending&page_size=1`,
            ).catch(() => null),
            api<PaginatedResult<Article>>(
              `/api/v1/sites/${sid}/articles?status=published&sort=published_desc&page_size=5`,
            ).catch(() => null),
            api<PaginatedResult<ResponseItem>>(
              `/api/v1/sites/${sid}/responses?page_size=5`,
            ).catch(() => null),
            api<PaginatedResult<LearningMaterial>>(
              `/api/v1/sites/${sid}/learning-materials?page_size=1`,
            ).catch(() => null),
            api<Banner[]>(`/api/v1/sites/${sid}/banners`).catch(() => null),
          ]);

        if (cancelled) return;
        setStats(statsRes);
        setPendingCount(pendingRes?.total ?? 0);
        setLatestArticles(articlesRes?.items ?? []);
        setLatestResponses(respRes?.items ?? []);
        setMaterialsCount(materialsRes?.total ?? 0);
        // Banner aktif = teacher_active && admin_enabled && period valid.
        const activeBanners = (bannersRes ?? []).filter(
          (b) => b.effective_status === "active",
        );
        setBannersCount(activeBanners.length);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sid]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat ringkasan…
      </div>
    );
  }

  if (err) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            <span className="font-medium">Gagal memuat:</span> {err}
          </span>
        </div>
      </div>
    );
  }

  const s = stats ?? { total_views: 0, total_responses: 0, total_articles: 0 };
  const totalContent = s.total_articles + (materialsCount ?? 0);
  const hasContent = totalContent > 0 || (bannersCount ?? 0) > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <BarChart3 className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Ringkasan Situs
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Aktivitas dan statistik terkini dari website Anda.
          </p>
        </div>
        <Button asChild className="gap-2 shadow-sm">
          <Link href={`/sites/${sid}/editor`}>
            <Pencil className="size-4" />
            Buka Editor
          </Link>
        </Button>
      </div>

      {/* Empty state — situs baru tanpa konten sama sekali */}
      {!hasContent && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-violet-500/10">
              <Rocket className="size-5 text-violet-600" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Selamat datang!</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Mulai isi website Anda dari salah satu menu di atas. Anda bisa
                langsung menulis, menambahkan materi, atau memasang banner
                promosi.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/sites/${sid}/tulisan/new`}>
                  <Newspaper className="size-3.5" /> Tulisan Baru
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/sites/${sid}/pembelajaran/new`}>
                  <BookOpen className="size-3.5" /> Materi Baru
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/sites/${sid}/promosi`}>
                  <Megaphone className="size-3.5" /> Buat Banner
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat cards — spec §21 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Views"
          value={s.total_views.toLocaleString("id-ID")}
          sub="Semua tulisan + forum"
          icon={Eye}
        />
        <StatCard
          label="Tulisan Published"
          value={s.total_articles.toLocaleString("id-ID")}
          sub={`${(materialsCount ?? 0).toLocaleString("id-ID")} materi pembelajaran`}
          icon={FileText}
          href={`/sites/${sid}/tulisan`}
        />
        <StatCard
          label="Tanggapan Approved"
          value={s.total_responses.toLocaleString("id-ID")}
          sub="Tampil publik"
          icon={MessageSquare}
          href={`/sites/${sid}/tanggapan?status=approved`}
        />
        <StatCard
          label="Menunggu Moderasi"
          value={(pendingCount ?? 0).toLocaleString("id-ID")}
          sub="Tanggapan pending"
          icon={Clock}
          tone={pendingCount && pendingCount > 0 ? "warning" : "default"}
          href={`/sites/${sid}/tanggapan?status=pending`}
        />
        <StatCard
          label="Materi Pembelajaran"
          value={(materialsCount ?? 0).toLocaleString("id-ID")}
          sub="Dipublikasikan"
          icon={BookOpen}
          href={`/sites/${sid}/pembelajaran`}
        />
        <StatCard
          label="Banner Aktif"
          value={(bannersCount ?? 0).toLocaleString("id-ID")}
          sub="Tampil di beranda"
          icon={Megaphone}
          href={`/sites/${sid}/promosi`}
        />
      </div>

      {/* Latest content lists */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Latest articles */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold">Tulisan Terbaru</CardTitle>
            <Link
              href={`/sites/${sid}/tulisan`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Semua <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {latestArticles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
                <Newspaper className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Belum ada tulisan yang dipublikasikan.
                </p>
                <Button asChild size="sm" variant="ghost" className="gap-1.5">
                  <Link href={`/sites/${sid}/tulisan/new`}>
                    <Pencil className="size-3.5" /> Tulis pertama
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="divide-y">
                {latestArticles.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/sites/${sid}/tulisan/${a.id}/edit`}
                      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">
                          {a.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {GURU_RUBRIC_LABEL[a.rubric]}
                          </Badge>
                          <span>{a.view_count.toLocaleString("id-ID")} views</span>
                          {a.published_at && <span>· {timeAgo(a.published_at)}</span>}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Latest responses */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold">Tanggapan Terbaru</CardTitle>
            <Link
              href={`/sites/${sid}/tanggapan`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Semua <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {latestResponses.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
                <MessageSquare className="size-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Belum ada tanggapan.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {latestResponses.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/sites/${sid}/tanggapan?status=${r.status}`}
                      className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium">{r.author_name}</p>
                          {r.status === "pending" ? (
                            <Badge variant="warning" className="h-4 px-1.5 text-[10px]">
                              Pending
                            </Badge>
                          ) : r.status === "approved" ? (
                            <Badge variant="success" className="h-4 px-1.5 text-[10px]">
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                              Rejected
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {r.body}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {RESPONSE_ROLE_LABEL[r.author_role]} · {timeAgo(r.created_at)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
