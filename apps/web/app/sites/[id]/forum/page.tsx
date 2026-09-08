"use client";

// /sites/[id]/forum — Menu Forum Diskusi terpisah (spec §16, §20).
// Rubric hardcoded ke `forum-diskusi`. UI berbeda dari /tulisan:
//   - Tidak ada tabs rubric selector
//   - Copy fokus pada "topik" (bukan "tulisan")
//   - Info banner: tanggapan selalu aktif, tidak bisa dinonaktifkan
//
// Create + edit reuse TulisanForm — form auto-lock rubric untuk forum-diskusi.

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  SortAsc,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Article } from "@/lib/api";
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
import { GuruFeatureNotice } from "@/components/GuruFeatureNotice";

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru Dibuat" },
  { value: "oldest", label: "Terlama" },
  { value: "published_desc", label: "Terbaru Publish" },
  { value: "views_desc", label: "Terbanyak Dilihat" },
  { value: "title_asc", label: "Judul A → Z" },
];

const STATUS_OPTIONS = [
  { value: "_all", label: "Semua Status" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

function SkeletonRow() {
  return (
    <TableRow className="animate-pulse">
      <TableCell className="pl-5">
        <div className="space-y-1.5">
          <div className="h-4 w-56 rounded bg-muted" />
          <div className="h-3 w-32 rounded bg-muted" />
        </div>
      </TableCell>
      <TableCell><div className="h-5 w-20 rounded-full bg-muted" /></TableCell>
      <TableCell><div className="h-3 w-16 rounded bg-muted" /></TableCell>
      <TableCell><div className="h-3 w-24 rounded bg-muted" /></TableCell>
      <TableCell className="pr-5"><div className="ml-auto h-8 w-32 rounded bg-muted" /></TableCell>
    </TableRow>
  );
}

export default function ForumPage() {
  const params = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState<string>("_all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<Article> | null>(null);
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
        rubric: "forum-diskusi", // fixed
      });
      if (debouncedQ) p.set("q", debouncedQ);
      if (status !== "_all") p.set("status", status);
      const r = await api<PaginatedResult<Article>>(
        `/api/v1/sites/${params.id}/articles?${p}`,
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
  }, [params.id, page, debouncedQ, sort, status]);

  async function publish(a: Article) {
    setActionLoading(`publish-${a.id}`);
    try {
      await api(`/api/v1/articles/${a.id}/publish`, { method: "POST" });
      toast.success(`"${a.title}" dipublikasikan`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function remove(a: Article) {
    if (!confirm(`Hapus topik "${a.title}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;
    setActionLoading(`delete-${a.id}`);
    try {
      await api(`/api/v1/articles/${a.id}`, { method: "DELETE" });
      toast.success("Topik dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <GuruFeatureNotice
        title="Forum Diskusi"
        description="Ruang percakapan guru, siswa, orang tua, dan pembaca. Setiap topik selalu memiliki tanggapan aktif dan tidak dapat dinonaktifkan (spec §16). Semua tanggapan tetap masuk moderasi sebelum tampil."
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
              <MessageSquare className="size-4 text-violet-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Ruang Diskusi
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Forum Diskusi</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data ? `${data.total} topik` : "Memuat data…"}
          </p>
        </div>
        <Button asChild className="gap-2 shadow-sm">
          <Link href={`/sites/${params.id}/tulisan/new?rubric=forum-diskusi`}>
            <Plus className="size-4" />
            Topik Baru
          </Link>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul topik atau slug…"
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

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span><span className="font-medium">Gagal memuat:</span> {err}</span>
        </div>
      )}

      <Card className="overflow-hidden rounded-xl p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="pl-5 font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="size-3.5" /> Topik
                </div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">Status</TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <Eye className="size-3.5" /> Views
                </div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" /> Terbit
                </div>
              </TableHead>
              <TableHead className="pr-5 text-right font-semibold text-foreground">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {loading && !data ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                      <MessageSquare className="size-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">
                        {debouncedQ || status !== "_all"
                          ? "Tidak ada topik sesuai filter"
                          : "Belum ada topik diskusi"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {debouncedQ
                          ? `Tidak ada hasil untuk "${debouncedQ}".`
                          : "Mulai percakapan pertama untuk mengundang tanggapan pembaca."}
                      </p>
                    </div>
                    {!debouncedQ && status === "_all" && (
                      <Button asChild size="sm" className="mt-2 gap-1.5">
                        <Link href={`/sites/${params.id}/tulisan/new?rubric=forum-diskusi`}>
                          <Plus className="size-3.5" />
                          Topik Baru
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
                <TableRow key={a.id} className="group">
                  <TableCell className="pl-5">
                    <div className="min-w-0">
                      <Link
                        href={`/sites/${params.id}/tulisan/${a.id}/edit`}
                        className="line-clamp-1 font-medium hover:underline"
                      >
                        {a.title}
                      </Link>
                      <p className="mt-0.5 line-clamp-1 font-mono text-[11px] text-muted-foreground">
                        /forum-diskusi/{a.slug}
                      </p>
                    </div>
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
                  <TableCell className="text-sm text-muted-foreground">
                    {a.published_at
                      ? new Date(a.published_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="pr-5">
                    <div className="flex items-center justify-end gap-1">
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
                        <Link href={`/sites/${params.id}/tulisan/${a.id}/edit`}>
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
