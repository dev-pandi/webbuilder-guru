"use client";

// /admin/platform-articles — list + filter. Create/edit di page terpisah
// (/new + /[id]/edit) supaya editor TipTap punya ruang penuh.

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Newspaper,
  Pencil,
  Plus,
  Search,
  Send,
  SortAsc,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import {
  api,
  PLATFORM_ARTICLE_CATEGORIES,
  type PlatformArticle,
} from "@/lib/api";
import {
  Pagination,
  useDebounced,
  type PaginatedResult,
} from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SORT_OPTIONS = [
  { value: "published_desc", label: "Featured → Terbaru" },
  { value: "newest", label: "Terbaru Dibuat" },
  { value: "views_desc", label: "Terbanyak Dilihat" },
  { value: "title_asc", label: "Judul A → Z" },
];

export default function AdminPlatformArticlesPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("published_desc");
  const [category, setCategory] = useState<string>("_all");
  const [status, setStatus] = useState<string>("_all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<PlatformArticle> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => setPage(1), [debouncedQ, sort, category, status]);

  async function refresh() {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), page_size: "20", sort });
      if (debouncedQ) p.set("q", debouncedQ);
      if (category !== "_all") p.set("category", category);
      if (status !== "_all") p.set("status", status);
      const r = await api<PaginatedResult<PlatformArticle>>(
        `/api/v1/admin/platform-articles?${p}`,
      );
      setData(r);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sort, category, status, debouncedQ]);

  async function publish(a: PlatformArticle) {
    setActionLoading(`publish-${a.id}`);
    try {
      await api(`/api/v1/admin/platform-articles/${a.id}/publish`, { method: "POST" });
      toast.success(`"${a.title}" dipublikasikan`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleFeatured(a: PlatformArticle) {
    setActionLoading(`featured-${a.id}`);
    try {
      await api(`/api/v1/admin/platform-articles/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ featured: !a.featured }),
      });
      toast.success(a.featured ? "Unfeatured" : "Featured");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function remove(a: PlatformArticle) {
    if (!confirm(`Hapus artikel "${a.title}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;
    setActionLoading(`delete-${a.id}`);
    try {
      await api(`/api/v1/admin/platform-articles/${a.id}`, { method: "DELETE" });
      toast.success("Artikel dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <Newspaper className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Blog Platform
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Artikel Platform</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.total} artikel` : "Memuat data…"} · tampil di homepage + /artikel
          </p>
        </div>
        <Button asChild className="gap-2 shadow-sm">
          <Link href="/admin/platform-articles/new">
            <Plus className="size-4" /> Artikel Baru
          </Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul atau slug…"
            className="h-9 border-transparent bg-muted/40 pl-9 focus:border-input focus:bg-background"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-40 border-transparent bg-muted/40 focus:border-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Semua Kategori</SelectItem>
            {PLATFORM_ARTICLE_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-36 border-transparent bg-muted/40 focus:border-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Semua Status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <SortAsc className="size-4 text-muted-foreground" />
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-52 border-transparent bg-muted/40 focus:border-input">
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

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <Card className="overflow-hidden rounded-xl p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="pl-5 font-semibold text-foreground">Artikel</TableHead>
              <TableHead className="font-semibold text-foreground">Kategori</TableHead>
              <TableHead className="font-semibold text-foreground">Status</TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <Eye className="size-3.5" /> Views
                </div>
              </TableHead>
              <TableHead className="pr-5 text-right font-semibold text-foreground">
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {loading && !data ? (
              <TableRow className="animate-pulse">
                <TableCell colSpan={5}>
                  <div className="h-8 rounded bg-muted/50" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <Newspaper className="size-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">Belum ada artikel</p>
                      <p className="text-sm text-muted-foreground">
                        Buat artikel pertama untuk homepage platform.
                      </p>
                    </div>
                    <Button asChild size="sm" className="mt-2 gap-2">
                      <Link href="/admin/platform-articles/new">
                        <Plus className="size-4" /> Artikel Baru
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-2">
                      {a.featured && (
                        <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/admin/platform-articles/${a.id}/edit`}
                          className="line-clamp-1 font-medium hover:underline"
                        >
                          {a.title}
                        </Link>
                        <p className="mt-0.5 line-clamp-1 font-mono text-[11px] text-muted-foreground">
                          /artikel/{a.slug}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {a.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.status === "published" ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="size-3" /> Published
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="size-3" /> Draft
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground">
                    {a.view_count.toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleFeatured(a)}
                        disabled={actionLoading !== null}
                        className="h-8 gap-1"
                        title={a.featured ? "Unfeatured" : "Featured (pin di homepage)"}
                      >
                        {actionLoading === `featured-${a.id}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className={`size-3.5 ${a.featured ? "text-amber-500" : ""}`} />
                        )}
                      </Button>
                      {a.status !== "published" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => publish(a)}
                          disabled={actionLoading !== null}
                          className="h-8 gap-1"
                        >
                          {actionLoading === `publish-${a.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Send className="size-3.5" />
                          )}
                          Publish
                        </Button>
                      )}
                      <Button asChild size="sm" variant="ghost" className="h-8 gap-1">
                        <Link href={`/admin/platform-articles/${a.id}/edit`}>
                          <Pencil className="size-3.5" /> Edit
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove(a)}
                        disabled={actionLoading !== null}
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                      >
                        {actionLoading === `delete-${a.id}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {data && data.total_pages > 1 && (
        <Pagination
          page={page}
          totalPages={data.total_pages}
          total={data.total}
          pageSize={data.page_size}
          onPage={setPage}
        />
      )}
    </div>
  );
}
