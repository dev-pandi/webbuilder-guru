"use client";

// Tab Domain: menampilkan satu purchased anchor + opsional satu BYO .id,
// pilih mana yang jadi primary (canonical). Non-primary = 301 redirect ke
// primary. Manajemen lanjutan (WHOIS/NS/DNS/renewal) tetap di
// /settings/domains/[name].
//
// BYO flow: 3-step modal (input → warning NS flip → NS display + verify).
// Verification = NS lookup match assigned CF nameservers. SSL + CDN jalan
// otomatis via CF proxy orange cloud.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DomainRow = {
  id?: string;
  hostname: string;
  source: "purchased" | "byo";
  is_anchor: boolean;
  is_primary: boolean;
  status: string;
  expires_at?: string;
  assigned_ns?: string[];
};

type CheckResponse = {
  hostname: string;
  valid: boolean;
  whois?: {
    exists: boolean;
    expires_at: string;
    registrant_name?: string;
  };
  warnings?: { code: string; message: string }[];
};

type ConnectResponse = {
  domain_id: string;
  hostname: string;
  status: string;
  assigned_ns: string[];
  cloudflare_zone_id: string;
  expires_at?: string;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" }> = {
  active: { label: "Aktif", variant: "success" },
  verified: { label: "Aktif", variant: "success" },
  pending: { label: "Menunggu verifikasi", variant: "secondary" },
  drifting: { label: "Nameserver bermasalah", variant: "warning" },
  suspended: { label: "Suspended", variant: "warning" },
  disconnected: { label: "Terputus", variant: "secondary" },
  expired: { label: "Expired", variant: "destructive" },
};

