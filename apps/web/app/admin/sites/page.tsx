"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Pagination, SearchBar, useDebounced, type PaginatedResult } from "@/components/Pagination";
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
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "name_asc", label: "Nama A→Z" },
  { value: "storage_desc", label: "Storage Terbesar" },
  { value: "pages_desc", label: "Halaman Terbanyak" },
];

export default function AdminSitesPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<AdminSite> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<AdminSite | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
        sort,
      });
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
  useEffect(() => {
    refresh();
  }, [page, debouncedQ, sort]);

  async function remove(id: string, name: string) {
    if (!confirm(`Hapus situs ${name}? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api(`/api/v1/admin/sites/${id}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const sites = data?.items ?? [];

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Situs</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} situs di platform` : "Memuat…"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SearchBar value={q} onChange={setQ} placeholder="Cari nama/slug/email..." />
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-56">
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
      </header>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

      <Card className="mt-6 overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama / Slug</TableHead>
              <TableHead>Pemilik</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Halaman</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {sites.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">{s.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">/{s.slug}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{s.owner_email}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "published" ? "success" : "secondary"}>
                    {s.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <QuotaCell used={s.pages_count} max={s.quota_max_pages} fmt={(n) => `${n}`} />
                </TableCell>
                <TableCell>
                  <QuotaCell
                    used={s.storage_bytes}
                    max={s.quota_max_storage_bytes}
                    fmt={fmtBytes}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="link" size="sm" onClick={() => setEditing(s)}>
                    Edit Quota
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-destructive"
                    onClick={() => remove(s.id, s.name)}
                  >
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {sites.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}".` : "Belum ada situs."}
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

      <QuotaDialog
        site={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
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
  const indicator =
    p >= 90 ? "bg-destructive" : p >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="text-xs">
      <div className="tabular-nums">
        {fmt(used)} / {fmt(max)}
      </div>
      <Progress value={p} indicatorClassName={indicator} className="mt-0.5 h-1 w-24" />
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
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!site} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Quota</DialogTitle>
          <DialogDescription>{site?.name}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="max-pages">Maks Halaman</Label>
            <Input
              id="max-pages"
              type="number"
              min={1}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Saat ini terpakai: {site?.pages_count ?? 0}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max-storage">Maks Storage (MB)</Label>
            <Input
              id="max-storage"
              type="number"
              min={1}
              value={maxStorageMB}
              onChange={(e) => setMaxStorageMB(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Saat ini terpakai: {fmtBytes(site?.storage_bytes ?? 0)}
            </p>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
