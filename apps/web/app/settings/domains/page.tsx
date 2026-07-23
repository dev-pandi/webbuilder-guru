"use client";

// "Domain Saya" — list semua purchase user (register + renew, semua status).
// Grouped by status supaya user mudah lihat apa yang butuh action.
//
// Aksi utama:
//   - Active register: tombol "Perpanjang" → dialog pilih years + payment
//   - Pending: link ke /sites/pending/<job_id> untuk lanjut checkout/upload
//   - Failed: link ke pending page untuk lihat detail + retry
//
// Cross-scope defence: endpoint /purchases sudah scoped by user; page ini
// hanya render apa yang backend kirim.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe2,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Purchase = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  reason?: string;
  payment_url?: string;
  expires_at?: string;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "success" }> = {
  active: { label: "Aktif", variant: "success" as const },
  pending_payment: { label: "Menunggu bayar", variant: "secondary" as const },
  pending_document: { label: "Menunggu dokumen", variant: "secondary" as const },
  pending_provisioning: { label: "Diproses registrar", variant: "secondary" as const },
  failed: { label: "Gagal", variant: "destructive" as const },
  expired: { label: "Kadaluwarsa", variant: "destructive" as const },
};

export default function DomainsSettingsPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [renewTarget, setRenewTarget] = useState<Purchase | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api<Purchase[]>("/api/v1/domains/purchases?limit=100");
      setPurchases(list ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Sinkronkan tarik ground truth dari registrar → update local cache.
  // Setelah sukses, refresh() supaya UI reflect status baru (expires_at, dsb.).
  async function onSync() {
    setSyncing(true);
    try {
      const res = await api<{ scanned: number; updated: number }>(
        "/api/v1/domains/sync",
        { method: "POST" },
      );
      if (res.updated > 0) {
        toast.success(`${res.updated} domain diperbarui dari registrar`);
      } else {
        toast.success(`Semua ${res.scanned} domain sudah sinkron`);
      }
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Group by status: active dulu (dedupe per domain — kalau ada register +
  // renew keduanya active, tampilkan satu row dengan expires_at terbaru),
  // lalu pending (hanya truly pending — active renew sudah selesai, masuk ke
  // aktif via dedupe), lalu terminal (failed/expired).
  const grouped = useMemo(() => {
    const active = latestActivePerDomain(purchases);
    const pending = purchases.filter((p) => p.status.startsWith("pending_"));
    const terminal = purchases.filter((p) => p.status === "failed" || p.status === "expired");
    return { active, pending, terminal };
  }, [purchases]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domain Saya</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Semua domain yang Anda beli, lengkap dengan status registrasi dan tanggal expire.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSync}
            disabled={syncing || loading}
            className="gap-2"
            title="Ambil status terbaru langsung dari registrar (fix drift)"
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Sinkronkan
          </Button>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="gap-2">
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
            Refresh
          </Button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {loading && purchases.length === 0 ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : purchases.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Globe2 className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Belum ada domain. Beli domain pertama Anda untuk mulai.
            </p>
            <Button asChild className="mt-4 gap-2">
              <Link href="/sites/new-with-domain">
                <Globe2 className="size-4" />
                Beli Domain
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {grouped.active.length > 0 && (
            <Section title="Aktif" count={grouped.active.length} icon={CheckCircle2} iconClass="text-emerald-500">
              {grouped.active.map((p) => (
                <ActiveRow key={p.job_id} p={p} onRenew={() => setRenewTarget(p)} />
              ))}
            </Section>
          )}
          {grouped.pending.length > 0 && (
            <Section title="Sedang diproses" count={grouped.pending.length} icon={Clock} iconClass="text-amber-500">
              {grouped.pending.map((p) => (
                <PendingRow key={p.job_id} p={p} />
              ))}
            </Section>
          )}
          {grouped.terminal.length > 0 && (
            <Section title="Gagal / kadaluwarsa" count={grouped.terminal.length} icon={XCircle} iconClass="text-destructive">
              {grouped.terminal.map((p) => (
                <TerminalRow key={p.job_id} p={p} />
              ))}
            </Section>
          )}
        </>
      )}

      {renewTarget && (
        <RenewDialog
          domain={renewTarget.domain}
          onClose={() => setRenewTarget(null)}
          onCreated={(jobID) => {
            setRenewTarget(null);
            toast.success("Job perpanjangan dibuat");
            router.push(`/sites/pending/${jobID}`);
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  count,
  icon: Icon,
  iconClass,
  children,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className={"size-4 " + (iconClass ?? "")} />
          {title}
          <Badge variant="secondary" className="ml-auto text-xs">
            {count}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">{children}</ul>
      </CardContent>
    </Card>
  );
}

function ActiveRow({ p, onRenew }: { p: Purchase; onRenew: () => void }) {
  const expiryInfo = useMemo(() => formatExpiry(p.expires_at), [p.expires_at]);
  const detailHref = `/settings/domains/${encodeURIComponent(p.domain)}`;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Globe2 className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={detailHref}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            <code>{p.domain}</code>
          </Link>
          <Badge variant="success" className="text-xs">
            Aktif
          </Badge>
        </div>
        {expiryInfo && (
          <div className={`mt-0.5 text-xs ${expiryInfo.urgent ? "text-destructive" : "text-muted-foreground"}`}>
            Expire: {expiryInfo.label}
          </div>
        )}
      </div>
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href={detailHref}>
          Kelola
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={onRenew} className="gap-1.5">
        <RefreshCw className="size-3.5" />
        Perpanjang
      </Button>
    </li>
  );
}

function PendingRow({ p }: { p: Purchase }) {
  const info = STATUS_LABEL[p.status] ?? { label: p.status, variant: "secondary" as const };
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Loader2 className="size-4 shrink-0 animate-spin text-amber-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="text-sm font-medium">{p.domain}</code>
          <Badge variant={info.variant} className="text-xs">
            {info.label}
          </Badge>
          {p.kind === "renew" && (
            <Badge variant="secondary" className="text-xs">
              Renew
            </Badge>
          )}
        </div>
      </div>
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href={`/sites/pending/${p.job_id}`}>
          Lanjut
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </li>
  );
}

function TerminalRow({ p }: { p: Purchase }) {
  const info = STATUS_LABEL[p.status] ?? { label: p.status, variant: "destructive" as const };
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <XCircle className="size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="text-sm font-medium">{p.domain}</code>
          <Badge variant={info.variant} className="text-xs">
            {info.label}
          </Badge>
        </div>
        {p.reason && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {p.reason}
          </div>
        )}
      </div>
      {p.status === "failed" && (
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href={`/sites/pending/${p.job_id}`}>
            Lihat & retry
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      )}
    </li>
  );
}

// -------------- Renew dialog --------------

function RenewDialog({
  domain,
  onClose,
  onCreated,
}: {
  domain: string;
  onClose: () => void;
  onCreated: (jobID: string) => void;
}) {
  const [years, setYears] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"midtrans" | "paylabs">("midtrans");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Idempotency key per dialog open — cegah double-click bikin 2 renew job.
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    [],
  );

  async function onSubmit() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await api<{ job_id: string }>("/api/v1/domains/renew", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          domain,
          years,
          payment_method: paymentMethod,
          return_url: `${window.location.origin}/checkout/return`,
        }),
      });
      onCreated(res.job_id);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Perpanjang <code className="text-sm">{domain}</code></DialogTitle>
          <DialogDescription>
            Pilih durasi perpanjangan dan metode pembayaran. Anda akan diarahkan
            ke halaman pembayaran gateway setelah konfirmasi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="renew-years">Lama perpanjangan</Label>
            <select
              id="renew-years"
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {[1, 2, 3, 5, 10].map((y) => (
                <option key={y} value={y}>
                  {y} tahun
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="renew-payment">Metode pembayaran</Label>
            <select
              id="renew-payment"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "midtrans" | "paylabs")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="midtrans">Midtrans (kartu / VA / e-wallet)</option>
              <option value="paylabs">Paylabs</option>
            </select>
          </div>

          {err && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={submitting} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Memproses…
              </>
            ) : (
              <>
                Perpanjang & bayar
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Unused prop suppression untuk Input/Card import ceremony (defensive).
void Input;

// -------------- helpers --------------

// latestActivePerDomain — dedupe active purchases by domain, ambil expires_at
// paling akhir. Sinkron dengan dashboard + backend notifier (DISTINCT ON per
// domain). Menghindari 1 domain muncul 2x (register + renew) di UI.
function latestActivePerDomain(items: Purchase[]): Purchase[] {
  const byDomain = new Map<string, Purchase>();
  for (const p of items) {
    if (p.status !== "active") continue;
    const cur = byDomain.get(p.domain);
    if (!cur) {
      byDomain.set(p.domain, p);
      continue;
    }
    const curTs = cur.expires_at ? new Date(cur.expires_at).getTime() : 0;
    const newTs = p.expires_at ? new Date(p.expires_at).getTime() : 0;
    if (newTs > curTs) byDomain.set(p.domain, p);
  }
  return Array.from(byDomain.values());
}

function formatExpiry(iso?: string): { label: string; urgent: boolean } | null {
  if (!iso) return null;
  try {
    const dt = new Date(iso);
    const now = new Date();
    const days = Math.round((dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const label = dt.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    if (days <= 0) return { label: `${label} (sudah expire)`, urgent: true };
    if (days <= 30) return { label: `${label} (${days} hari lagi)`, urgent: true };
    return { label: `${label} (${days} hari lagi)`, urgent: false };
  } catch {
    return { label: iso, urgent: false };
  }
}
