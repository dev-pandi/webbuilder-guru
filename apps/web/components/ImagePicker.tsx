"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CloudUpload,
  ImageIcon,
  ImagePlus,
  Link2,
  Loader2,
  Replace,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken } from "@/lib/api";
import { fmtBytes } from "@/lib/format";
import type { PaginatedResult } from "@/components/Pagination";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

type Asset = { id: string; url: string; mime: string; size: number };

/**
 * ImagePicker — input gambar reusable.
 *
 * Dua mode visual:
 * - `size="md"` (default): kartu preview lebar atau dropzone besar.
 * - `size="sm"`: thumbnail compact untuk dipakai di list items / form padat.
 *
 * Sumber gambar:
 * - Pilih dari Asset Library (atau upload baru lewat dialog)
 * - Tempel URL eksternal lewat tab "URL" di dialog
 */
export function ImagePicker({
  value,
  onChange,
  size = "md",
}: {
  value: string;
  onChange: (url: string) => void;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const compact = size === "sm";

  return (
    <>
      {value ? (
        <PreviewCard
          src={value}
          compact={compact}
          onReplace={() => setOpen(true)}
          onRemove={() => onChange("")}
        />
      ) : (
        <EmptyState compact={compact} onClick={() => setOpen(true)} />
      )}

      <LibraryDialog
        open={open}
        onOpenChange={setOpen}
        current={value}
        onPick={(url) => {
          onChange(url);
          setOpen(false);
        }}
      />
    </>
  );
}

// ---------- Inline trigger ----------

function EmptyState({
  compact,
  onClick,
}: {
  compact: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-input bg-muted/20 text-muted-foreground transition-all hover:border-primary/60 hover:bg-primary/5 hover:text-primary",
        compact ? "aspect-square text-[10px]" : "h-28 text-xs",
      )}
    >
      <ImagePlus className={cn("transition-transform group-hover:scale-110", compact ? "size-4" : "size-5")} />
      <span className="font-medium">{compact ? "Pilih" : "Pilih gambar"}</span>
      {!compact && (
        <span className="text-[10px] opacity-70">dari library atau upload</span>
      )}
    </button>
  );
}

