"use client";

// /artikel — halaman list publik semua artikel platform.
// Support filter kategori via ?category=. No auth. Featured card di atas.
// useSearchParams butuh Suspense wrapper untuk build static (Next.js 14).

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Eye,
  Loader2,
  Newspaper,
  Sparkles,
} from "lucide-react";
import {
  api,
  PLATFORM_ARTICLE_CATEGORIES,
  type PlatformArticle,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function categoryColor(cat: string): string {
  switch (cat) {
    case "tutorial": return "bg-blue-500/10 text-blue-700";
    case "cerita": return "bg-violet-500/10 text-violet-700";
    case "tips": return "bg-emerald-500/10 text-emerald-700";
    case "panduan": return "bg-amber-500/10 text-amber-700";
    case "pengumuman": return "bg-rose-500/10 text-rose-700";
    default: return "bg-slate-500/10 text-slate-700";
  }
}

export default function ArtikelListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#fbfaf7]">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat…
          </div>
        </div>
      }
    >
      <ArtikelListInner />
    </Suspense>
  );
}

function ArtikelListInner() {
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") ?? "";
  const [category, setCategory] = useState<string>(initialCategory);
  const [items, setItems] = useState<PlatformArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = new URLSearchParams({ limit: "50" });
    if (category) p.set("category", category);
    api<PlatformArticle[]>(`/public/platform-articles?${p}`, { auth: false })
      .then((r) => {
        if (cancelled) return;
        setItems(r ?? []);
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
  }, [category]);

  const featured = items.filter((a) => a.featured);
  const regular = items.filter((a) => !a.featured);

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      {/* Header */}
      <header className="border-b border-[#e6e9ef] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />
              Beranda
            </Link>
          </Button>
          <Button asChild className="bg-[#d73f45] text-white hover:bg-[#c23238]">
            <Link href="/register">Buat Website Saya</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700">
            <Newspaper className="size-3" /> Blog Platform
          </span>
        </div>
        <h1
          className="max-w-3xl text-3xl font-extrabold tracking-tight text-[#172033] sm:text-4xl"
          style={{ fontFamily: "Georgia, serif" }}
        >
          Cerita, tutorial, dan tips untuk perjalanan digital Anda
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#637083] sm:text-base">
          Kumpulan artikel dari tim Web Builder — mulai dari panduan teknis,
          cerita inspirasi, hingga pengumuman fitur baru.
        </p>
      </section>

      {/* Category filter chips */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              category === ""
                ? "bg-[#172033] text-white"
                : "bg-white text-[#637083] hover:bg-[#f4f7fb] border border-[#e6e9ef]"
            }`}
          >
            Semua
          </button>
          {PLATFORM_ARTICLE_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                category === c.value
                  ? "bg-[#172033] text-white"
                  : "bg-white text-[#637083] hover:bg-[#f4f7fb] border border-[#e6e9ef]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-6xl px-6 py-8">
        {err ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Gagal memuat artikel: {err}
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat…
          </div>
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Newspaper className="size-5 text-muted-foreground" />
            </div>
            <p className="font-medium">Belum ada artikel di kategori ini</p>
            <Button variant="outline" onClick={() => setCategory("")}>
              Lihat Semua
            </Button>
          </Card>
        ) : (
          <>
            {/* Featured row */}
            {featured.length > 0 && (
              <div className="mb-8 grid gap-4 md:grid-cols-2">
                {featured.slice(0, 2).map((a) => (
                  <FeaturedCard key={a.id} article={a} />
                ))}
              </div>
            )}

            {/* Regular grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {regular.map((a) => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FeaturedCard({ article: a }: { article: PlatformArticle }) {
  return (
    <Link
      href={`/artikel/${a.slug}`}
      className="group block overflow-hidden rounded-2xl border border-[#e6e9ef] bg-gradient-to-br from-[#172033] to-[#233b60] p-8 text-white transition hover:shadow-2xl"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
          <Sparkles className="size-3" /> Featured
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColor(a.category)}`}>
          {a.category}
        </span>
      </div>
      <h2
        className="mb-3 text-2xl font-bold leading-tight tracking-tight text-white"
        style={{ fontFamily: "Georgia, serif" }}
      >
        {a.title}
      </h2>
      <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-white/75">
        {a.excerpt}
      </p>
      <div className="flex flex-wrap items-center gap-4 text-[11px] text-white/60">
        {a.published_at && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3" /> {fmtDate(a.published_at)}
          </span>
        )}
        {a.reading_time_min > 0 && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {a.reading_time_min} menit baca
          </span>
        )}
      </div>
      <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-white transition group-hover:translate-x-1">
        Baca artikel <ArrowRight className="size-4" />
      </div>
    </Link>
  );
}

function ArticleCard({ article: a }: { article: PlatformArticle }) {
  return (
    <Link
      href={`/artikel/${a.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[#e6e9ef] bg-white transition hover:-translate-y-1 hover:shadow-lg"
    >
      {a.cover_image_url ? (
        <div className="aspect-[16/9] overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.cover_image_url}
            alt={a.title}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] bg-gradient-to-br from-[#eaf2fb] via-white to-[#fce9ea]" />
      )}
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColor(a.category)}`}>
            {a.category}
          </span>
        </div>
        <h3
          className="mb-2 text-lg font-bold leading-tight text-[#172033]"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {a.title}
        </h3>
        <p className="mb-4 line-clamp-2 text-sm text-[#637083]">
          {a.excerpt}
        </p>
        <div className="mt-auto flex items-center justify-between border-t border-[#f0f2f6] pt-3 text-[11px] text-muted-foreground">
          <span>{a.published_at ? fmtDate(a.published_at) : ""}</span>
          <span className="inline-flex items-center gap-2">
            {a.reading_time_min > 0 && (
              <>
                <Clock className="size-3" /> {a.reading_time_min} mnt
              </>
            )}
            {a.view_count > 0 && (
              <>
                <Eye className="size-3" /> {a.view_count.toLocaleString("id-ID")}
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Link>
  );
}

