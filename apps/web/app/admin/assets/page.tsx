"use client";

// Admin asset moderation — paginated cross-user search untuk deteksi upload
// mencurigakan (nama file aneh, size besar, user tertentu). Admin bisa
// takedown (DELETE) langsung dari list.
//
// Backend: GET /api/v1/admin/assets?q=&page=&page_size=&sort=
// DELETE  /api/v1/admin/assets/:id

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Film,
  HardDrive,
  ImageIcon,
  Loader2,
  Mail,
  Music,
  Search,
  Trash2,
  User,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
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

type AdminAsset = {
  id: string;
  site_id: string;
  kind: string;
  url: string;
  size: number;
  mime: string;
  width?: number | null;
  height?: number | null;
  created_at: string;
  site_name: string;
  site_slug: string;
  owner_id: string;
  owner_email: string;
  owner_name: string;
};

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "oldest", label: "Terlama" },
  { value: "size_desc", label: "Terbesar" },
  { value: "size_asc", label: "Terkecil" },
];

// MimeIcon — pilih ikon lucide berdasar MIME prefix.
function MimeIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <ImageIcon className={className} />;
  if (mime.startsWith("video/")) return <Film className={className} />;
  if (mime.startsWith("audio/")) return <Music className={className} />;
  return <FileText className={className} />;
}

// resolveImageUrl — tempel API base kalau URL relatif (local storage).
function resolveImageUrl(u: string): string {
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const base = process.env.NEXT_PUBLIC_API_BASE || "";
  return base.replace(/\/$/, "") + (u.startsWith("/") ? u : `/${u}`);
}

// filenameFrom — ambil basename dari URL untuk display.
function filenameFrom(u: string): string {
  const noQuery = u.split("?")[0] || u;
  const parts = noQuery.split("/");
  return parts[parts.length - 1] || u;
}

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell className="pl-5">
        <div className="h-12 w-12 rounded-md bg-muted animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="space-y-1.5">
          <div className="h-3.5 w-48 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-32 rounded bg-muted animate-pulse" />
        </div>
      </TableCell>
      <TableCell>
        <div className="space-y-1.5">
          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
        </div>
      </TableCell>
      <TableCell>
        <div className="h-3 w-20 rounded bg-muted animate-pulse" />
      </TableCell>
      <TableCell>
        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
      </TableCell>
      <TableCell className="pr-5">
        <div className="h-8 w-20 rounded bg-muted animate-pulse ml-auto" />
      </TableCell>
    </TableRow>
  );
}

export default function AdminAssetsPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("newest");
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<AdminAsset> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: "20", sort });
      if (debouncedQ) params.set("q", debouncedQ);
      const r = await api<PaginatedResult<AdminAsset>>(`/api/v1/admin/assets?${params}`);
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
  }, [page, debouncedQ, sort]);

  async function remove(asset: AdminAsset) {
    const fname = filenameFrom(asset.url);
    if (
      !confirm(
        `Hapus aset "${fname}"?\n\n` +
          `Milik: ${asset.owner_email}\n` +
          `Situs: ${asset.site_name}\n` +
          `Size: ${fmtBytes(asset.size)}\n\n` +
          `File akan dihapus dari storage. Tindakan ini tidak bisa dibatalkan.`,
      )
    )
      return;
    setDeleting(asset.id);
    try {
      await api(`/api/v1/admin/assets/${asset.id}`, { method: "DELETE" });
      toast.success(`Aset "${fname}" berhasil dihapus.`);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  const assets = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <HardDrive className="size-6 text-muted-foreground" /> Moderasi Aset
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pantau semua upload lintas user. Cari berdasar nama file, email pengguna, atau
            nama situs untuk mendeteksi upload mencurigakan.
          </p>
        </div>
        {!loading && data ? (
          <Badge variant="secondary" className="text-xs">
            {total.toLocaleString("id-ID")} aset
          </Badge>
        ) : null}
      </div>

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari nama file, MIME, email pengguna, nama situs…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="Urutkan" />
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
      </Card>

      {/* Error */}
      {err ? (
        <Card className="border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-semibold">Gagal memuat aset</div>
              <div className="text-destructive/80">{err}</div>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5 w-20">Preview</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Pengguna &amp; Situs</TableHead>
              <TableHead>Ukuran</TableHead>
              <TableHead>Diupload</TableHead>
              <TableHead className="pr-5 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={loading ? "opacity-60" : ""}>
            {loading && !data
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              : assets.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      {debouncedQ
                        ? `Tidak ada aset yang cocok dengan "${debouncedQ}".`
                        : "Belum ada aset yang diupload."}
                    </TableCell>
                  </TableRow>
                )
                : assets.map((a) => {
                    const isImage = a.mime.startsWith("image/");
                    const previewUrl = resolveImageUrl(a.url);
                    const fname = filenameFrom(a.url);
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="pl-5">
                          <div className="flex size-12 items-center justify-center overflow-hidden rounded-md border bg-muted/50">
                            {isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={previewUrl}
                                alt={fname}
                                className="size-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <MimeIcon mime={a.mime} className="size-5 text-muted-foreground" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="flex flex-col gap-0.5">
                            <a
                              href={previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 truncate text-sm font-medium hover:underline"
                              title={fname}
                            >
                              <span className="truncate">{fname}</span>
                              <ExternalLink className="size-3 shrink-0 opacity-60" />
                            </a>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal">
                                {a.mime}
                              </Badge>
                              {a.width && a.height ? (
                                <span className="tabular-nums">
                                  {a.width}×{a.height}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="flex flex-col gap-0.5 text-sm">
                            <Link
                              href={`/admin/users/${a.owner_id}`}
                              className="flex items-center gap-1 truncate hover:underline"
                            >
                              <User className="size-3 shrink-0 opacity-60" />
                              <span className="truncate">{a.owner_name || a.owner_email}</span>
                            </Link>
                            <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <Mail className="size-3 shrink-0 opacity-60" />
                              <span className="truncate">{a.owner_email}</span>
                            </div>
                            <Link
                              href={`/sites/${a.site_id}`}
                              className="truncate text-xs text-muted-foreground hover:underline"
                              title={a.site_name}
                            >
                              📁 {a.site_name}
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-sm">
                          {fmtBytes(a.size)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove(a)}
                            disabled={deleting === a.id}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            {deleting === a.id ? (
                              <>
                                <Loader2 className="mr-1 size-3.5 animate-spin" /> Hapus…
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-1 size-3.5" /> Hapus
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {data && data.total_pages > 1 ? (
        <Pagination
          page={data.page}
          totalPages={data.total_pages}
          total={data.total}
          pageSize={data.page_size}
          onPage={setPage}
        />
      ) : null}
    </div>
  );
}
