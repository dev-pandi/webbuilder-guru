"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  FileText,
  Copy,
  Trash2,
  Loader2,
  AlertCircle,
  Plus,
  Globe,
  PencilLine,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Page = {
  id: string;
  slug: string;
  title: string;
  is_home: boolean;
  updated_at: string;
};

function SkeletonRow() {
  return (
    <TableRow className="animate-pulse">
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-muted" />
          <div className="h-4 w-36 rounded bg-muted" />
        </div>
      </TableCell>
      <TableCell>
        <div className="h-5 w-24 rounded bg-muted" />
      </TableCell>
      <TableCell>
        <div className="h-5 w-16 rounded-full bg-muted" />
      </TableCell>
      <TableCell className="text-right">
        <div className="ml-auto h-7 w-24 rounded-md bg-muted" />
      </TableCell>
    </TableRow>
  );
}

export default function PagesPage() {
  const params = useParams<{ id: string }>();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function refresh(initial = false) {
    if (initial) setLoading(true);
    try {
      setPages(await api<Page[]>(`/api/v1/sites/${params.id}/pages`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      if (initial) setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
  }, [params.id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    setSubmitting(true);
    try {
      await api(`/api/v1/sites/${params.id}/pages`, {
        method: "POST",
        body: JSON.stringify({
          slug,
          title,
          tree: { blocks: [] },
          seo: {},
          is_home: false,
        }),
      });
      toast.success(`Halaman "${title}" berhasil ditambahkan`);
      setSlug("");
      setTitle("");
      await refresh();
    } catch (e) {
      setFormErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function setHome(id: string) {
    setActionLoading(`home-${id}`);
    try {
      await api(`/api/v1/pages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_home: true }),
      });
      toast.success("Halaman dijadikan home");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function remove(id: string, pageTitle: string) {
    if (!confirm(`Hapus halaman "${pageTitle}"?`)) return;
    setActionLoading(`del-${id}`);
    try {
      await api(`/api/v1/pages/${id}`, { method: "DELETE" });
      toast.success("Halaman dihapus");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function duplicate(id: string) {
    setActionLoading(`dup-${id}`);
    try {
      await api(`/api/v1/pages/${id}/duplicate`, { method: "POST" });
      toast.success("Halaman diduplikat");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10">
            <FileText className="h-4 w-4 text-violet-500" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Halaman
          </span>
        </div>
        <h1 className="text-xl font-bold">Manajemen Halaman</h1>
        <p className="text-sm text-muted-foreground">
          Buat dan kelola semua halaman untuk situs ini.
        </p>
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {err}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Pages Table */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Daftar Halaman</span>
            {!loading && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                {pages.length}
              </span>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="font-semibold text-foreground">
                  <div className="flex items-center gap-1.5">
                    <PencilLine className="h-3.5 w-3.5" />
                    Halaman
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-foreground">
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    Slug URL
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-foreground">Status</TableHead>
                <TableHead className="text-right font-semibold text-foreground">
                  Aksi
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : pages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-9 w-9 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">
                        Belum ada halaman
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        Tambah halaman pertama dari form di samping.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pages.map((p) => (
                  <TableRow key={p.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <span className="font-medium">{p.title || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                        /{p.slug}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.is_home ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
                          <Home className="h-3 w-3" />
                          Home
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                          Halaman
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {actionLoading === `home-${p.id}` ||
                      actionLoading === `dup-${p.id}` ||
                      actionLoading === `del-${p.id}` ? (
                        <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {!p.is_home && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() => setHome(p.id)}
                            >
                              <Home className="h-3.5 w-3.5" />
                              Jadikan Home
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => duplicate(p.id)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Duplikat
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => remove(p.id, p.title)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Add Page Form */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/10">
              <Plus className="h-3.5 w-3.5 text-violet-500" />
            </div>
            <span className="text-sm font-semibold">Tambah Halaman</span>
          </div>
          <div className="p-4">
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="title"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Judul
                </Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Tentang Kami"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="slug"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Slug URL
                </Label>
                <div className="flex overflow-hidden rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
                  <span className="select-none border-r bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                    /
                  </span>
                  <input
                    id="slug"
                    required
                    value={slug}
                    onChange={(e) =>
                      setSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-/]/g, ""),
                      )
                    }
                    placeholder="tentang-kami"
                    className="flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground/50"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Hanya huruf kecil, angka, dan tanda{" "}
                  <code className="rounded bg-muted px-1">-</code>.
                </p>
              </div>

              {formErr && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {formErr}
                </div>
              )}

              <Button
                type="submit"
                className="w-full gap-2"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {submitting ? "Menyimpan…" : "Tambah Halaman"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
