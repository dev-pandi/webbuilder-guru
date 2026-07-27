"use client";

// PreviewShareDialog — modal untuk share signed preview token ke reviewer.
// Backend endpoint: POST /api/v1/pages/:id/preview-token → { token, path,
// expires_at }. Token HMAC-signed, TTL 1 jam, stateless (no DB revoke —
// invalidate cara satu-satunya = tunggu expire atau generate token baru).
//
// Fitur:
//   - Auto-generate token saat dialog dibuka (dengan save-first kalau dirty)
//   - Copy URL ke clipboard
//   - Buka di tab baru
//   - Countdown live "berlaku X menit Y detik lagi"
//   - Regenerate token (untuk kalau URL bocor — token lama masih valid sampai
//     expire, tapi user bisa update reviewer dengan URL baru)
//   - Warning: siapa punya link bisa akses draft

import { useEffect, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type PreviewTokenResp = {
  token: string;
  path: string;
  expires_at: string; // RFC3339
};

type Props = {
  pageId: string | null;
  open: boolean;
  onClose: () => void;
  // onBeforeGenerate — dipanggil sebelum POST token. Editor pakai ini untuk
  // save-first kalau draft dirty supaya preview reflect state terakhir.
  onBeforeGenerate?: () => Promise<void>;
};

export function PreviewShareDialog({
  pageId,
  open,
  onClose,
  onBeforeGenerate,
}: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  // Renderer host — env-configurable per deployment karena dashboard host ≠
  // renderer host. Fallback logic (kalau env kosong):
  //   1. `app.xxx` → `xxx` (Caddy convention di web builder: app.localhost
  //      untuk dashboard, localhost untuk renderer)
  //   2. Sisanya = window.origin (single-host dev setup)
  // Kalau tebakan salah, `misconfigured` di-set true → banner peringatan
  // supaya user tahu link tidak akan work sampai env diperbaiki.
  const rendererBase = resolveRendererBase();
  // Kalau env kosong DAN hostname bukan pola Caddy `app.xxx`, kita tidak
  // tahu renderer di mana → fallback ke dashboard origin akan 404. Warn user.
  const misconfigured =
    !process.env.NEXT_PUBLIC_RENDERER_BASE &&
    typeof window !== "undefined" &&
    !window.location.hostname.startsWith("app.");
  const previewURL = token ? `${rendererBase}/_preview/${token}` : "";

  async function generate() {
    if (!pageId) return;
    setLoading(true);
    setErr(null);
    try {
      if (onBeforeGenerate) await onBeforeGenerate();
      const res = await api<PreviewTokenResp>(
        `/api/v1/pages/${pageId}/preview-token`,
        { method: "POST" },
      );
      setToken(res.token);
      setExpiresAt(new Date(res.expires_at));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate saat dibuka; reset state saat ditutup supaya reopen bikin
  // token baru (fresh expiry). Regen manual via tombol "Buat token baru".
  useEffect(() => {
    if (open && !token && !loading) {
      generate();
    }
    if (!open) {
      setToken(null);
      setExpiresAt(null);
      setErr(null);
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Live countdown ticker — 1s resolution cukup smooth untuk MM:SS display.
  useEffect(() => {
    if (!open || !expiresAt) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [open, expiresAt]);

  const msLeft = expiresAt ? expiresAt.getTime() - now : 0;
  const expired = expiresAt !== null && msLeft <= 0;
  const minutesLeft = Math.max(0, Math.floor(msLeft / 60000));
  const secondsLeft = Math.max(0, Math.floor(msLeft / 1000) % 60);

  async function copy() {
    if (!previewURL) return;
    try {
      await navigator.clipboard.writeText(previewURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link disalin");
    } catch {
      toast.error("Gagal menyalin — coba salin manual dari kolom URL");
    }
  }

  function openInTab() {
    if (!previewURL || expired) return;
    window.open(previewURL, "_blank", "noopener");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bagikan Pratinjau Draft</DialogTitle>
          <DialogDescription>
            Kirim link ini ke reviewer untuk melihat draft halaman sebelum
            diterbitkan. Link berlaku 1 jam sejak dibuat.
          </DialogDescription>
        </DialogHeader>

        {loading && !token ? (
          <div className="py-8 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Menyiapkan link pratinjau…
            </p>
          </div>
        ) : err ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {err}
          </div>
        ) : token ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="preview-url" className="text-xs">
                URL Pratinjau
              </Label>
              <div className="flex gap-2">
                <Input
                  id="preview-url"
                  readOnly
                  value={previewURL}
                  className="font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copy}
                  title="Salin ke clipboard"
                  className="shrink-0 gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5" />
                      Disalin
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Salin
                    </>
                  )}
                </Button>
              </div>
            </div>

            {expiresAt && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md border p-3 text-sm",
                  expired
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : minutesLeft < 5
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                    : "border-border bg-muted/40 text-muted-foreground",
                )}
              >
                <Clock className="size-4 shrink-0" />
                {expired ? (
                  <span>
                    Link sudah kadaluarsa. Klik <strong>Buat token baru</strong>{" "}
                    untuk dapat link.
                  </span>
                ) : (
                  <span>
                    Berlaku{" "}
                    <strong>
                      {minutesLeft > 0 && `${minutesLeft} menit `}
                      {secondsLeft.toString().padStart(2, "0")} detik
                    </strong>{" "}
                    lagi
                  </span>
                )}
              </div>
            )}

            <div className="flex gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <ShieldAlert className="size-4 shrink-0 text-amber-600" />
              <p>
                Siapa saja yang punya link ini bisa melihat draft — jangan post
                ke publik. Klik <strong>Buat token baru</strong> kalau link
                terlanjur bocor (token lama tetap valid sampai expire).
              </p>
            </div>

            {misconfigured && (
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <ShieldAlert className="size-4 shrink-0" />
                <div>
                  <p className="font-medium">
                    URL preview mungkin salah — dashboard host dipakai sebagai
                    renderer host.
                  </p>
                  <p className="mt-1 opacity-80">
                    Set <code>NEXT_PUBLIC_RENDERER_BASE</code> di{" "}
                    <code>apps/web/.env.local</code> ke URL renderer (mis.{" "}
                    <code>http://localhost</code> untuk Caddy dev, atau{" "}
                    <code>http://localhost:3001</code> untuk npm dev langsung).
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={generate}
            disabled={loading || !pageId}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Buat token baru
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
            <Button
              onClick={openInTab}
              disabled={!token || expired || loading}
              className="gap-1.5"
            >
              <ExternalLink className="size-4" />
              Buka di tab baru
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// resolveRendererBase — deteksi renderer origin dari env atau tebakan cerdas.
//
// Prioritas:
//  1. `NEXT_PUBLIC_RENDERER_BASE` — canonical, wajib di production
//  2. Kalau dashboard host punya prefix `app.`, buang → tebakan Caddy default
//     (app.localhost → localhost)
//  3. Fallback: dashboard host apa adanya (single-host dev, akan 404)
function resolveRendererBase(): string {
  const env = process.env.NEXT_PUBLIC_RENDERER_BASE;
  if (env) return env.replace(/\/$/, "");
  if (typeof window === "undefined") return "";
  const { origin, hostname, protocol, port } = window.location;
  if (hostname.startsWith("app.")) {
    const rendererHost = hostname.slice("app.".length);
    return `${protocol}//${rendererHost}${port ? ":" + port : ""}`;
  }
  return origin;
}
