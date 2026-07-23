"use client";

// Admin → Registrar webhook config.
//
// Alur operasional:
//   1. Page load → GET /admin/registrar/webhook (URL + prefix, secret always empty)
//   2. Admin ubah URL / prefix → POST → response includes fresh secret (SEKALI muncul)
//   3. Admin salin secret ke env REGISTRAR_WEBHOOK_SECRET + restart API
//
// Kalau env belum sinkron dengan registrar-side secret, endpoint
// /webhooks/registrar/domain-status akan reject dengan 401 invalid_signature.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Webhook,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Info,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WebhookConfig = {
  webhook_url: string;
  webhook_secret?: string; // only present in POST response
  external_prefix?: string;
};

// Auto-derived webhook URL kalau admin baru first-time setup — mereka bisa
// lihat contoh format yang benar berdasarkan public API base.
function defaultReceiverURL(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? "";
  if (!base) return "";
  return base.replace(/\/$/, "") + "/webhooks/registrar/domain-status";
}

export default function AdminRegistrarPage() {
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [url, setUrl] = useState("");
  const [prefix, setPrefix] = useState("");
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);

  const suggestedURL = useMemo(defaultReceiverURL, []);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const cfg = await api<WebhookConfig>("/api/v1/admin/registrar/webhook");
      setConfig(cfg);
      setUrl(cfg.webhook_url ?? "");
      setPrefix(cfg.external_prefix ?? "");
    } catch (e) {
      // 503 = registrar disabled; tampilkan lebih ramah
      if (e instanceof ApiError && e.status === 503) {
        setErr("Registrar API belum dikonfigurasi (REGISTRAR_API_URL kosong di env).");
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSave() {
    setSaving(true);
    setErr(null);
    try {
      const cfg = await api<WebhookConfig>("/api/v1/admin/registrar/webhook", {
        method: "POST",
        body: JSON.stringify({
          webhook_url: url.trim(),
          external_prefix: prefix.trim() || undefined,
        }),
      });
      setConfig({ ...cfg, webhook_secret: undefined }); // clear secret dari state utama
      if (cfg.webhook_secret) {
        setRotatedSecret(cfg.webhook_secret);
      } else {
        toast.success("Webhook config tersimpan");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = config != null && (url.trim() !== (config.webhook_url ?? "") ||
    prefix.trim() !== (config.external_prefix ?? ""));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Webhook className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Registrar Integration
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Konfigurasi Webhook</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Registrar akan POST callback status domain (payment success, EPP
            provisioned, dst.) ke URL di bawah. Web builder verifikasi payload
            via HMAC signature; secret WAJIB sinkron dengan env{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              REGISTRAR_WEBHOOK_SECRET
            </code>
            .
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          Refresh
        </Button>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endpoint Webhook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="url">Webhook URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/webhooks/registrar/domain-status"
              disabled={loading || saving}
            />
            {suggestedURL && suggestedURL !== url && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3" />
                Saran berdasarkan NEXT_PUBLIC_API_BASE:{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setUrl(suggestedURL)}
                >
                  {suggestedURL}
                </button>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prefix">
              External prefix <span className="text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="—"
              disabled={loading || saving}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Kosong untuk default. Isi kalau registrar butuh path prefix tertentu.
            </p>
          </div>

          <div className="rounded-lg border bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <strong>Setiap simpan me-rotate secret.</strong> Secret lama otomatis
                invalid — pastikan Anda salin secret baru ke env dan restart API sebelum
                pergi. Kalau lupa, HMAC verify akan gagal dan semua webhook di-reject.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Memuat…
                </span>
              ) : config?.webhook_url ? (
                <>
                  Tersimpan di registrar:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {config.webhook_url}
                  </code>
                </>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  Belum di-set
                </Badge>
              )}
            </div>
            <Button onClick={onSave} disabled={saving || loading || !url.trim() || !dirty} className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                "Simpan & rotate secret"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Cara pakai
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>Set URL ke endpoint receiver web builder (contoh di atas).</li>
            <li>
              Klik <strong>Simpan &amp; rotate secret</strong>. Secret muncul di dialog —{" "}
              <strong>hanya sekali</strong>.
            </li>
            <li>
              Salin ke env{" "}
              <code className="rounded bg-muted px-1 py-0.5">REGISTRAR_WEBHOOK_SECRET</code>.
            </li>
            <li>Restart API supaya HMAC verify pakai secret baru.</li>
          </ol>
          <p className="pt-1">
            <a
              href="https://github.com/pandi-rofai/registrar-api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              Dokumentasi registrar
              <ExternalLink className="size-3" />
            </a>
          </p>
        </CardContent>
      </Card>

      {rotatedSecret && (
        <SecretDialog secret={rotatedSecret} onClose={() => setRotatedSecret(null)} />
      )}
    </div>
  );
}

// SecretDialog menampilkan secret satu kali dengan copy-to-clipboard.
// Sengaja force user click "Sudah saya salin" — mengurangi risiko close tanpa capture.
function SecretDialog({ secret, onClose }: { secret: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.success("Secret disalin ke clipboard");
    } catch {
      toast.error("Gagal salin — pilih manual + Cmd/Ctrl+C");
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && copied && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Webhook secret baru</DialogTitle>
          <DialogDescription>
            Salin secret ini sekarang. Setelah dialog ditutup, secret tidak akan
            muncul lagi — server tidak mengembalikan secret di GET.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/50 p-3 font-mono text-sm break-all">
            {secret}
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <strong>Update env berikut lalu restart API:</strong>
            <pre className="mt-2 whitespace-pre-wrap break-all font-mono">
              REGISTRAR_WEBHOOK_SECRET={secret}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copy} className="gap-2">
            {copied ? (
              <>
                <Check className="size-4" />
                Disalin
              </>
            ) : (
              <>
                <Copy className="size-4" />
                Salin
              </>
            )}
          </Button>
          <Button onClick={onClose} disabled={!copied}>
            Sudah saya salin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
