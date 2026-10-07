"use client";

// Admin — kelola DNS provider (Cloudflare + DNSCloud) dengan priority order.
// Prioritas rendah = dipakai lebih dulu saat BYO/purchase flow pick default.
// User tetap bisa override per situs via dropdown di modal connect / wizard.
//
// Catatan: api_token TIDAK pernah di-return oleh backend (read-once pada
// create). Admin yang perlu rotate harus bikin config baru + hapus yang lama.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Loader2,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type Kind = "cloudflare" | "dnscloud";

type Config = {
  id: string;
  kind: Kind;
  name: string;
  account_id: string;
  is_default: boolean;
  is_active: boolean;
  priority: number;
  zone_quota: number;
  zones_count: number;
  last_health_at?: string;
  last_health_ok?: boolean;
  created_at: string;
  updated_at: string;
};

const KIND_LABEL: Record<Kind, string> = {
  cloudflare: "Cloudflare",
  dnscloud: "DNSCloud.ID",
};

export default function DNSProvidersPage() {
  const [list, setList] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Config | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Config | null>(null);
  const [busyID, setBusyID] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const items = await api<Config[]>("/api/v1/admin/dns-providers/");
      setList(items ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function test(c: Config) {
    setBusyID(c.id);
    try {
      const r = await api<{ ok: boolean; message?: string; latency?: string }>(
        `/api/v1/admin/dns-providers/${c.id}/test`,
        { method: "POST" },
      );
      if (r.ok) toast.success(`${c.name}: ${r.message ?? "OK"} (${r.latency})`);
      else toast.error(`${c.name}: ${r.message ?? "Gagal"}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyID(null);
    }
  }

  async function setDefault(c: Config) {
    try {
      await api(`/api/v1/admin/dns-providers/${c.id}/default`, { method: "POST" });
      toast.success(`${c.name} dijadikan default ${KIND_LABEL[c.kind]}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleActive(c: Config) {
    try {
      await api(`/api/v1/admin/dns-providers/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !c.is_active }),
      });
      toast.success(`${c.name} ${!c.is_active ? "diaktifkan" : "dinonaktifkan"}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/v1/admin/dns-providers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success(`${deleteTarget.name} dihapus`);
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function changePriority(c: Config, delta: number) {
    const newPri = Math.max(1, c.priority + delta);
    try {
      await api("/api/v1/admin/dns-providers/reorder", {
        method: "POST",
        body: JSON.stringify({ items: [{ id: c.id, priority: newPri }] }),
      });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });
  }, [list]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">DNS Provider</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Kelola backend DNS (Cloudflare + DNSCloud). Prioritas rendah = dipakai
            lebih dulu saat user tidak pilih spesifik.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Tambah Provider
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat…
          </CardContent>
        </Card>
      ) : err ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0 translate-y-0.5" />
            <span>{err}</span>
          </CardContent>
        </Card>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="rounded-full bg-muted p-4">
              <Cloud className="size-8 text-muted-foreground" />
            </div>
            <p className="font-medium">Belum ada DNS provider</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Tambah akun Cloudflare atau DNSCloud supaya BYO + purchase flow bisa
              auto-attach domain baru.
            </p>
            <Button onClick={() => setCreateOpen(true)} className="mt-2 gap-1.5">
              <Plus className="size-4" />
              Tambah Provider Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <ProviderCard
              key={c.id}
              cfg={c}
              busy={busyID === c.id}
              onTest={() => test(c)}
              onSetDefault={() => setDefault(c)}
              onToggleActive={() => toggleActive(c)}
              onEdit={() => setEditTarget(c)}
              onDelete={() => setDeleteTarget(c)}
              onPrioUp={() => changePriority(c, -10)}
              onPrioDown={() => changePriority(c, +10)}
            />
          ))}
        </div>
      )}

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onDone={async () => {
          setCreateOpen(false);
          await refresh();
        }}
      />
      <EditDialog
        cfg={editTarget}
        onClose={() => setEditTarget(null)}
        onDone={async () => {
          setEditTarget(null);
          await refresh();
        }}
      />
      <DeleteDialog
        cfg={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={doDelete}
      />
    </div>
  );
}

