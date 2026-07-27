"use client";

// Info panel — tampilkan domain yang ter-attach ke situs ini (dari
// `domain_purchases` yang site_id-nya = params.id). Halaman ini SENGAJA
// tidak punya form add/verify BYO — manajemen domain lengkap (WHOIS,
// nameserver, DNS record, renewal) ada di /settings/domains/[name].
//
// 1 domain = 1 situs, jadi umumnya cuma 1 kartu di sini. Dedupe per-domain
// pakai latestActive helper — kalau ada row register + row renew untuk domain
// sama, ambil yang punya expires_at terbaru (post-renew).

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Purchase = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  reason?: string;
  payment_url?: string;
  expires_at?: string;
  site_id?: string;
};

const STATUS_MAP: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "success"; icon: typeof CheckCircle2 }
> = {
  active: { label: "Aktif", variant: "success", icon: CheckCircle2 },
  pending_payment: { label: "Menunggu bayar", variant: "secondary", icon: Clock },
  pending_document: { label: "Menunggu dokumen", variant: "secondary", icon: Clock },
  pending_provisioning: { label: "Diproses registrar", variant: "secondary", icon: Loader2 },
  failed: { label: "Gagal", variant: "destructive", icon: XCircle },
  expired: { label: "Kadaluwarsa", variant: "destructive", icon: XCircle },
  // Cancelled = user batalkan checkout sebelum bayar. Terminal state, no
  // action needed dari user.
  cancelled: { label: "Dibatalkan", variant: "secondary", icon: Ban },
};

export default function DomainsPage() {
  const params = useParams<{ id: string }>();
  const siteID = params?.id ?? "";

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErr(null);
      try {
        // Backend /domains/purchases return list user (bukan per-site). Filter
        // client-side by site_id. Volume kecil (rata-rata < 20 domain), OK.
        const list = await api<Purchase[]>("/api/v1/domains/purchases?limit=100");
        if (cancelled) return;
        setPurchases((list ?? []).filter((p) => p.site_id === siteID));
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [siteID]);

  // Dedupe per domain — kalau ada register + renew untuk domain sama, ambil
  // row dengan expires_at terbaru (representasi state "current").
  const attached = useMemo(() => latestPerDomain(purchases), [purchases]);

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
          Info domain yang terhubung ke situs ini. Manajemen lengkap (WHOIS,
          nameserver, DNS, perpanjangan) tersedia di halaman{" "}
          <Link
            href="/settings/domains"
            className="font-medium text-primary underline underline-offset-4"
          >
            Settings › Domain
          </Link>
          .
        </p>
      </div>

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
      ) : attached.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {attached.map((p) => (
            <DomainCard key={p.domain} purchase={p} />
          ))}
        </div>
      )}

      <BackgroundNote />
    </div>
  );
}

// ---------------- Cards ----------------

function DomainCard({ purchase }: { purchase: Purchase }) {
  const info = STATUS_MAP[purchase.status] ?? {
    label: purchase.status,
    variant: "secondary" as const,
    icon: Info,
  };
  const Icon = info.icon;
  const expiry = formatExpiry(purchase.expires_at);
  const isPending = purchase.status.startsWith("pending_");
  const isFailed = purchase.status === "failed";
  const isActive = purchase.status === "active";
  const domainHref = `/settings/domains/${encodeURIComponent(purchase.domain)}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-lg font-bold tracking-tight">{purchase.domain}</code>
              {isActive && (
                <a
                  href={`https://${purchase.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  title="Buka situs live"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant={info.variant} className="gap-1 text-xs">
                <Icon className={cn("size-3", info.icon === Loader2 && "animate-spin")} />
                {info.label}
              </Badge>
              {purchase.kind === "renew" && (
                <Badge variant="secondary" className="text-xs">
                  Perpanjangan
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {expiry && isActive && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-md border p-3 text-sm",
              expiry.urgent
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : expiry.warn
                ? "border-amber-300 bg-amber-50/60 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                : "border-border bg-muted/30 text-muted-foreground",
            )}
          >
            <CalendarClock className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">Berlaku sampai {expiry.label}</p>
              <p className="text-xs opacity-80">{expiry.hint}</p>
            </div>
          </div>
        )}

        {isPending && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              Domain masih diproses — sementara situs belum bisa diakses via
              nama domain ini.
            </span>
          </div>
        )}

        {isFailed && purchase.reason && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Gagal:</strong> {purchase.reason}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(isPending || isFailed) && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/sites/pending/${purchase.job_id}`}>
                Lihat status
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant={isActive ? "default" : "outline"} className="gap-1.5">
            <Link href={domainHref}>
              Kelola domain
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
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
          Situs ini belum terhubung ke domain. Beli domain via wizard supaya
          bisa dipublikasikan dengan nama sendiri.
        </p>
        <Button asChild className="mt-2 gap-1.5">
          <Link href="/sites/new-with-domain">
            <ShoppingBag className="size-4" />
            Beli Domain Baru
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function BackgroundNote() {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="flex gap-3 py-4 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 translate-y-0.5" />
        <div>
          <p>
            Setiap situs punya <strong>1 domain</strong> yang otomatis
            ter-attach saat Anda beli via wizard. Untuk operasi lanjutan
            (nameserver, DNS record, perpanjangan, transfer), gunakan halaman
            manajemen domain.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Helpers ----------------

// latestPerDomain — dedupe per domain, ambil row dengan expires_at terbaru
// (post-renew stateful). Kalau expires_at kosong, prioritas urutan register
// dulu (fallback).
function latestPerDomain(items: Purchase[]): Purchase[] {
  const byDomain = new Map<string, Purchase>();
  for (const p of items) {
    const prev = byDomain.get(p.domain);
    if (!prev) {
      byDomain.set(p.domain, p);
      continue;
    }
    const prevExp = prev.expires_at ? Date.parse(prev.expires_at) : 0;
    const curExp = p.expires_at ? Date.parse(p.expires_at) : 0;
    if (curExp > prevExp) byDomain.set(p.domain, p);
  }
  // Sort: active dulu, lalu pending, lalu failed
  const rank = (s: string) =>
    s === "active" ? 0 : s.startsWith("pending_") ? 1 : 2;
  return Array.from(byDomain.values()).sort(
    (a, b) => rank(a.status) - rank(b.status),
  );
}

function formatExpiry(iso?: string): {
  label: string;
  hint: string;
  warn: boolean;
  urgent: boolean;
} | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.floor((t - Date.now()) / (24 * 60 * 60 * 1000));
  const label = new Date(t).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  let hint: string;
  let warn = false;
  let urgent = false;
  if (days < 0) {
    hint = `Sudah kadaluwarsa ${-days} hari yang lalu.`;
    urgent = true;
  } else if (days === 0) {
    hint = "Kadaluwarsa hari ini — segera perpanjang.";
    urgent = true;
  } else if (days <= 7) {
    hint = `Sisa ${days} hari — segera perpanjang.`;
    urgent = true;
  } else if (days <= 30) {
    hint = `Sisa ${days} hari.`;
    warn = true;
  } else if (days <= 365) {
    hint = `Sisa sekitar ${days} hari.`;
  } else {
    const years = Math.floor(days / 365);
    hint = `Sisa sekitar ${years} tahun.`;
  }
  return { label, hint, warn, urgent };
}
