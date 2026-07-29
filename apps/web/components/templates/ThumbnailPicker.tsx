"use client";

// Thumbnail picker — upload file to admin storage atau paste URL manual.
// Return URL final via `onChange`. Preview image inline supaya admin lihat
// hasil sebelum simpan.

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAccessToken } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";

export function ThumbnailPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    // Client-side guard sebelum hit backend — feedback lebih cepat.
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File terlalu besar (max 5 MB)");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
      toast.error("Format harus PNG, JPG, WebP, atau GIF");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/templates/thumbnail`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const url = body?.data?.url as string | undefined;
      if (!url) throw new Error("Response tidak mengandung URL");
      onChange(url);
      toast.success("Thumbnail ter-upload");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {/* Preview box */}
        <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {value ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={value}
              alt="Thumbnail preview"
              className="size-full object-cover"
              onError={(e) => {
                // Kalau URL invalid, fallback ke placeholder icon.
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImageIcon className="size-6 text-muted-foreground opacity-40" />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                // Reset input supaya user bisa upload file sama lagi kalau perlu.
                e.currentTarget.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="gap-1.5"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {value ? "Ganti" : "Upload"}
            </Button>
            {value && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                disabled={uploading}
                className="gap-1 text-destructive"
              >
                <X className="size-3.5" />
                Hapus
              </Button>
            )}
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              {showManual ? "Sembunyikan URL manual" : "Atau paste URL"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            PNG / JPG / WebP / GIF, maks 5 MB. Otomatis di-upload ke asset storage.
          </p>
        </div>
      </div>

      {showManual && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…/thumbnail.png"
          type="url"
          className="text-xs"
        />
      )}
    </div>
  );
}