// ---------------- Provider card ----------------

function ProviderCard({
  cfg,
  busy,
  onTest,
  onSetDefault,
  onToggleActive,
  onEdit,
  onDelete,
  onPrioUp,
  onPrioDown,
}: {
  cfg: Config;
  busy: boolean;
  onTest: () => void;
  onSetDefault: () => void;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPrioUp: () => void;
  onPrioDown: () => void;
}) {
  const quotaWarn =
    cfg.zone_quota > 0 && cfg.zones_count / cfg.zone_quota >= 0.85;
  return (
    <Card className={cn(!cfg.is_active && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-base font-bold">{cfg.name}</code>
              <Badge variant="secondary">{KIND_LABEL[cfg.kind]}</Badge>
              {cfg.is_default && (
                <Badge variant="default" className="gap-1">
                  <Star className="size-3 fill-current" />
                  Default
                </Badge>
              )}
              {!cfg.is_active && <Badge variant="secondary">Nonaktif</Badge>}
              {cfg.last_health_ok === true && (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="size-3" />
                  Health OK
                </Badge>
              )}
              {cfg.last_health_ok === false && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="size-3" />
                  Health Fail
                </Badge>
              )}
            </div>
            {cfg.account_id && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                Account: {cfg.account_id}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex items-center gap-1 rounded-md border px-1.5 py-1">
              <button
                type="button"
                onClick={onPrioUp}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Naikkan prioritas (angka turun)"
              >
                ↑
              </button>
              <span className="min-w-[2em] text-center font-mono text-xs">
                {cfg.priority}
              </span>
              <button
                type="button"
                onClick={onPrioDown}
                className="text-xs text-muted-foreground hover:text-foreground"
                title="Turunkan prioritas (angka naik)"
              >
                ↓
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span>
            Zone: <strong>{cfg.zones_count}</strong>
            {cfg.zone_quota > 0 && <> / {cfg.zone_quota}</>}
          </span>
          {quotaWarn && (
            <Badge variant="warning" className="gap-1 text-xs">
              <AlertTriangle className="size-3" />
              Mendekati quota
            </Badge>
          )}
          {cfg.last_health_at && (
            <span>
              Health check:{" "}
              {new Date(cfg.last_health_at).toLocaleString("id-ID")}
            </span>
          )}
        </div>
        <Separator />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onTest} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Test koneksi
          </Button>
          {!cfg.is_default && cfg.is_active && (
            <Button size="sm" variant="outline" onClick={onSetDefault} className="gap-1.5">
              <Star className="size-3.5" />
              Jadikan default {KIND_LABEL[cfg.kind]}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onToggleActive}>
            {cfg.is_active ? "Nonaktifkan" : "Aktifkan"}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onDelete}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Hapus
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Create dialog ----------------

function CreateDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState<Kind>("cloudflare");
  const [name, setName] = useState("");
  const [apiToken, setAPIToken] = useState("");
  const [accountID, setAccountID] = useState("");
  const [priority, setPriority] = useState(100);
  const [zoneQuota, setZoneQuota] = useState(0);
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setKind("cloudflare");
      setName("");
      setAPIToken("");
      setAccountID("");
      setPriority(100);
      setZoneQuota(0);
      setIsDefault(false);
      setIsActive(true);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await api("/api/v1/admin/dns-providers/", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: name.trim(),
          api_token: apiToken.trim(),
          account_id: accountID.trim(),
          is_default: isDefault,
          is_active: isActive,
          priority,
          zone_quota: zoneQuota,
        }),
      });
      toast.success("Provider dibuat");
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tambah DNS Provider</DialogTitle>
          <DialogDescription>
            API token hanya di-input sekali — kami simpan hash, tidak bisa
            ditampilkan lagi. Rotate = hapus + buat baru.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKind("cloudflare")}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm",
                  kind === "cloudflare"
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:bg-muted/50",
                )}
              >
                Cloudflare
              </button>
              <button
                type="button"
                onClick={() => setKind("dnscloud")}
                className={cn(
                  "flex-1 rounded-md border px-3 py-2 text-sm",
                  kind === "dnscloud"
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:bg-muted/50",
                )}
              >
                DNSCloud.ID
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-name">Nama</Label>
            <Input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="CF Account Prod" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-token">API Token</Label>
            <Input
              id="dp-token"
              type="password"
              value={apiToken}
              onChange={(e) => setAPIToken(e.target.value)}
              placeholder={kind === "cloudflare" ? "CF API token" : "dcid_..."}
              autoComplete="off"
            />
          </div>
          {kind === "cloudflare" && (
            <div className="space-y-1.5">
              <Label htmlFor="dp-account">Account ID</Label>
              <Input id="dp-account" value={accountID} onChange={(e) => setAccountID(e.target.value)} placeholder="Cloudflare account UUID" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-priority">Prioritas</Label>
              <Input
                id="dp-priority"
                type="number"
                min={1}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 100)}
              />
              <p className="text-xs text-muted-foreground">Rendah = dipakai dulu</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-quota">Zone Quota</Label>
              <Input
                id="dp-quota"
                type="number"
                min={0}
                value={zoneQuota}
                onChange={(e) => setZoneQuota(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">0 = unlimited</p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Aktifkan sekarang
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              Jadikan default {KIND_LABEL[kind]}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={!name || !apiToken || busy || (kind === "cloudflare" && !accountID)}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Buat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Edit dialog ----------------

function EditDialog({
  cfg,
  onClose,
  onDone,
}: {
  cfg: Config | null;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [apiToken, setAPIToken] = useState("");
  const [accountID, setAccountID] = useState("");
  const [priority, setPriority] = useState(100);
  const [zoneQuota, setZoneQuota] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cfg) {
      setName(cfg.name);
      setAPIToken("");
      setAccountID(cfg.account_id);
      setPriority(cfg.priority);
      setZoneQuota(cfg.zone_quota);
      setBusy(false);
    }
  }, [cfg]);

  if (!cfg) return null;

  async function submit() {
    if (!cfg) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name,
        account_id: accountID,
        priority,
        zone_quota: zoneQuota,
      };
      if (apiToken.trim()) body.api_token = apiToken.trim();
      await api(`/api/v1/admin/dns-providers/${cfg.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("Provider diupdate");
      await onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!cfg} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {cfg.name}</DialogTitle>
          <DialogDescription>
            Kosongkan API token untuk tidak mengubah. Mengisinya = replace token lama.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edp-name">Nama</Label>
            <Input id="edp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edp-token">API Token baru (opsional)</Label>
            <Input
              id="edp-token"
              type="password"
              value={apiToken}
              onChange={(e) => setAPIToken(e.target.value)}
              placeholder="Kosong = tidak diubah"
              autoComplete="off"
            />
          </div>
          {cfg.kind === "cloudflare" && (
            <div className="space-y-1.5">
              <Label htmlFor="edp-account">Account ID</Label>
              <Input id="edp-account" value={accountID} onChange={(e) => setAccountID(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edp-priority">Prioritas</Label>
              <Input id="edp-priority" type="number" min={1} value={priority} onChange={(e) => setPriority(Number(e.target.value) || 100)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edp-quota">Zone Quota</Label>
              <Input id="edp-quota" type="number" min={0} value={zoneQuota} onChange={(e) => setZoneQuota(Number(e.target.value) || 0)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Delete confirm ----------------

function DeleteDialog({
  cfg,
  onCancel,
  onConfirm,
}: {
  cfg: Config | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!cfg} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Hapus {cfg?.name}?
          </DialogTitle>
          <DialogDescription>
            Hanya bisa dihapus kalau tidak ada zone aktif yang menggunakan.
            Kalau masih dipakai, nonaktifkan dulu dan tunggu sampai semua zone
            dilepas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Batal</Button>
          <Button variant="destructive" onClick={onConfirm}>
            Ya, hapus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
