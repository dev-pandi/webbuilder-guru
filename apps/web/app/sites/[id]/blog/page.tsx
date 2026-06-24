"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Newspaper,
  Plus,
  Search,
  SortAsc,
  Send,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  Clock,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
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

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string;
  author_name: string;
  status: "draft" | "published";
  published_at: string | null;
  tags: string[] | null;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru Dibuat" },
  { value: "oldest", label: "Terlama" },
  { value: "published_desc", label: "Terbaru Publish" },
  { value: "title_asc", label: "Judul A → Z" },
];

const STATUS_OPTIONS = [
  { value: "_all", label: "Semua Status" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

const STATUS_CFG: Record<
  string,
  { label: string; icon: React.ElementType; class: string }
> = {
  published: {
    label: "Published",
    icon: CheckCircle2,
    class:
      "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400",
  },
  draft: {
    label: "Draft",
    icon: Clock,
    class: "bg-muted text-muted-foreground border-border",
  },
};

function SkeletonRow() {
  return (
    <TableRow className="animate-pulse">
      <TableCell className="pl-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-16 rounded-md bg-muted" />
          <div className="space-y-1.5">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="h-3 w-24 rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-20 rounded-full bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-3 w-20 rounded bg-muted" />
      </TableCell>
      <TableCell className="pr-5">
        <div className="ml-auto h-8 w-32 rounded bg-muted" />
      </TableCell>
    </TableRow>
  );
}

export default function BlogPage() {
  const params = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState<string>("_all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<BlogPost> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort, status]);

  async function refresh() {
    setLoading(true);
    try {
      const p = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort,
      });
      if (debouncedQ) p.set("q", debouncedQ);
      if (status !== "_all") p.set("status", status);
      const r = await api<PaginatedResult<BlogPost>>(
        `/api/v1/sites/${params.id}/blog-posts?${p}`,
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
  }, [params.id, page, debouncedQ, sort, status]);

  async function publish(post: BlogPost) {
    setActionLoading(`publish-${post.id}`);
    try {
      await api(`/api/v1/blog-posts/${post.id}/publish`, { method: "POST" });
      toast.success(`"${post.title}" dipublikasikan`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function remove(post: BlogPost) {
    if (
      !confirm(`Hapus artikel "${post.title}"?\n\nTindakan ini tidak dapat dibatalkan.`)
    )
      return;
    setActionLoading(`delete-${post.id}`);
    try {
      await api(`/api/v1/blog-posts/${post.id}`, { method: "DELETE" });
      toast.success(`Artikel dihapus`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const posts = data?.items ?? [];
  const publishedCount = posts.filter((p) => p.status === "published").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <Newspaper className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Manajemen Blog
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Blog</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data
              ? `${data.total} artikel${publishedCount > 0 ? ` · ${publishedCount} live di halaman ini` : ""}`
              : "Memuat data…"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-sm">
              <FileText className="size-3.5 text-muted-foreground" />
              <span className="font-semibold">{data.total}</span>
              <span className="text-muted-foreground">artikel</span>
            </div>
          )}
          <Button asChild className="gap-2 shadow-sm">
            <Link href={`/sites/${params.id}/blog/new`}>
              <Plus className="size-4" />
              Artikel Baru
            </Link>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul atau slug…"
            className="h-9 border-transparent bg-muted/40 pl-9 transition-colors focus:border-input focus:bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-40 border-transparent bg-muted/40 focus:border-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SortAsc className="size-4 text-muted-foreground" />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-44 border-transparent bg-muted/40 focus:border-input">
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
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            <span className="font-medium">Gagal memuat:</span> {err}
          </span>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden rounded-xl p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="pl-5 font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5" />
                  Artikel
                </div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <User className="size-3.5" />
                  Penulis
                </div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">Status</TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  Terbit
                </div>
              </TableHead>
              <TableHead className="pr-5 text-right font-semibold text-foreground">
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && posts.length === 0 ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : posts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                      <Newspaper className="size-6 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {debouncedQ
                        ? `Tidak ada hasil untuk "${debouncedQ}"`
                        : "Belum ada artikel"}
                    </p>
                    {!debouncedQ && (
                      <Button asChild className="mt-3 gap-2 shadow-sm">
                        <Link href={`/sites/${params.id}/blog/new`}>
                          <Plus className="size-4" />
                          Tulis artikel pertama
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              posts.map((p) => {
                const cfg = STATUS_CFG[p.status] ?? STATUS_CFG.draft;
                const Icon = cfg.icon;
                const tags = Array.isArray(p.tags) ? p.tags : [];
                return (
                  <TableRow key={p.id} className="group transition-colors">
                    <TableCell className="pl-5">
                      <div className="flex items-start gap-3">
                        {p.cover_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.cover_image_url}
                            alt=""
                            className="h-12 w-16 shrink-0 rounded-md border object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border bg-muted">
                            <FileText className="size-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/sites/${params.id}/blog/${p.id}/edit`}
                            className="block truncate font-medium hover:text-primary"
                          >
                            {p.title}
                          </Link>
                          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                            /blog/{p.slug}
                          </div>
                          {tags.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {tags.slice(0, 3).map((t) => (
                                <Badge
                                  key={t}
                                  variant="secondary"
                                  className="gap-1 px-1.5 py-0 text-[10px] font-normal"
                                >
                                  <Tag className="size-2.5" />
                                  {t}
                                </Badge>
                              ))}
                              {tags.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.author_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${cfg.class}`}>
                        <Icon className="size-3" />
                        {cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.published_at
                        ? new Date(p.published_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                        {p.status !== "published" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => publish(p)}
                            disabled={actionLoading === `publish-${p.id}`}
                            className="h-8 gap-1.5 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700"
                            title="Publikasikan"
                          >
                            {actionLoading === `publish-${p.id}` ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Send className="size-3.5" />
                            )}
                            <span className="hidden sm:inline">Publish</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-8 gap-1.5"
                          title="Edit"
                        >
                          <Link href={`/sites/${params.id}/blog/${p.id}/edit`}>
                            <Pencil className="size-3.5" />
                            <span className="hidden sm:inline">Edit</span>
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(p)}
                          disabled={actionLoading === `delete-${p.id}`}
                          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Hapus"
                        >
                          {actionLoading === `delete-${p.id}` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {data && data.total_pages > 1 && (
          <div className="border-t">
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              pageSize={data.page_size}
              onPage={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
