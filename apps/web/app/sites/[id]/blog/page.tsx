"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Pagination, SearchBar, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { BlogDialog, type BlogPost } from "./BlogDialog";

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru dibuat" },
  { value: "oldest", label: "Terlama" },
  { value: "published_desc", label: "Terbaru terbit" },
  { value: "title_asc", label: "Judul A→Z" },
];

const STATUS_OPTIONS = [
  { value: "_all", label: "Semua status" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
];

export default function BlogPage() {
  const params = useParams<{ id: string }>();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState<string>("_all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<BlogPost> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort, status]);

  async function refresh() {
    setLoading(true);
    try {
      const params2 = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort,
      });
      if (debouncedQ) params2.set("q", debouncedQ);
      if (status !== "_all") params2.set("status", status);
      const r = await api<PaginatedResult<BlogPost>>(
        `/api/v1/sites/${params.id}/blog-posts?${params2}`,
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

  async function publish(p: BlogPost) {
    try {
      await api(`/api/v1/blog-posts/${p.id}/publish`, { method: "POST" });
      toast.success("Artikel dipublikasikan");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(p: BlogPost) {
    if (!confirm(`Hapus artikel "${p.title}"?`)) return;
    try {
      await api(`/api/v1/blog-posts/${p.id}`, { method: "DELETE" });
      toast.success("Artikel dihapus");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const posts = data?.items ?? [];

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Blog</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} artikel` : "Memuat…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Cari judul/slug..." />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
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
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-44">
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
          <Button onClick={() => setCreating(true)}>
            <Plus />
            Artikel Baru
          </Button>
        </div>
      </header>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

      <Card className="mt-6 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artikel</TableHead>
              <TableHead>Penulis</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Terbit</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {posts.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium">{p.title}</div>
                  <div className="font-mono text-xs text-muted-foreground">/{p.slug}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.author_name || "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "published" ? "success" : "secondary"}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.published_at ? new Date(p.published_at).toLocaleDateString("id-ID") : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {p.status !== "published" && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-emerald-600"
                      onClick={() => publish(p)}
                    >
                      <Send className="size-3" />
                      Publikasikan
                    </Button>
                  )}
                  <Button variant="link" size="sm" onClick={() => setEditing(p)}>
                    Edit
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(p)}
                  >
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {posts.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}".` : "Belum ada artikel."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {data && (
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

      <BlogDialog
        open={creating}
        onOpenChange={setCreating}
        siteId={params.id}
        post={null}
        onSaved={() => {
          setCreating(false);
          refresh();
        }}
      />
      <BlogDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        siteId={params.id}
        post={editing}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </div>
  );
}
