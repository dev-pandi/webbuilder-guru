"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  Globe2,
  Search,
  SortAsc,
  FileText,
  HardDrive,
  Trash2,
  SlidersHorizontal,
  SquarePen,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Clock,
  ExternalLink,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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

type AdminSite = {
  id: string;
  slug: string;
  name: string;
  status: string;
  owner_id: string;
  owner_email: string;
  pages_count: number;
  assets_count: number;
  storage_bytes: number;
  quota_max_pages: number;
  quota_max_storage_bytes: number;
  created_at: string;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru Dibuat" },
  { value: "oldest", label: "Terlama Dibuat" },
  { value: "name_asc", label: "Nama A → Z" },
  { value: "storage_desc", label: "Storage Terbesar" },
  { value: "pages_desc", label: "Halaman Terbanyak" },
];

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell className="pl-5">
        <div className="space-y-1.5">
          <div className="h-3.5 w-36 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
        </div>
      </TableCell>
      <TableCell><div className="h-5 w-20 rounded-full bg-muted animate-pulse" /></TableCell>
      <TableCell><div className="h-8 w-28 rounded bg-muted animate-pulse" /></TableCell>
      <TableCell><div className="h-8 w-28 rounded bg-muted animate-pulse" /></TableCell>
      <TableCell className="pr-5"><div className="h-8 w-28 rounded bg-muted animate-pulse ml-auto" /></TableCell>
    </TableRow>
  );
}