export default function DomainsPage() {
  const params = useParams<{ id: string }>();
  const siteID = params?.id ?? "";

  const [rows, setRows] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DomainRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await api<DomainRow[]>(`/api/v1/sites/${siteID}/domains-combined`);
      setRows(list ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [siteID]);

  useEffect(() => {
    if (!siteID) return;
    refresh();
  }, [siteID, refresh]);

  const primary = rows.find((r) => r.is_primary);
  const anchor = rows.find((r) => r.source === "purchased");
  const byo = rows.find((r) => r.source === "byo");

  async function setPrimary(hostname: string) {
    try {
      await api(`/api/v1/sites/${siteID}/domains/primary`, {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
      toast.success(`${hostname} sekarang jadi alamat utama`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteBYO() {
    if (!deleteTarget) return;
    try {
      await api(`/api/v1/sites/${siteID}/byo-domain`, { method: "DELETE" });
      toast.success(`${deleteTarget.hostname} dilepas`);
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10">
            <Globe2 className="size-4 text-blue-600" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Domain Situs
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Domain</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Kelola alamat situs Anda. Satu di antaranya menjadi alamat utama;
          yang lain mengarahkan (301) ke sana.
        </p>
      </div>

      {primary && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Alamat utama
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="text-lg font-bold">{primary.hostname}</code>
                <a
                  href={`https://${primary.hostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="size-4" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Memuat…
          </CardContent>
        </Card>
      ) : err ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <DomainRowCard
              key={`${r.source}-${r.hostname}`}
              row={r}
              onSetPrimary={() => setPrimary(r.hostname)}
              onDelete={() => setDeleteTarget(r)}
            />
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-auto justify-start gap-3 p-4 text-left"
          onClick={() => setConnectOpen(true)}
          disabled={!!byo}
          title={byo ? "Situs sudah punya BYO domain" : undefined}
        >
          <Plus className="size-4 shrink-0" />
          <div>
            <p className="font-medium">Hubungkan domain .id milik Anda</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pakai domain .id yang sudah Anda beli di registrar lain.
            </p>
          </div>
        </Button>
        <Button variant="outline" className="h-auto justify-start gap-3 p-4 text-left" asChild>
          <Link href="/sites/new-with-domain">
            <ShoppingBag className="size-4 shrink-0" />
            <div>
              <p className="font-medium">Beli domain baru</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Daftarkan domain baru di platform ini.
              </p>
            </div>
          </Link>
        </Button>
      </div>

      {anchor && (
        <Card className="border-dashed bg-muted/20">
          <CardContent className="flex gap-3 py-4 text-xs text-muted-foreground">
            <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
            <div>
              <p>
                Manajemen lanjutan (nameserver, DNS record, perpanjangan, WHOIS)
                untuk <strong>{anchor.hostname}</strong> ada di{" "}
                <Link
                  href={`/settings/domains/${encodeURIComponent(anchor.hostname)}`}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  Settings › Domain
                </Link>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <ConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        siteID={siteID}
        onDone={async () => {
          setConnectOpen(false);
          await refresh();
        }}
      />
      <DeleteConfirmModal
        row={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={deleteBYO}
      />
    </div>
  );
}

// ---------------- Row card ----------------

function DomainRowCard({
  row,
  onSetPrimary,
  onDelete,
}: {
  row: DomainRow;
  onSetPrimary: () => void;
  onDelete: () => void;
}) {
  const info = STATUS_LABEL[row.status] ?? { label: row.status, variant: "secondary" as const };
  const expiry = formatExpiry(row.expires_at);
  const sourceLabel = row.source === "purchased" ? "Beli di sini" : "Milik Anda";
  const canSetPrimary = !row.is_primary && (row.status === "verified" || row.status === "active");
  const canDelete = row.source === "byo";

  return (
    <Card className={cn(row.is_primary && "border-primary/40")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {row.is_primary && (
                <Star className="size-4 fill-amber-500 text-amber-500" aria-label="Alamat utama" />
              )}
              <code className="text-base font-bold tracking-tight">{row.hostname}</code>
              {(row.status === "verified" || row.status === "active") && (
                <a
                  href={`https://${row.hostname}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant={info.variant} className="text-xs">
                {info.label}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {sourceLabel}
              </Badge>
              {row.is_anchor && (
                <Badge variant="secondary" className="text-xs">
                  Pendaftar
                </Badge>
              )}
              {row.is_primary ? (
                <Badge variant="default" className="text-xs">
                  Utama
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs text-muted-foreground">
                  Mengarahkan ke utama (301)
                </Badge>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Aksi</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSetPrimary && (
                <DropdownMenuItem onClick={onSetPrimary}>
                  <Star className="mr-2 size-4" />
                  Jadikan utama
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  {canSetPrimary && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Lepas domain
                  </DropdownMenuItem>
                </>
              )}
              {!canSetPrimary && !canDelete && (
                <DropdownMenuItem disabled>Tidak ada aksi</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      {expiry && (
        <CardContent className="pt-0">
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border p-2.5 text-xs",
              expiry.urgent
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : expiry.warn
                ? "border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Expired {expiry.label} — {expiry.hint}
            </span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <div className="rounded-full bg-muted p-4">
          <Globe2 className="size-8 text-muted-foreground" />
        </div>
        <p className="font-medium">Belum ada domain untuk situs ini</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Beli domain atau hubungkan domain .id yang sudah Anda miliki.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------- Connect modal (3 steps) ----------------

type Step = "input" | "warning" | "ns" | "done";

function ConnectModal({
  open,
  onClose,
  siteID,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  siteID: string;
  onDone: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("input");
  const [hostname, setHostname] = useState("");
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [connect, setConnect] = useState<ConnectResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);

  // Reset state when modal closes.
  useEffect(() => {
    if (!open) {
      setStep("input");
      setHostname("");
      setCheck(null);
      setConnect(null);
      setError(null);
      setUnderstood(false);
      setBusy(false);
    }
  }, [open]);

  async function runCheck() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<CheckResponse>(`/api/v1/sites/${siteID}/byo-domain/check`, {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
      setCheck(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runConnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<ConnectResponse>(`/api/v1/sites/${siteID}/byo-domain/connect`, {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
      setConnect(res);
      setStep("ns");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runVerify() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/sites/${siteID}/byo-domain/verify`, {
        method: "POST",
        body: JSON.stringify({ hostname }),
      });
      setStep("done");
      toast.success(`${hostname} berhasil diverifikasi`);
      await onDone();
    } catch (e) {
      // ns_mismatch tetap friendly — propagasi DNS bisa lama.
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {step === "input" && (
          <>
            <DialogHeader>
              <DialogTitle>Hubungkan domain .id milik Anda</DialogTitle>
              <DialogDescription>
                Masukkan domain .id yang sudah Anda miliki. Hanya domain utama
                (apex) — tanpa www atau subdomain.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="byo-hostname">Domain</Label>
                <Input
                  id="byo-hostname"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value.trim().toLowerCase())}
                  placeholder="toko.id"
                  autoFocus
                />
              </div>
              {check && check.whois && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    {check.hostname} tersedia untuk dihubungkan
                  </p>
                  {check.whois.registrant_name && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Terdaftar atas nama: {check.whois.registrant_name}
                    </p>
                  )}
                  {check.whois.expires_at && (
                    <p className="text-xs text-muted-foreground">
                      Expired: {new Date(check.whois.expires_at).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </p>
                  )}
                  {(check.warnings ?? []).map((w) => (
                    <p key={w.code} className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      ⚠ {w.message}
                    </p>
                  ))}
                </div>
              )}
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Batal</Button>
              {!check ? (
                <Button onClick={runCheck} disabled={!hostname || busy}>
                  {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Cek domain
                </Button>
              ) : (
                <Button onClick={() => setStep("warning")}>Lanjut</Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === "warning" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-amber-600" />
                Peringatan penting
              </DialogTitle>
              <DialogDescription>
                Baca dulu sebelum lanjut.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                Menghubungkan <strong>{hostname}</strong> akan mengganti
                nameserver domain Anda ke platform ini. Dampaknya:
              </p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>
                  SEMUA DNS record (email/MX, subdomain, verifikasi pihak ketiga)
                  akan BERHENTI berfungsi.
                </li>
                <li>
                  Anda perlu menambahkan ulang record tersebut lewat DNS Editor
                  di dashboard setelah verifikasi.
                </li>
                <li>Pastikan DNSSEC dinonaktifkan di panel registrar Anda dulu.</li>
              </ul>
              <label className="flex items-start gap-2 rounded-md border p-3">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                />
                <span className="text-sm">
                  Saya mengerti risiko dan siap mengatur ulang record saya.
                </span>
              </label>
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("input")}>Kembali</Button>
              <Button onClick={runConnect} disabled={!understood || busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Lanjutkan
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "ns" && connect && (
          <>
            <DialogHeader>
              <DialogTitle>Setup nameserver untuk {hostname}</DialogTitle>
              <DialogDescription>
                Ganti nameserver domain di panel registrar Anda ke dua alamat
                berikut, lalu klik Verifikasi.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                <li>Masuk ke panel registrar tempat Anda membeli {hostname}.</li>
                <li>Buka menu Nameserver / DNS Management.</li>
                <li>Hapus nameserver lama, lalu masukkan dua alamat berikut:</li>
              </ol>
              <div className="space-y-2">
                {connect.assigned_ns.map((ns) => (
                  <div
                    key={ns}
                    className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2.5"
                  >
                    <code className="text-sm">{ns}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        navigator.clipboard.writeText(ns);
                        toast.success("Disalin");
                      }}
                    >
                      <Copy className="size-3.5" />
                      Salin
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Propagasi DNS biasanya &lt; 10 menit, tapi bisa sampai 48 jam.
                Kalau verifikasi gagal, coba lagi beberapa menit kemudian.
              </p>
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Tutup, verifikasi nanti
              </Button>
              <Button onClick={runVerify} disabled={busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Verifikasi
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                Berhasil
              </DialogTitle>
              <DialogDescription>
                {hostname} sudah terhubung. Butuh waktu beberapa menit sebelum
                SSL + CDN aktif sepenuhnya.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={onClose}>Selesai</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Delete confirm ----------------

function DeleteConfirmModal({
  row,
  onCancel,
  onConfirm,
}: {
  row: DomainRow | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-destructive" />
            Lepas {row?.hostname}?
          </DialogTitle>
          <DialogDescription>Baca dulu sebelum konfirmasi.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>{row?.hostname} tidak lagi mengarah ke situs Anda.</li>
            <li>
              Nameserver {row?.hostname} masih menunjuk ke kami. Ganti nameserver
              kembali ke registrar atau provider DNS lain, kalau tidak domain
              Anda akan NXDOMAIN (tidak bisa diakses).
            </li>
            <li>Semua record DNS yang Anda setup di platform ini akan hilang.</li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Batal</Button>
          <Button variant="destructive" onClick={onConfirm}>
            Ya, lepas {row?.hostname}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Helpers ----------------

function formatExpiry(iso?: string): { label: string; hint: string; warn: boolean; urgent: boolean } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((t - Date.now()) / (24 * 60 * 60 * 1000));
  const label = new Date(t).toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });
  let hint = "", warn = false, urgent = false;
  if (days < 0) {
    hint = `${-days} hari lalu`;
    urgent = true;
  } else if (days <= 7) {
    hint = `sisa ${days} hari — segera perpanjang`;
    urgent = true;
  } else if (days <= 30) {
    hint = `sisa ${days} hari`;
    warn = true;
  } else if (days <= 365) {
    hint = `sisa ${days} hari`;
  } else {
    hint = `sisa ~${Math.floor(days / 365)} tahun`;
  }
  return { label, hint, warn, urgent };
}
