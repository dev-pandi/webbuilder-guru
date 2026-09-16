"use client";

// Dashboard Guru — landing setiap site. Mirror mockup dashboard-guru/index.html,
// data live dari API (stats, tulisan terbaru, tanggapan pending, banner aktif).

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Megaphone,
  Newspaper,
  PenLine,
  Plus,
} from "lucide-react";
import {
  api,
  GURU_RUBRIC_LABEL,
  type Article,
  type Banner,
  type ResponseItem,
  type SiteStats,
} from "@/lib/api";
import type { PaginatedResult } from "@/components/Pagination";

type ChipTone = "green" | "gray" | "amber" | "red" | "blue" | "purple";

function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const tones: Record<ChipTone, string> = {
    green: "bg-emerald-100 text-emerald-800",
    gray: "bg-slate-100 text-slate-600",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    blue: "bg-blue-100 text-blue-800",
    purple: "bg-violet-100 text-violet-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// Chart bar heights placeholder — proper analytics endpoint belum ada per-hari.
const chartBars = [28, 38, 46, 42, 57, 49, 68, 61, 76, 69, 89, 78];

export default function SiteDashboardPage() {
  const params = useParams<{ id: string }>();
  const sid = params.id;

  const [stats, setStats] = useState<SiteStats | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [latestArticles, setLatestArticles] = useState<Article[]>([]);
  const [pendingComments, setPendingComments] = useState<ResponseItem[]>([]);
  const [activeBanner, setActiveBanner] = useState<Banner | null>(null);
  const [activeBannerCount, setActiveBannerCount] = useState<number>(0);
  const [totalBanners, setTotalBanners] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [statsRes, articlesRes, pendingRes, bannersRes] = await Promise.all([
        api<SiteStats>(`/api/v1/sites/${sid}/site-stats`).catch(() => null),
        api<PaginatedResult<Article>>(
          `/api/v1/sites/${sid}/articles?sort=newest&page_size=4`,
        ).catch(() => null),
        api<PaginatedResult<ResponseItem>>(
          `/api/v1/sites/${sid}/responses?status=pending&page_size=2`,
        ).catch(() => null),
        api<Banner[]>(`/api/v1/sites/${sid}/banners`).catch(() => null),
      ]);
      if (cancelled) return;
      setStats(statsRes);
      setPendingCount(pendingRes?.total ?? 0);
      setLatestArticles(articlesRes?.items ?? []);
      setPendingComments(pendingRes?.items ?? []);
      const list = bannersRes ?? [];
      setTotalBanners(list.length);
      const active = list.filter((b) => b.effective_status === "active");
      setActiveBannerCount(active.length);
      setActiveBanner(active[0] ?? list[0] ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sid]);

  const s = stats ?? { total_views: 0, total_responses: 0, total_articles: 0 };

  const dashStats = [
    {
      label: "Total Tulisan",
      value: fmtNumber(s.total_articles),
      trend: "Semua rubrik",
      trendPositive: true,
      icon: Newspaper,
      tint: "bg-orange-100 text-orange-600",
    },
    {
      label: "Total Views",
      value: fmtNumber(s.total_views),
      trend: "Akumulasi kunjungan",
      trendPositive: true,
      icon: Eye,
      tint: "bg-blue-100 text-blue-600",
    },
    {
      label: "Tanggapan Pending",
      value: fmtNumber(pendingCount),
      trend: pendingCount > 0 ? "Perlu ditinjau" : "Semua sudah dimoderasi",
      trendPositive: pendingCount === 0,
      icon: MessageSquare,
      tint: "bg-violet-100 text-violet-600",
    },
    {
      label: "Banner Promosi Aktif",
      value: fmtNumber(activeBannerCount),
      trend: `${activeBannerCount} dari ${totalBanners} banner`,
      trendPositive: true,
      icon: Megaphone,
      tint: "bg-emerald-100 text-emerald-600",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Selamat datang di Website Pribadi Guru
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ringkasan aktivitas dan konten Website Pribadi Guru Anda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/sites/${sid}/tampilan`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
          >
            Preview Website
            <ExternalLink className="size-4" />
          </Link>
          <Link
            href={`/sites/${sid}/tulisan/new`}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            <Plus className="size-4" />
            Tulis Baru
          </Link>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" /> Memuat data…
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashStats.map((st) => {
          const Icon = st.icon;
          return (
            <div
              key={st.label}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className={`grid h-12 w-12 place-items-center rounded-xl ${st.tint}`}>
                <Icon className="size-5" />
              </div>
              <div>
                <div className="text-[12px] text-slate-500">{st.label}</div>
                <div className="text-2xl font-bold leading-tight text-slate-900">{st.value}</div>
                <div className={`text-[11px] font-bold ${st.trendPositive ? "text-emerald-600" : "text-amber-600"}`}>
                  {st.trend}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.8fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Aksi Cepat</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <QuickAction href={`/sites/${sid}/tulisan/new`} icon={PenLine} label="Tulis Artikel Baru" />
              <QuickAction href={`/sites/${sid}/forum/new`} icon={MessageSquare} label="Buat Topik Forum" />
              <QuickAction href={`/sites/${sid}/pembelajaran/new`} icon={BookOpen} label="Tambah Materi" />
              <QuickAction href={`/sites/${sid}/promosi`} icon={Megaphone} label="Unggah Banner Promo" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Konten Terbaru</h2>
              <Link
                href={`/sites/${sid}/tulisan`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
              >
                Lihat Semua →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr>
                    {["Judul", "Rubrik", "Status", "Views", "Aksi"].map((h) => (
                      <th
                        key={h}
                        className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {latestArticles.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="grid h-9 w-11 place-items-center rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500">
                            <FileText className="size-4" />
                          </div>
                          <span className="text-[13px] font-semibold text-slate-900">{a.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-600">
                        {GURU_RUBRIC_LABEL[a.rubric]}
                      </td>
                      <td className="px-4 py-3.5">
                        <Chip tone={a.status === "published" ? "green" : "gray"}>
                          {a.status === "published" ? "Published" : "Draft"}
                        </Chip>
                      </td>
                      <td className="px-4 py-3.5 text-[13px] text-slate-700">{fmtNumber(a.view_count)}</td>
                      <td className="px-4 py-3.5">
                        <Link
                          href={`/sites/${sid}/tulisan/${a.id}/edit`}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && latestArticles.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                        Belum ada tulisan. Klik "Tulis Baru" untuk mulai.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Statistik Kunjungan</h2>
              <Chip tone="blue">30 hari terakhir</Chip>
            </div>
            <div className="p-5">
              <div className="flex h-52 items-end gap-2.5 border-b border-slate-200 pt-4">
                {chartBars.map((h, i) => (
                  <div
                    key={i}
                    className="relative flex-1 rounded-t-md bg-gradient-to-t from-blue-500 to-blue-400"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Grafik ilustratif — analitik harian per-tanggal menyusul.
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Tanggapan Menunggu</h2>
              <Link
                href={`/sites/${sid}/tanggapan`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
              >
                Lihat Semua →
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {pendingComments.map((c) => {
                const initials = c.author_name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                return (
                  <div key={c.id} className="px-5 py-4">
                    <div className="flex gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-orange-200 to-orange-400 text-[12px] font-bold text-orange-900">
                        {initials}
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-[13px] text-slate-900">{c.author_name}</strong>
                          <span className="text-[11px] text-slate-500">{timeAgo(c.created_at)}</span>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{c.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!loading && pendingComments.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-slate-500">
                  Belum ada tanggapan menunggu.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-bold text-slate-900">Ruang Promosi</h2>
              <Link
                href={`/sites/${sid}/promosi`}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-bold text-blue-700 hover:bg-blue-100"
              >
                Kelola Banner →
              </Link>
            </div>
            <div className="p-5">
              {activeBanner ? (
                <>
                  <div
                    className="relative flex aspect-[2/1] items-end overflow-hidden rounded-xl bg-gradient-to-br from-blue-800 to-blue-500 p-5 text-white"
                    style={activeBanner.image_url ? { backgroundImage: `url(${activeBanner.image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  >
                    <span className="absolute -right-8 -top-14 h-44 w-44 rounded-full bg-white/10" />
                    <strong className="relative z-10 text-lg">{activeBanner.internal_title}</strong>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[12px]">
                    <Chip tone={activeBanner.effective_status === "active" ? "green" : "gray"}>
                      {activeBanner.effective_status === "active" ? "Aktif" : "Nonaktif"}
                    </Chip>
                    <span className="text-slate-500">
                      {activeBanner.start_at ? new Date(activeBanner.start_at).toLocaleDateString("id-ID") : "—"}
                      {" – "}
                      {activeBanner.end_at ? new Date(activeBanner.end_at).toLocaleDateString("id-ID") : "—"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  Belum ada banner. Buat banner pertama di menu Ruang Promosi.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] font-bold text-slate-800 hover:bg-white hover:shadow-sm"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white">
        <Icon className="size-4 text-slate-700" />
      </span>
      {label}
      <ArrowUpRight className="ml-auto size-3.5 text-slate-400" />
    </Link>
  );
}
