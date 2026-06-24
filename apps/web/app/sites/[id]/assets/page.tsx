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
} from "lucide-react";
import { api, getAccessToken } from "@/lib/api";
import { Pagination, useDebounced, type PaginatedResult } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtBytes } from "@/lib/format";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

type Asset = {
  id: string;
  url: string;
  mime: string;
  size: number;
  created_at: string;
};

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

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
      await refresh();
    } catch (e) {
      setUploadErr((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
    <div className="space-y-6">
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
          <span className="ml-auto text-xs text-muted-foreground">PNG, JPG, WebP, GIF, SVG · Maks 10 MB</span>
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
                  <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPG, WebP, GIF, SVG hingga 10 MB</p>
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
                return (
                  <div
                    key={a.id}
                    className="group overflow-hidden rounded-xl border bg-muted/20 transition-all hover:shadow-md hover:-translate-y-0.5"
                  >
                    {/* Preview */}
                    <div className="aspect-square overflow-hidden bg-muted/50">
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
                    </div>

                    {/* Meta + copy */}
                    <div className="p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground truncate">
                          {a.mime.split("/")[1]?.toUpperCase() ?? a.mime}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {fmtBytes(a.size)}
                        </span>
                      </div>
                      <button
                        onClick={() => copy(a.url)}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                          isCopied
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        {isCopied ? (
                          <><Check className="size-3" /> Tersalin!</>
                        ) : (
                          <><Copy className="size-3" /> Copy URL</>
                        )}
                      </button>
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
    </div>
  );
}

