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
  Sparkles,
  User,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RenewDialog } from "@/components/domains/RenewDialog";

type Purchase = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  reason?: string;
  payment_url?: string;
  expires_at?: string;
  // site_id di-set kalau register purchase sudah di-attach ke sites row
  // (via template picker di /sites/pending/[job_id]). Kalau nil untuk
  // register aktif → user belum pilih template.
  site_id?: string;
  // client_* diisi kalau endpoint = /agent/purchases atau /reseller/purchases
  // (on-behalf-of view). Untuk /settings/domains (self-purchase), nil.
  client_id?: string;
  client_name?: string;
  client_email?: string;
  // contact_id + registered_at + last_renewed_at di-populate dari tabel
  // domains (aggregate view), bukan dari purchases table. Bantu tampilkan
  // detail domain tanpa second fetch.
  contact_id?: string;
  registered_at?: string;
  last_renewed_at?: string;
};

// Shape dari /api/v1/domains (aggregate current-state per FQDN).
type DomainRow = {
  name: string;
  status: string;
  expires_at?: string;
  contact_id?: string;
  registered_at?: string;
  last_renewed_at?: string;
  site_id?: string;
  registrar_job_id?: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
};

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "success" }> = {
  active: { label: "Aktif", variant: "success" as const },
  pending_payment: { label: "Menunggu bayar", variant: "secondary" as const },
  pending_document: { label: "Menunggu dokumen", variant: "secondary" as const },
  pending_provisioning: { label: "Diproses registrar", variant: "secondary" as const },
  failed: { label: "Gagal", variant: "destructive" as const },
  expired: { label: "Kadaluwarsa", variant: "destructive" as const },
  // Cancelled = user batalkan checkout sebelum bayar (mis. close payment
  // gateway tab, atau job di-cancel via admin). Terminal — no action needed.
  cancelled: { label: "Dibatalkan", variant: "secondary" as const },
};