export default function AdminSitesPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<AdminSite> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminSite | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "20", sort });
      if (debouncedQ) params.set("q", debouncedQ);
      const r = await api<PaginatedResult<AdminSite>>(`/api/v1/admin/sites?${params}`);
      setData(r);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, [page, debouncedQ, sort]);

  async function remove(id: string, name: string) {
    if (!confirm(`Hapus situs "${name}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;
    setActionLoading(id);
    try {
      await api(`/api/v1/admin/sites/${id}`, { method: "DELETE" });
      toast.success(`Situs "${name}" berhasil dihapus.`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  const sites = data?.items ?? [];
  const publishedCount = sites.filter((s) => s.status === "published").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
              <Globe2 className="size-4 text-blue-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Manajemen Situs
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Situs</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data
              ? `${data.total} situs di platform${publishedCount > 0 ? ` · ${publishedCount} live di halaman ini` : ""}`
              : "Memuat data…"}
          </p>
        </div>

        {data && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-sm">
              <Globe2 className="size-3.5 text-muted-foreground" />
              <span className="font-semibold">{data.total}</span>
              <span className="text-muted-foreground">total</span>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama, slug, atau email pemilik…"
            className="pl-9 h-9 bg-muted/40 border-transparent focus:border-input focus:bg-background transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <SortAsc className="size-4 text-muted-foreground" />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-9 w-52 bg-muted/40 border-transparent focus:border-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error */}
      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span><span className="font-medium">Gagal memuat:</span> {err}</span>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden rounded-xl p-0 shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="pl-5 font-semibold text-foreground">Situs</TableHead>
              <TableHead className="font-semibold text-foreground">Pemilik</TableHead>
              <TableHead className="font-semibold text-foreground">Status</TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5" /> Halaman
                </div>
              </TableHead>
              <TableHead className="font-semibold text-foreground">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="size-3.5" /> Storage
                </div>
              </TableHead>
              <TableHead className="pr-5 text-right font-semibold text-foreground">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : sites.map((s) => {
                  const isActing = actionLoading === s.id;
                  return (
                    <TableRow
                      key={s.id}
                      className={`transition-colors ${isActing || loading ? "opacity-60" : ""}`}
                    >
                      {/* Site */}
                      <TableCell className="pl-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                            <Globe2 className="size-4 text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium leading-tight">{s.name}</p>
                            <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                              <span className="text-muted-foreground/50">/</span>{s.slug}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Owner */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                            <User className="size-3 text-muted-foreground" />
                          </div>
                          <span className="truncate font-mono text-xs text-muted-foreground max-w-[160px]">
                            {s.owner_email}
                          </span>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {s.status === "published" ? (
                          <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 hover:bg-emerald-500/20">
                            <CheckCircle2 className="size-3" />
                            Published
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <Clock className="size-3" />
                            {s.status}
                          </Badge>
                        )}
                      </TableCell>

                      {/* Pages quota */}
                      <TableCell>
                        <QuotaCell
                          used={s.pages_count}
                          max={s.quota_max_pages}
                          fmt={(n) => `${n}`}
                        />
                      </TableCell>

                      {/* Storage quota */}
                      <TableCell>
                        <QuotaCell
                          used={s.storage_bytes}
                          max={s.quota_max_storage_bytes}
                          fmt={fmtBytes}
                        />
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="pr-5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isActing ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              {/* Admin bypass — buka editor sebagai owner
                                  untuk support tickets / inspect visual.
                                  Backend admit lewat sites.GetOwnedOrAdmin. */}
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs hover:bg-primary/10 hover:text-primary"
                                title="Buka editor sebagai owner untuk debugging"
                              >
                                <Link href={`/sites/${s.id}/editor`}>
                                  <SquarePen className="size-3.5" />
                                  Buka Editor
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs hover:bg-muted"
                                onClick={() => setEditing(s)}
                              >
                                <SlidersHorizontal className="size-3.5" />
                                Edit Quota
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => remove(s.id, s.name)}
                              >
                                <Trash2 className="size-3.5" />
                                Hapus
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

            {/* Empty state */}
            {sites.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Globe2 className="size-8 opacity-30" />
                    <p className="text-sm font-medium">
                      {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}"` : "Belum ada situs"}
                    </p>
                    {debouncedQ && (
                      <button
                        onClick={() => setQ("")}
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Hapus pencarian
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {data && data.total_pages > 0 && (
          <div className="border-t bg-muted/20">
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

      <QuotaDialog
        site={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />
    </div>
  );
}

function QuotaCell({
  used,
  max,
  fmt,
}: {
  used: number;
  max: number;
  fmt: (n: number) => string;
}) {
  const p = pct(used, max);
  const barColor =
    p >= 90
      ? "bg-red-500"
      : p >= 70
      ? "bg-amber-500"
      : "bg-emerald-500";
  const textColor =
    p >= 90
      ? "text-red-600 dark:text-red-400"
      : p >= 70
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";

  return (
    <div className="space-y-1 min-w-[110px]">
      <div className={`flex items-baseline gap-1 tabular-nums text-xs font-medium ${textColor}`}>
        {fmt(used)}
        <span className="text-muted-foreground font-normal">/ {fmt(max)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={p} indicatorClassName={barColor} className="h-1.5 w-24 bg-muted" />
        <span className="text-[10px] text-muted-foreground tabular-nums">{p}%</span>
      </div>
    </div>
  );
}

function QuotaDialog({
  site,
  onClose,
  onSaved,
}: {
  site: AdminSite | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [maxPages, setMaxPages] = useState(0);
  const [maxStorageMB, setMaxStorageMB] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (site) {
      setMaxPages(site.quota_max_pages);
      setMaxStorageMB(Math.round(site.quota_max_storage_bytes / (1024 * 1024)));
      setErr(null);
    }
  }, [site]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!site) return;
    setSaving(true);
    setErr(null);
    try {
      await api(`/api/v1/admin/sites/${site.id}/quota`, {
        method: "PATCH",
        body: JSON.stringify({
          quota_max_pages: maxPages,
          quota_max_storage_bytes: maxStorageMB * 1024 * 1024,
        }),
      });
      toast.success(`Quota untuk "${site.name}" berhasil diperbarui.`);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const pagesUsagePct = site ? pct(site.pages_count, maxPages) : 0;
  const storageUsagePct = site ? pct(site.storage_bytes, maxStorageMB * 1024 * 1024) : 0;

  return (
    <Dialog open={!!site} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <SlidersHorizontal className="size-4 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Edit Quota</DialogTitle>
              <DialogDescription className="text-xs mt-0">
                {site?.name}{" "}
                <span className="font-mono text-muted-foreground/70">/{site?.slug}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5 pt-1">
          {/* Pages quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="max-pages" className="text-sm font-medium">
                Maks Halaman
              </Label>
              {site && (
                <span className="text-xs text-muted-foreground">
                  Terpakai:{" "}
                  <span className={pagesUsagePct >= 90 ? "text-red-500 font-semibold" : "font-medium"}>
                    {site.pages_count}
                  </span>
                </span>
              )}
            </div>
            <Input
              id="max-pages"
              type="number"
              min={1}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="h-9"
            />
            {site && maxPages > 0 && (
              <div className="flex items-center gap-2">
                <Progress
                  value={pagesUsagePct}
                  indicatorClassName={pagesUsagePct >= 90 ? "bg-red-500" : pagesUsagePct >= 70 ? "bg-amber-500" : "bg-emerald-500"}
                  className="h-1.5 flex-1 bg-muted"
                />
                <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                  {pagesUsagePct}%
                </span>
              </div>
            )}
          </div>

          {/* Storage quota */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="max-storage" className="text-sm font-medium">
                Maks Storage (MB)
              </Label>
              {site && (
                <span className="text-xs text-muted-foreground">
                  Terpakai:{" "}
                  <span className={storageUsagePct >= 90 ? "text-red-500 font-semibold" : "font-medium"}>
                    {fmtBytes(site.storage_bytes)}
                  </span>
                </span>
              )}
            </div>
            <Input
              id="max-storage"
              type="number"
              min={1}
              value={maxStorageMB}
              onChange={(e) => setMaxStorageMB(Number(e.target.value))}
              className="h-9"
            />
            {site && maxStorageMB > 0 && (
              <div className="flex items-center gap-2">
                <Progress
                  value={storageUsagePct}
                  indicatorClassName={storageUsagePct >= 90 ? "bg-red-500" : storageUsagePct >= 70 ? "bg-amber-500" : "bg-emerald-500"}
                  className="h-1.5 flex-1 bg-muted"
                />
                <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                  {storageUsagePct}%
                </span>
              </div>
            )}
          </div>

          {err && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="size-3.5 shrink-0" />
              {err}
            </div>
          )}

          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="h-9">
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="h-9 gap-2">
              {saving ? <><Loader2 className="size-3.5 animate-spin" /> Menyimpan…</> : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
