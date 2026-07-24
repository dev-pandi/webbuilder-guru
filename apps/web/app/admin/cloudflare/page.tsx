"use client";

// Admin — kelola konfigurasi Cloudflare untuk auto-attach domain baru.
// Alur end-user setelah admin setup:
//   1. User beli domain via wizard → webhook status=active fire ke web builder
//   2. Web builder pick config CF default → create zone → get NS assignment
//   3. NS di-push ke registrar via UpdateNameservers
//   4. Domain langsung online + di-CDN + di-SSL via Cloudflare
//
// Kalau admin tidak setup config di sini, auto-attach di-skip (domain tetap
// live tapi pakai NS default registrar — no CDN benefit).

import { useEffect, useState } from "react";
import {
  Cloud,
  Plus,
  RefreshCw,
  Trash2,
  Star,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
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

type CFConfig = {
  id: string;
  name: string;
  api_token_masked: string;
  account_id: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminCloudflarePage() {
  const [items, setItems] = useState<CFConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const list = await api<CFConfig[]>("/api/v1/admin/cloudflare");
      setItems(list ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSetDefault(id: string) {
    try {
      await api(`/api/v1/admin/cloudflare/${id}/default`, { method: "POST" });
      toast.success("Config di-set sebagai default");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onDelete(cfg: CFConfig) {
    if (!confirm(`Hapus config "${cfg.name}"? Domain baru tidak akan auto-attach ke Cloudflare kalau tidak ada config default lain.`)) {
      return;
    }
    try {
      await api(`/api/v1/admin/cloudflare/${cfg.id}`, { method: "DELETE" });
      toast.success("Config dihapus");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onVerify(id: string) {
    try {
      await api(`/api/v1/admin/cloudflare/${id}/verify`, { method: "POST" });
      toast.success("Token valid & bisa akses Cloudflare API");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const hasDefault = items.some((it) => it.is_default);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Cloud className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              DNS &amp; CDN Integration
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Cloudflare</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Domain baru yang aktif akan otomatis di-daftarkan ke akun
            Cloudflare default → dapat CDN + SSL + fast routing tanpa manual
            setup dari user.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-3.5" />
            Tambah
          </Button>
        </div>
      </div>

      {!hasDefault && items.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Tidak ada config default. Auto-attach ke Cloudflare akan di-skip
            sampai salah satu config di-mark default (klik <Star className="inline size-3" />).
          </span>
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Config aktif</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat…
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 py-10 text-center">
              <Cloud className="size-8 text-muted-foreground/60" />
              <div>
                <p className="text-sm font-medium">Belum ada config Cloudflare</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tambah 1 config supaya domain baru auto-attach ke CF.
                </p>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)} className="mt-2 gap-2">
                <Plus className="size-3.5" />
                Tambah pertama
              </Button>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((cfg) => (
                <ConfigRow
                  key={cfg.id}
                  cfg={cfg}
                  onSetDefault={() => onSetDefault(cfg.id)}
                  onVerify={() => onVerify(cfg.id)}
                  onDelete={() => onDelete(cfg)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="size-4 text-muted-foreground" />
            Cara pakai
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>
              Buat API token di Cloudflare dashboard: <em>My Profile → API Tokens → Create Token</em>.
              Template <strong>Edit zone DNS</strong> atau custom dengan permission{" "}
              <code>Zone: Zone: Edit</code> + <code>Zone: DNS: Edit</code>.
            </li>
            <li>
              Copy <strong>Account ID</strong> dari sidebar kanan di Cloudflare dashboard
              (ada di sebelah kanan halaman zone).
            </li>
            <li>Klik <strong>Tambah</strong> di atas → paste token + account ID → verify + save.</li>
            <li>
              Mark satu config sebagai <strong>default</strong> (
              <Star className="inline size-3" />) — hanya 1 config aktif untuk auto-attach.
            </li>
          </ol>
        </CardContent>
      </Card>

      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

function ConfigRow({
  cfg,
  onSetDefault,
  onVerify,
  onDelete,
}: {
  cfg: CFConfig;
  onSetDefault: () => void;
  onVerify: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Cloud className="size-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{cfg.name}</span>
          {cfg.is_default && (
            <Badge variant="success" className="gap-1 text-[10px]">
              <Star className="size-2.5" />
              Default
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span>
            Account: <code className="font-mono">{cfg.account_id}</code>
          </span>
          <span>
            Token: <code className="font-mono">{cfg.api_token_masked}</code>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onVerify}
          className="gap-1.5"
          title="Test koneksi ke Cloudflare API"
        >
          <ShieldCheck className="size-3.5" />
          <span className="hidden sm:inline">Verify</span>
        </Button>
        {!cfg.is_default && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSetDefault}
            className="gap-1.5"
            title="Set sebagai default"
          >
            <Star className="size-3.5" />
            <span className="hidden sm:inline">Set default</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function CreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [verify, setVerify] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !apiToken.trim() || !accountId.trim()) {
      setErr("Nama, API token, dan Account ID wajib");
      return;
    }
    setSubmitting(true);
    try {
      await api("/api/v1/admin/cloudflare", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          api_token: apiToken.trim(),
          account_id: accountId.trim(),
          is_default: isDefault,
          verify,
        }),
      });
      toast.success("Config Cloudflare tersimpan");
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Cloudflare Config</DialogTitle>
          <DialogDescription>
            API token disimpan plain text di DB (akses restricted admin only).
            Token bisa di-rotate kapan saja via Cloudflare dashboard.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Nama</Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Production account"
              maxLength={128}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-token">API Token</Label>
            <Input
              id="cf-token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="cf_xxxxxxxxxxxxxxxxxxxxx"
              type="password"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Buat di{" "}
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-primary"
              >
                dash.cloudflare.com/profile/api-tokens
              </a>{" "}
              — permission minimal: Zone.Zone Edit + Zone.DNS Edit.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-account">Account ID</Label>
            <Input
              id="cf-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="32-char hex"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Ada di sidebar kanan halaman zone atau workers/pages di dashboard.
            </p>
          </div>
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium">Jadikan default</div>
              <div className="text-[11px] text-muted-foreground">
                Config default dipakai untuk auto-attach domain baru. Hanya 1
                yang bisa aktif — config lain akan otomatis unset.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              checked={verify}
              onChange={(e) => setVerify(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <div className="font-medium">Verify token sebelum save</div>
              <div className="text-[11px] text-muted-foreground">
                Panggil <code>GET /user/tokens/verify</code> di Cloudflare untuk
                pastikan token valid + punya scope minimal.
              </div>
            </div>
          </label>

          {err && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Simpan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
