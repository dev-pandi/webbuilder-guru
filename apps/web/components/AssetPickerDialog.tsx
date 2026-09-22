"use client";

// AssetPickerDialog — modal dialog untuk pilih asset (image atau audio) dari
// library site + upload baru + tab paste URL eksternal. Beda dari ImagePicker
// yang bundle button + preview; component ini pure-dialog, caller yg control
// open state + render tombol trigger sendiri.
//
// Dipakai oleh RichEditor untuk sisipkan gambar/audio ke body markdown.

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  CloudUpload,
  FileAudio,
  ImageIcon,
  Link2,
  Loader2,
  Search,
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
type Kind = "image" | "audio";

const KIND_META: Record<Kind, {
  title: string;
  subtitle: string;
  accept: string;
  uploadLabel: string;
  emptyTitle: string;
  emptyHint: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconTint: string;
}> = {
  image: {
    title: "Pilih Gambar",
    subtitle: "Pilih dari library, upload baru, atau tempel URL eksternal.",
    accept: "image/png,image/jpeg,image/webp,image/gif",
    uploadLabel: "Upload Gambar",
    emptyTitle: "Library gambar masih kosong",
    emptyHint: "Upload gambar pertama atau drag & drop di sini.",
    Icon: ImageIcon,
    iconTint: "bg-rose-500/10 text-rose-600",
  },
  audio: {
    title: "Pilih Audio",
    subtitle: "Pilih dari library, upload baru, atau tempel URL eksternal.",
    accept: "audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/webm",
    uploadLabel: "Upload Audio",
    emptyTitle: "Library audio masih kosong",
    emptyHint: "Upload MP3/M4A/OGG/WAV atau drag & drop di sini.",
    Icon: FileAudio,
    iconTint: "bg-emerald-500/10 text-emerald-600",
  },
};

export function AssetPickerDialog({
  open,
  onOpenChange,
  onPick,
  kind = "image",
  current = "",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (url: string) => void;
  kind?: Kind;
  current?: string;
}) {
  const meta = KIND_META[kind];
  const params = useParams<{ id: string }>();
  const [tab, setTab] = useState<"library" | "url">("library");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setUrlInput(current || "");
  }, [open, current]);

  async function refresh() {
    setLoading(true);
    try {
      // Backend belum expose ?mime filter param → fetch all, filter client-side
      // by mime prefix. Cukup untuk ukuran library normal (<200 items/site).
      const r = await api<PaginatedResult<Asset>>(
        `/api/v1/sites/${params.id}/assets?page=1&page_size=100`,
      );
      const prefix = kind === "audio" ? "audio/" : "image/";
      setAssets(r.items.filter((a) => a.mime.toLowerCase().startsWith(prefix)));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

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
      toast.success(`${kind === "audio" ? "Audio" : "Gambar"} berhasil diunggah`);
      await refresh();
      onPick(newAsset.url);
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
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", meta.iconTint)}>
              <meta.Icon className="size-4" />
            </div>
            <div>
              <DialogTitle>{meta.title}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {meta.subtitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b bg-muted/20 px-6">
          <TabBtn active={tab === "library"} onClick={() => setTab("library")} icon={meta.Icon} label="Library" count={assets.length} />
          <TabBtn active={tab === "url"} onClick={() => setTab("url")} icon={Link2} label="URL Eksternal" />
        </div>

        {tab === "library" ? (
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari berdasarkan MIME atau nama file…"
                  className="h-9 border-transparent bg-muted/40 pl-9 focus:border-input focus:bg-background"
                />
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={meta.accept}
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
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Upload Baru
              </Button>
            </div>

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
                <div className={kind === "audio" ? "grid gap-2" : "grid gap-3 sm:grid-cols-4"}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "animate-pulse rounded-lg bg-muted",
                        kind === "audio" ? "h-14" : "aspect-square",
                      )}
                    />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <div className={cn("flex size-12 items-center justify-center rounded-xl", meta.iconTint)}>
                    <meta.Icon className="size-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {q.trim() ? `Tidak ada hasil untuk "${q}"` : meta.emptyTitle}
                    </p>
                    {!q.trim() && (
                      <p className="mt-1 text-xs text-muted-foreground">{meta.emptyHint}</p>
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
                      {meta.uploadLabel}
                    </Button>
                  )}
                </div>
              ) : kind === "audio" ? (
                // Audio: list layout — nama file (dipendekkan) + size + play preview
                <div className="grid gap-2">
                  {filtered.map((a) => {
                    const selected = a.url === current;
                    const displayName = shortenAudioName(a.url);
                    const fullName = a.url.split("/").pop() ?? a.url;
                    return (
                      <button
                        key={a.id}
                        onClick={() => onPick(a.url)}
                        className={cn(
                          "flex w-full items-center gap-3 overflow-hidden rounded-lg border bg-card p-3 text-left transition-colors",
                          selected
                            ? "border-primary ring-2 ring-primary/30"
                            : "hover:border-primary/50 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                          <FileAudio className="size-5" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                          <div
                            className="truncate text-sm font-medium"
                            title={fullName}
                          >
                            {displayName}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.mime.replace("audio/", "")} · {fmtBytes(a.size)}
                          </div>
                        </div>
                        <audio
                          controls
                          preload="none"
                          src={a.url}
                          className="h-8 w-[180px] shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        {selected && (
                          <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Image: grid with thumbnails
                <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-5">
                  {filtered.map((a) => {
                    const selected = a.url === current;
                    return (
                      <button
                        key={a.id}
                        onClick={() => onPick(a.url)}
                        className={cn(
                          "relative overflow-hidden rounded-lg border bg-card transition-all",
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
                            {fmtBytes(a.size)}
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
          <div className="grid gap-3 p-6">
            <label className="text-xs font-semibold text-muted-foreground">
              URL {kind === "audio" ? "audio" : "gambar"} eksternal
            </label>
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button
                size="sm"
                disabled={!urlInput.trim()}
                onClick={() => onPick(urlInput.trim())}
              >
                Sisipkan
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// shortenAudioName — extract friendly name dari URL storage key.
// Backend simpan sebagai `{site-id}/{timestamp}-{uuid}.ext` yang panjang &
// tidak readable. Pendekatan: ambil ext + prefix 6 char dari basename
// (setelah timestamp) supaya user bisa bedakan file. Contoh:
//   1790042508943424000-a78dbab6-2c92-...wav → "a78dbab6…wav"
function shortenAudioName(url: string): string {
  const raw = url.split("/").pop() ?? url;
  const dot = raw.lastIndexOf(".");
  const ext = dot > 0 ? raw.slice(dot + 1) : "";
  const base = dot > 0 ? raw.slice(0, dot) : raw;
  // Kalau nama pendek (<= 32 char), tampilkan apa adanya.
  if (base.length <= 32) return raw;
  // Kalau ada dash pertama (mis. timestamp-uuid pattern), tampilkan bagian
  // setelah dash pertama + ellipsis.
  const dashIdx = base.indexOf("-");
  const meaningful = dashIdx > 0 ? base.slice(dashIdx + 1) : base;
  const short = meaningful.slice(0, 8);
  return ext ? `${short}….${ext}` : `${short}…`;
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
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {count !== undefined && (
        <span className="ml-1 text-[10px] text-muted-foreground">({count})</span>
      )}
    </button>
  );
}
