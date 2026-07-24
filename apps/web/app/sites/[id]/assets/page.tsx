"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Upload,
  Search,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  CloudUpload,
  File,
  Trash2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken } from "@/lib/api";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtBytes } from "@/lib/format";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

type Asset = {
  id: string;
  url: string;
  mime: string;
  size: number;
  created_at: string;
};

// SVG ditolak server-side karena bisa berisi <script> (XSS). PNG/JPG/WebP/GIF only.
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export default function AssetsPage() {
  const params = useParams<{ id: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [data, setData] = useState<PaginatedResult<Asset> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [deletingID, setDeletingID] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [debouncedQ]);

  async function refresh() {
    try {
      const p = new URLSearchParams({ page: String(page), page_size: "24" });
      if (debouncedQ) p.set("q", debouncedQ);
      const r = await api<PaginatedResult<Asset>>(`/api/v1/sites/${params.id}/assets?${p}`);
      setData(r);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => { refresh(); }, [params.id, page, debouncedQ]);

  async function upload(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/v1/sites/${params.id}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.error)
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);

      // Surface compression savings — server may have downscaled/re-encoded
      // the file. body.data.size is the stored (post-compress) size.
      const newSize = body?.data?.size as number | undefined;
      if (typeof newSize === "number" && newSize < file.size) {
        const saved = file.size - newSize;
        const pct = Math.round((saved / file.size) * 100);
        if (pct >= 5) {
          toast.success(
            `Gambar dikompres: ${fmtBytes(file.size)} → ${fmtBytes(newSize)} (-${pct}%)`,
          );
        }
      }

      await refresh();
    } catch (e) {
      setUploadErr((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete(a: Asset) {
    if (!confirm("Hapus aset ini? Kalau dipakai di halaman/produk/blog, gambar akan hilang di render.")) {
      return;
    }
    setDeletingID(a.id);
    try {
      await api(`/api/v1/assets/${a.id}`, { method: "DELETE" });
      toast.success("Aset dihapus");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeletingID(null);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // noop
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  const assets = data?.items ?? [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/10">
            <ImageIcon className="size-4 text-rose-600" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Manajemen Aset
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Aset</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Upload dan kelola gambar untuk situs Anda.
        </p>
      </div>

      {/* Upload zone */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="border-b bg-muted/30 px-5 py-3 flex items-center gap-2">
          <Upload className="size-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Upload Gambar</p>
          <span className="ml-auto text-xs text-muted-foreground">PNG, JPG, WebP, GIF · Maks 10 MB</span>
        </div>

        <div className="p-5">
          {/* Drop zone */}
          <div
            ref={dropRef}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && fileRef.current?.click()}
            className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-10 transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
              }}
            />

            {uploading ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
                <p className="text-sm font-medium">Mengunggah…</p>
              </>
            ) : (
              <>
                <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${dragging ? "bg-primary/10" : "bg-muted"}`}>
                  <CloudUpload className={`size-5 transition-colors ${dragging ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {dragging ? "Lepaskan file di sini" : "Klik atau drag & drop file"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPG, WebP, GIF hingga 10 MB</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2 pointer-events-none">
                  <Upload className="size-3.5" />
                  Pilih File
                </Button>
              </>
            )}
          </div>

          {/* Upload error */}
          {uploadErr && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              {uploadErr}
            </div>
          )}
        </div>
      </div>

      {/* Library */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold">
              Library
              {data && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {data.total}
                </span>
              )}
            </p>
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter MIME atau nama…"
              className="h-8 pl-9 bg-muted/40 border-transparent focus:border-input focus:bg-background transition-colors text-sm"
            />
          </div>
        </div>

        {/* Error */}
        {err && (
          <div className="m-5 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span><span className="font-medium">Gagal memuat:</span> {err}</span>
          </div>
        )}

        <div className="p-5">
          {assets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
              <ImageIcon className="size-10 opacity-25" />
              <p className="text-sm font-medium">
                {debouncedQ ? `Tidak ada hasil untuk "${debouncedQ}"` : "Belum ada aset"}
              </p>
              {debouncedQ ? (
                <button
                  onClick={() => setQ("")}
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Hapus filter
                </button>
              ) : (
                <p className="text-xs">Upload gambar pertama Anda di atas</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {assets.map((a) => {
                const isCopied = copied === a.url;
                const isImage = a.mime.startsWith("image/");
                const isDeleting = deletingID === a.id;
                return (
                  <div
                    key={a.id}
                    className={`group overflow-hidden rounded-xl border bg-muted/20 transition-all hover:shadow-md hover:-translate-y-0.5 ${
                      isDeleting ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    {/* Preview — click untuk buka modal full-size */}
                    <button
                      type="button"
                      onClick={() => isImage && setPreviewAsset(a)}
                      className={`relative block aspect-square w-full overflow-hidden bg-muted/50 ${
                        isImage ? "cursor-zoom-in" : "cursor-default"
                      }`}
                      title={isImage ? "Klik untuk preview" : undefined}
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.url}
                          alt=""
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <File className="size-8 text-muted-foreground" />
                        </div>
                      )}
                      {isImage && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/20 group-hover:opacity-100">
                          <div className="rounded-full bg-white/95 p-2 shadow-md">
                            <Eye className="size-4 text-foreground" />
                          </div>
                        </div>
                      )}
                    </button>

                    {/* Meta + actions */}
                    <div className="p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground truncate">
                          {a.mime.split("/")[1]?.toUpperCase() ?? a.mime}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {fmtBytes(a.size)}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => copy(a.url)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                            isCopied
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : "border-border bg-background hover:bg-muted"
                          }`}
                        >
                          {isCopied ? (
                            <><Check className="size-3" /> Tersalin!</>
                          ) : (
                            <><Copy className="size-3" /> Copy</>
                          )}
                        </button>
                        <button
                          onClick={() => onDelete(a)}
                          disabled={isDeleting}
                          className="flex items-center justify-center rounded-lg border border-border bg-background px-2 py-1.5 text-destructive transition-colors hover:border-destructive/40 hover:bg-destructive/5"
                          title="Hapus aset"
                        >
                          {isDeleting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {data && data.total_pages > 1 && (
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
      </div>

      {/* Preview modal — buka full-size gambar kalau user klik card. */}
      {previewAsset && (
        <Dialog open onOpenChange={(open) => !open && setPreviewAsset(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <ImageIcon className="size-4 text-muted-foreground" />
                <span className="font-mono text-xs">
                  {previewAsset.mime}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {fmtBytes(previewAsset.size)}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewAsset.url}
                alt=""
                className="mx-auto block max-h-[65vh] w-auto object-contain"
              />
            </div>
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <button
                onClick={() => copy(previewAsset.url)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  copied === previewAsset.url
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                {copied === previewAsset.url ? (
                  <><Check className="size-3" /> Tersalin!</>
                ) : (
                  <><Copy className="size-3" /> Copy URL</>
                )}
              </button>
              <Button variant="outline" size="sm" onClick={() => setPreviewAsset(null)}>
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

