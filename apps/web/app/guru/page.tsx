"use client";

// /guru — Portal Direktori Guru (spec §5).
// Public page (no auth). Consumes GET /public/guru?sort=&q=&page=&page_size=.
// Sort: "popular" (total views) atau "newest" (tanggal aktif).

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  GraduationCap,
  Loader2,
  Search,
  SortAsc,
  Sparkles,
} from "lucide-react";
import { api, type TeacherDirectoryItem } from "@/lib/api";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Sort = "popular" | "newest";

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Terbaru" },
  { value: "popular", label: "Terpopuler" },
];

function TeacherCard({ item }: { item: TeacherDirectoryItem }) {
  const initials = item.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  const domainDisplay = item.domain || `${item.site_id.slice(0, 8)}…`;
  const externalHref = item.domain
    ? item.domain.startsWith("http")
      ? item.domain
      : `https://${item.domain}`
    : "#";

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="relative aspect-[2/1] bg-gradient-to-br from-violet-100 via-white to-amber-100">
        {item.profile_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.profile_image}
            alt={item.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-2xl font-bold text-violet-500/60">
            {initials || <GraduationCap className="size-10" />}
          </div>
        )}
        {item.is_new && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
            <Sparkles className="size-2.5" /> Baru
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-1 text-base font-bold text-foreground">
            {item.name}
          </h3>
          {item.subject_or_field && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {item.subject_or_field}
            </p>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span className="line-clamp-1 font-mono">{domainDisplay}</span>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Eye className="size-3" />
            {item.total_views.toLocaleString("id-ID")}
          </span>
        </div>
        <Button asChild size="sm" className="w-full gap-1.5">
          <a href={externalHref} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            Kunjungi Website
          </a>
        </Button>
      </div>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="aspect-[2/1] animate-pulse bg-muted" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </Card>
  );
}

export default function GuruDirectoryPage() {
  const [page, setPage] = useState(1);
  // Default sort = "popular" (Terpopuler) — user request: kartu paling banyak
  // di-view muncul duluan di direktori supaya guru yang aktif nulis lebih visible.
  const [sort, setSort] = useState<Sort>("popular");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<TeacherDirectoryItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setPage(1), [sort, debouncedQ]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = new URLSearchParams({
      page: String(page),
      page_size: "12",
      sort,
    });
    if (debouncedQ) p.set("q", debouncedQ);
    // Public endpoint — jangan kirim bearer token.
    api<PaginatedResult<TeacherDirectoryItem>>(`/public/guru?${p}`, {
      auth: false,
    })
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, sort, debouncedQ]);

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      {/* Header */}
      <header className="border-b border-[#e6e9ef] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />
              Beranda Portal
            </Link>
          </Button>
          <Button asChild className="bg-[#d73f45] text-white hover:bg-[#c23238]">
            <Link href="/register">Buat Website Saya</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700">
            <GraduationCap className="size-3" /> Direktori Guru
          </span>
        </div>
        <h1
          className="max-w-3xl text-3xl font-extrabold tracking-tight text-[#172033] sm:text-4xl"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Guru yang sudah bergabung
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#637083] sm:text-base">
          Temukan guru, kunjungi website pribadinya, dan baca tulisan mereka.
          Website guru dikelola langsung oleh guru masing-masing di platform
          Rumah Digital Guru.
        </p>
      </section>

      {/* Toolbar */}
      <section className="mx-auto max-w-7xl px-6">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e6e9ef] bg-white px-4 py-3 shadow-sm">
          <div className="relative w-80 max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama guru, mata pelajaran, atau domain…"
              className="h-9 border-transparent bg-muted/40 pl-9 focus:border-input focus:bg-background"
            />
          </div>
          <div className="flex items-center gap-2">
            <SortAsc className="size-4 text-muted-foreground" />
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-9 w-40 border-transparent bg-muted/40 focus:border-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {data && (
            <span className="ml-auto text-sm text-muted-foreground">
              {data.total} guru
            </span>
          )}
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-7xl px-6 py-8">
        {err ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Gagal memuat direktori: {err}
          </div>
        ) : loading && !data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <GraduationCap className="size-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">
                {debouncedQ
                  ? `Tidak ada guru untuk pencarian "${debouncedQ}"`
                  : "Belum ada guru yang bergabung"}
              </p>
              <p className="text-sm text-muted-foreground">
                Coba kata kunci lain, atau jadilah yang pertama membuat website
                di sini.
              </p>
            </div>
            <Button asChild className="mt-2 bg-[#d73f45] text-white hover:bg-[#c23238]">
              <Link href="/register">Buat Website Saya</Link>
            </Button>
          </Card>
        ) : (
          <>
            <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
              {items.map((it) => (
                <TeacherCard key={it.site_id} item={it} />
              ))}
              {loading && (
                <div className="col-span-full mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Memuat…
                </div>
              )}
            </div>

            {data && data.total_pages > 1 && (
              <div className="mt-8">
                <Pagination
                  page={page}
                  totalPages={data.total_pages}
                  total={data.total}
                  pageSize={data.page_size}
                  onPage={setPage}
                />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