// DomainsList — shared component untuk halaman daftar domain user.
//
// Data source:
//   - Aktif → /api/v1/domains (tabel `domains` aggregate current-state,
//     1 row per FQDN, contact_id + expires_at akurat dari EPP)
//   - Pending / Failed / Expired → `endpoint` (default /purchases,
//     transaction log — pending job hidup di sini, belum sampai `domains`)
//
// `basePath` mengatur URL detail page. `endpoint` untuk purchases (pending
// section), `domainsEndpoint` untuk aggregate (active section) — keduanya
// bisa di-override di reseller/agent portal untuk team scope.
export function DomainsList({
  basePath = "/settings/domains",
  endpoint = "/api/v1/domains/purchases?limit=100",
  domainsEndpoint = "/api/v1/domains",
}: {
  basePath?: string;
  endpoint?: string;
  domainsEndpoint?: string;
}) {
  const router = useRouter();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [renewTarget, setRenewTarget] = useState<Purchase | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const [ds, ps] = await Promise.allSettled([
        api<DomainRow[]>(domainsEndpoint),
        api<Purchase[]>(endpoint),
      ]);
      if (ds.status === "fulfilled") setDomains(ds.value ?? []);
      if (ps.status === "fulfilled") setPurchases(ps.value ?? []);
      // Only bubble error kalau BOTH fail — kalau salah satu jalan, page
      // masih usable.
      if (ds.status === "rejected" && ps.status === "rejected") {
        setErr((ds.reason as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, domainsEndpoint]);

  // Group data:
  //   - active: dari tabel `domains` (no dedupe needed — UNIQUE by name)
  //   - pending / failed: dari `/purchases` (transaction log)
  //
  // Split pending: register-kind = domain BARU yang belum bisa dipakai
  // (blocking). Renew-kind = perpanjangan domain existing (non-blocking,
  // domain tetap aktif selama proses). Split supaya user tidak panik
  // lihat "sedang diproses" mengira domain-nya offline.
  const grouped = useMemo(() => {
    const active: Purchase[] = domains.map(domainToPurchase);
    const pendingNew = purchases.filter(
      (p) => p.status.startsWith("pending_") && p.kind !== "renew",
    );
    const pendingRenew = purchases.filter(
      (p) => p.status.startsWith("pending_") && p.kind === "renew",
    );
    const terminal = purchases.filter((p) => p.status === "failed" || p.status === "expired");
    const renewingDomains = new Set(pendingRenew.map((p) => p.domain));
    return { active, pendingNew, pendingRenew, renewingDomains, terminal };
  }, [domains, purchases]);

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
                <ActiveRow
                  key={p.job_id}
                  p={p}
                  basePath={basePath}
                  isRenewing={grouped.renewingDomains.has(p.domain)}
                  onRenew={() => setRenewTarget(p)}
                />
              ))}
            </Section>
          )}
          {grouped.pendingNew.length > 0 && (
            <Section title="Domain baru sedang diproses" count={grouped.pendingNew.length} icon={Clock} iconClass="text-amber-500">
              {grouped.pendingNew.map((p) => (
                <PendingRow key={p.job_id} p={p} />
              ))}
            </Section>
          )}
          {grouped.pendingRenew.length > 0 && (
            <Section
              title="Perpanjangan berjalan"
              count={grouped.pendingRenew.length}
              icon={RefreshCw}
              iconClass="text-blue-500"
              subtitle="Domain-domain di bawah tetap AKTIF selama proses perpanjangan"
            >
              {grouped.pendingRenew.map((p) => (
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
  subtitle,
  children,
}: {
  title: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  subtitle?: string;
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
        {subtitle && (
          <p className="pt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y">{children}</ul>
      </CardContent>
    </Card>
  );
}

function ActiveRow({
  p,
  basePath,
  isRenewing,
  onRenew,
}: {
  p: Purchase;
  basePath: string;
  isRenewing?: boolean;
  onRenew: () => void;
}) {
  const expiryInfo = useMemo(() => formatExpiry(p.expires_at), [p.expires_at]);
  const detailHref = `${basePath}/${encodeURIComponent(p.domain)}`;
  // Register active tanpa site_id → user belum pilih template. Tampilkan
  // CTA supaya mereka lanjut ke template picker di /sites/pending/[job_id]
  // (yang sudah handle "active + no site" branch dengan TemplatePicker).
  const needsTemplate = p.kind === "register" && !p.site_id;
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Globe2 className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={detailHref}
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            <code>{p.domain}</code>
          </Link>
          <Badge variant="success" className="text-xs">
            Aktif
          </Badge>
          {needsTemplate && (
            <Badge variant="warning" className="gap-1 text-[10px]">
              <Sparkles className="size-2.5" />
              Belum ada situs
            </Badge>
          )}
          {isRenewing && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Loader2 className="size-2.5 animate-spin" />
              Sedang diperpanjang
            </Badge>
          )}
        </div>
        <RowMeta owner={ownerLabel(p)} expiry={expiryInfo} />
      </div>
      {needsTemplate && (
        <Button asChild size="sm" className="gap-1.5">
          <Link href={`/sites/pending/${p.job_id}`}>
            <Sparkles className="size-3.5" />
            Pilih template
          </Link>
        </Button>
      )}
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href={detailHref}>
          Kelola
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
      {/* Tombol Perpanjang di-disable kalau ada renew job pending — cegah
          user click 2x bikin invoice ganda. Kalau perpanjangan gagal, tombol
          otomatis aktif lagi (baris hilang dari pendingRenew). */}
      <Button
        variant="outline"
        size="sm"
        onClick={onRenew}
        disabled={isRenewing}
        className="gap-1.5"
        title={isRenewing ? "Perpanjangan sedang berjalan" : "Perpanjang domain"}
      >
        <RefreshCw className="size-3.5" />
        Perpanjang
      </Button>
    </li>
  );
}

// ownerLabel — kalau backend kirim client info (on-behalf-of view), return
// display name/email. Nil kalau self-purchase → RowMeta skip render owner.
function ownerLabel(p: Purchase): string | null {
  if (!p.client_id && !p.client_email && !p.client_name) return null;
  return p.client_name || p.client_email || null;
}

// RowMeta — 2 line info (owner + expiry) di bawah nama domain. Skip line
// kosong supaya row tetap compact.
function RowMeta({
  owner,
  expiry,
}: {
  owner: string | null;
  expiry: { label: string; urgent: boolean } | null;
}) {
  if (!owner && !expiry) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      {owner && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <User className="size-3" />
          <span>Milik {owner}</span>
        </span>
      )}
      {expiry && (
        <span
          className={
            "inline-flex items-center gap-1 " +
            (expiry.urgent ? "text-destructive" : "text-muted-foreground")
          }
        >
          <CalendarClock className="size-3" />
          <span>Expire: {expiry.label}</span>
        </span>
      )}
    </div>
  );
}

function PendingRow({ p }: { p: Purchase }) {
  const info = STATUS_LABEL[p.status] ?? { label: p.status, variant: "secondary" as const };
  const owner = ownerLabel(p);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Loader2 className="size-4 shrink-0 animate-spin text-amber-500" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
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
        <RowMeta owner={owner} expiry={null} />
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
  const owner = ownerLabel(p);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <XCircle className="size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-sm font-medium">{p.domain}</code>
          <Badge variant={info.variant} className="text-xs">
            {info.label}
          </Badge>
        </div>
        <RowMeta owner={owner} expiry={null} />
        {p.reason && (
          <div className="truncate text-xs text-muted-foreground">
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

// -------------- helpers --------------

// domainToPurchase — convert DomainRow (aggregate view) ke Purchase shape
// supaya ActiveRow tetap re-usable. `job_id` = registrar_job_id canonical
// (untuk deep-link ke /sites/pending/[id] atau detail view). kind="register"
// hard-coded karena domains table hanya berisi active register (renew hanya
// extend row existing, tidak buat entry baru).
function domainToPurchase(d: DomainRow): Purchase {
  return {
    job_id: d.registrar_job_id ?? "",
    domain: d.name,
    status: d.status,
    kind: "register",
    expires_at: d.expires_at,
    site_id: d.site_id,
    contact_id: d.contact_id,
    registered_at: d.registered_at,
    last_renewed_at: d.last_renewed_at,
    client_id: d.client_id,
    client_name: d.client_name,
    client_email: d.client_email,
  };
}

// latestActivePerDomain — dedupe active purchases by domain, ambil expires_at
// paling akhir. Sinkron dengan dashboard + backend notifier (DISTINCT ON per
// domain). Menghindari 1 domain muncul 2x (register + renew) di UI.
// DEPRECATED: sejak tabel `domains` aggregate ada, active section langsung
// dari sana. Helper tetap ada untuk backward-compat (dipakai dashboard).
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
