"use client";

// /artikel/[slug] — halaman detail artikel platform.
// No auth. Server-side approach dihindari karena kita perlu fetch client-side
// (no ISR — dashboard admin edit → refresh langsung visible).

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  Eye,
  Loader2,
  Newspaper,
  User as UserIcon,
} from "lucide-react";
import { api, type PlatformArticle } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Sanitize markdown — strip raw HTML supaya user-generated content aman.
marked.setOptions({ gfm: true, breaks: false });
marked.use({ renderer: { html: () => "" } });

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

export default function ArtikelDetailPage() {
  const params = useParams<{ slug: string }>();
  const [article, setArticle] = useState<PlatformArticle | null>(null);
  const [related, setRelated] = useState<PlatformArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<PlatformArticle>(`/public/platform-articles/${params.slug}`, { auth: false })
      .then((a) => {
        if (cancelled) return;
        setArticle(a);
        // Fetch related (same category, max 3)
        api<PlatformArticle[]>(
          `/public/platform-articles?category=${a.category}&limit=6`,
          { auth: false },
        )
          .then((list) => {
            if (cancelled) return;
            setRelated((list ?? []).filter((r) => r.id !== a.id).slice(0, 3));
          })
          .catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  const html = useMemo(() => {
    if (!article) return "";
    return marked.parse(article.body_md ?? "", { async: false }) as string;
  }, [article]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbfaf7]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat artikel…
        </div>
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbfaf7]">
        <div className="text-center">
          <Newspaper className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Artikel tidak ditemukan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            URL yang Anda buka mungkin sudah tidak berlaku.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/artikel">Lihat semua artikel</Link>
          </Button>
        </div>
      </div>
    );
  }

  const tags = article.tags ?? [];

  return (
    <div className="min-h-screen bg-[#fbfaf7]">
      {/* Header */}
      <header className="border-b border-[#e6e9ef] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/artikel">
              <ArrowLeft />
              Semua Artikel
            </Link>
          </Button>
          <Button asChild className="bg-[#d73f45] text-white hover:bg-[#c23238]">
            <Link href="/register">Buat Website Saya</Link>
          </Button>
        </div>
      </header>

      {/* Article body */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/artikel?category=${article.category}`}
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${categoryColor(article.category)}`}
          >
            {article.category}
          </Link>
        </div>

        <h1
          className="mb-4 text-3xl font-extrabold leading-tight tracking-tight text-[#172033] sm:text-4xl"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {article.title}
        </h1>

        {article.excerpt && (
          <p className="mb-6 text-lg leading-relaxed text-[#637083]">
            {article.excerpt}
          </p>
        )}

        <div className="mb-8 flex flex-wrap items-center gap-4 border-y border-[#e6e9ef] py-3 text-[13px] text-[#637083]">
          <span className="inline-flex items-center gap-1.5">
            <UserIcon className="size-3.5" /> {article.author_name}
          </span>
          {article.published_at && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" /> {fmtDate(article.published_at)}
            </span>
          )}
          {article.reading_time_min > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" /> {article.reading_time_min} menit baca
            </span>
          )}
          {article.view_count > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-3.5" /> {article.view_count.toLocaleString("id-ID")} views
            </span>
          )}
        </div>

        {article.cover_image_url && (
          <div className="mb-8 overflow-hidden rounded-2xl border border-[#e6e9ef]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.cover_image_url}
              alt={article.title}
              className="w-full"
            />
          </div>
        )}

        {/* Article body — pakai `.article-prose` (globals.css) yang mirror
            struktur `.wb-prose` editor supaya visual identik dengan preview
            di TipTap admin. Palette Georgia serif + navy #172033 + red #d73f45. */}
        <div
          className="article-prose"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-[#f4f1eb] px-3 py-1 text-[11px] font-semibold text-[#596273]"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </article>

      {/* Related articles */}
      {related.length > 0 && (
        <section className="border-t border-[#e6e9ef] bg-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <h2
              className="mb-6 text-xl font-bold text-[#172033]"
              style={{ fontFamily: "Georgia, serif" }}
            >
              Artikel lainnya
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/artikel/${r.slug}`}
                  className="group block rounded-xl border border-[#e6e9ef] p-5 transition hover:-translate-y-0.5 hover:border-[#d4dce8] hover:shadow-md"
                >
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${categoryColor(r.category)}`}
                  >
                    {r.category}
                  </span>
                  <h3
                    className="mt-2 line-clamp-2 text-base font-bold text-[#172033]"
                    style={{ fontFamily: "Georgia, serif" }}
                  >
                    {r.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs text-[#637083]">
                    {r.excerpt}
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#d73f45] transition group-hover:translate-x-0.5">
                    Baca <ArrowRight className="size-3" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