function PreviewCard({
  src,
  compact,
  onReplace,
  onRemove,
}: {
  src: string;
  compact: boolean;
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted/30",
        compact ? "aspect-square" : "aspect-video w-full",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />

      {/* Hover overlay with actions */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
        <Button
          type="button"
          variant="secondary"
          size={compact ? "icon" : "sm"}
          className={cn(
            "pointer-events-auto shadow-md",
            compact ? "size-7" : "h-8 gap-1.5",
          )}
          onClick={onReplace}
          title="Ganti gambar"
        >
          <Replace className={compact ? "size-3.5" : "size-3.5"} />
          {!compact && <span className="text-xs">Ganti</span>}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size={compact ? "icon" : "sm"}
          className={cn(
            "pointer-events-auto shadow-md",
            compact ? "size-7" : "h-8 gap-1.5",
          )}
          onClick={onRemove}
          title="Hapus"
        >
          <Trash2 className={compact ? "size-3.5" : "size-3.5"} />
          {!compact && <span className="text-xs">Hapus</span>}
        </Button>
      </div>
    </div>
  );
}

// ---------- Library Dialog ----------

// SVG ditolak server-side karena risiko XSS. PNG/JPG/WebP/GIF only.
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

function LibraryDialog({
  open,
  onOpenChange,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current: string;
  onPick: (url: string) => void;
}) {
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<"library" | "url">("library");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Pre-fill URL tab with current value if it's an external URL.
  useEffect(() => {
    if (open) setUrlInput(current || "");
  }, [open, current]);

  async function refresh() {
    setLoading(true);
    try {
      const r = await api<PaginatedResult<Asset>>(
        `/api/v1/sites/${params.id}/assets?page=1&page_size=48`,
      );
      setAssets(r.items);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/v1/sites/${params.id}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const newAsset = body.data as Asset;
      // Show compression savings if the server reduced the file by ≥5%.
      const saved = file.size - newAsset.size;
      const pct = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
      if (pct >= 5) {
        toast.success(
          `Gambar diunggah & dikompres: ${fmtBytes(file.size)} → ${fmtBytes(newAsset.size)} (-${pct}%)`,
        );
      } else {
        toast.success("Gambar berhasil diunggah");
      }
      await refresh();
      onPick(newAsset.url); // auto-select & close
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
  }

  const filtered = q.trim()
    ? assets.filter(
        (a) =>
          a.mime.toLowerCase().includes(q.toLowerCase()) ||
          a.url.toLowerCase().includes(q.toLowerCase()),
      )
    : assets;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10">
              <ImageIcon className="size-4 text-rose-600" />
            </div>
            <div>
              <DialogTitle>Pilih Gambar</DialogTitle>
              <DialogDescription className="mt-0.5">
                Pilih dari library, upload baru, atau tempel URL eksternal.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b bg-muted/20 px-6">
          <TabBtn
            active={tab === "library"}
            onClick={() => setTab("library")}
            icon={ImageIcon}
            label="Library"
            count={assets.length}
          />
          <TabBtn
            active={tab === "url"}
            onClick={() => setTab("url")}
            icon={Link2}
            label="URL Eksternal"
          />
        </div>

        {tab === "library" ? (
          <div className="flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari berdasarkan MIME atau nama file…"
                  className="h-9 border-transparent bg-muted/40 pl-9 transition-colors focus:border-input focus:bg-background"
                />
              </div>
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
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                size="sm"
                className="gap-2 shadow-sm"
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload Baru
              </Button>
            </div>

            {/* Drop zone overlay when dragging */}
            <div
              className="relative max-h-[60vh] min-h-[200px] overflow-y-auto p-4"
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {dragging && (
                <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/5 text-primary">
                  <CloudUpload className="size-8" />
                  <p className="text-sm font-medium">Lepaskan file di sini</p>
                </div>
              )}

              {loading ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="aspect-square animate-pulse rounded-lg bg-muted"
                    />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
                    <ImageIcon className="size-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {q.trim()
                        ? `Tidak ada hasil untuk "${q}"`
                        : "Library masih kosong"}
                    </p>
                    {!q.trim() && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Upload gambar pertama atau drag & drop di sini.
                      </p>
                    )}
                  </div>
                  {!q.trim() && (
                    <Button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      size="sm"
                      className="mt-1 gap-2 shadow-sm"
                    >
                      <Upload className="size-4" />
                      Upload Gambar
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5">
                  {filtered.map((a) => {
                    const selected = a.url === current;
                    return (
                      <button
                        key={a.id}
                        onClick={() => onPick(a.url)}
                        className={cn(
                          "group/asset relative overflow-hidden rounded-lg border bg-card transition-all",
                          selected
                            ? "border-primary ring-2 ring-primary/30"
                            : "hover:border-primary/50 hover:shadow-md",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url}
                          alt=""
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                        />
                        {selected && (
                          <div className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                            <Check className="size-3.5" />
                          </div>
                        )}
                        <div className="border-t bg-card px-2 py-1.5 text-left">
                          <p className="truncate text-[10px] text-muted-foreground">
                            {(a.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <UrlTab
            value={urlInput}
            onChange={setUrlInput}
            onPick={onPick}
            currentlySet={current}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
          {count}
        </span>
      )}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
    </button>
  );
}

function UrlTab({
  value,
  onChange,
  onPick,
  currentlySet,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (url: string) => void;
  currentlySet: string;
}) {
  const trimmed = value.trim();
  const valid =
    trimmed.length > 0 &&
    /^https?:\/\//i.test(trimmed); // simple URL sanity
  const sameAsCurrent = trimmed === currentlySet;

  return (
    <div className="space-y-4 p-6">
      <div className="space-y-2">
        <label htmlFor="img-url" className="text-sm font-medium">
          URL gambar eksternal
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="img-url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://contoh.com/gambar.jpg"
              className="pl-9 font-mono text-xs"
              autoFocus
            />
          </div>
          <Button
            onClick={() => onPick(trimmed)}
            disabled={!valid || sameAsCurrent}
          >
            Gunakan
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Hostnya harus dapat diakses publik. Untuk kontrol penuh, lebih baik upload ke library.
        </p>
        {trimmed && !valid && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-3.5" />
            URL harus dimulai dengan <code className="rounded bg-muted px-1">http://</code> atau{" "}
            <code className="rounded bg-muted px-1">https://</code>.
          </div>
        )}
      </div>

      {valid && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <div className="overflow-hidden rounded-lg border bg-muted/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={trimmed}
              alt=""
              className="max-h-[300px] w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

