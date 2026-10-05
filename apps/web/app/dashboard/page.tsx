"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Pencil,
  BarChart3,
  Globe2,
  CheckCircle2,
  Clock,
  Archive,
  AlertCircle,
  Loader2,
  ArrowRight,
  Sparkles,
  FileText,
  HardDrive,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtBytes, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type Site = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
  quota_max_pages: number;
  quota_max_storage_bytes: number;
  updated_at: string;
  // Role caller di site tsb — 'owner' (milik sendiri) atau 'editor'/'viewer'
  // (collaborator, mis. reseller/agent yang beli untuk klien).
  role?: "owner" | "editor" | "viewer";
};

type SiteUsage = {
  pages: { used: number; max: number };
  storage_bytes: { used: number; max: number };
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; class: string }> = {
  published: {
    label: "Published",
    icon: CheckCircle2,
    class: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400",
  },
  draft: {
    label: "Draft",
    icon: Clock,
    class: "bg-muted text-muted-foreground border-border",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    class: "bg-muted text-muted-foreground border-border",
  },
};

// MeProfile — subset dari /auth/me yang dipakai untuk cek kelengkapan profil.
// Field ini wajib saat beli domain (WHOIS + EPP contact). Kalau user belum
// isi dari awal, flow beli domain akan prompt — kita cegah dengan heads-up
// di dashboard.
type MeProfile = {
  name: string;
  phone_number: string;
  address: string;
  city: string;
  postal_code: string;
  nik: string;
};

// Field label untuk pesan "yang belum: nama, HP, …". NIK opsional kalau user
// tidak akan beli .id — tapi karena kita tidak tau niat user, tetap flagged
// supaya lengkap dari awal.
const PROFILE_FIELD_LABEL: Record<keyof MeProfile, string> = {
  name: "Nama lengkap",
  phone_number: "Nomor HP",
  address: "Alamat",
  city: "Kota",
  postal_code: "Kode pos",
  nik: "NIK (untuk .id)",
};

function missingProfileFields(m: MeProfile | null): Array<keyof MeProfile> {
  if (!m) return [];
  const keys: Array<keyof MeProfile> = [
    "name",
    "phone_number",
    "address",
    "city",
    "postal_code",
    "nik",
  ];
  return keys.filter((k) => !(m[k] ?? "").trim());
}

// Purchase = shape yang di-return /api/v1/domains/purchases. Dashboard butuh
// dua use case: kartu "sedang diproses" + banner "mau expire". Detail flow
// tetap di /sites/pending/[jobId] & /settings/domains/[name].
type DomainPurchase = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  payment_url?: string;
  expires_at?: string;
  site_id?: string; // null = domain aktif tapi belum ada situs → prompt "Buat situs"
};

// Status yang layak ditampilkan di kartu "sedang diproses" dashboard.
// active + failed + expired = terminal, tidak perlu dashboard prompt lagi
// (active yang belum di-attach ditangani di /sites/pending/[jobId] template picker).
const ACTIONABLE_STATUSES = new Set([
  "pending_payment",
  "pending_document",
  "pending_provisioning",
]);

// Ambang batas peringatan expire — konsisten dengan /settings/domains (formatExpiry).
const EXPIRY_WARN_DAYS = 30;

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, SiteUsage>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loadingSites, setLoadingSites] = useState(true);
  // Me — fetch /auth/me untuk cek kelengkapan profil (phone/alamat/NIK).
  // Field ini wajib saat beli domain — kalau user belum isi, show banner
  // proaktif di dashboard supaya tidak kaget pas wizard beli domain.
  const [me, setMe] = useState<MeProfile | null>(null);
  const [profileDismissed, setProfileDismissed] = useState<boolean>(false);
  const [pendingPurchases, setPendingPurchases] = useState<DomainPurchase[]>([]);
  // Domain gagal yang butuh perhatian user — retry payment / lengkapi dokumen.
  // Dedupe agar tidak double-nag: kalau ada juga row pending/active untuk
  // domain sama (user sudah recover), sembunyikan yang failed.
  const [failedPurchases, setFailedPurchases] = useState<DomainPurchase[]>([]);
  // Domain aktif yang expire ≤ 30 hari — banner prominent supaya user tidak
  // ketinggalan renewal (kalau miss, site down + support ticket).
  const [expiringPurchases, setExpiringPurchases] = useState<DomainPurchase[]>([]);
  // Semua domain aktif (register-kind) — dipakai untuk section "Domain Anda"
  // yang tampilkan status attached + CTA "Buat situs" kalau belum attached.
  const [activeDomains, setActiveDomains] = useState<DomainPurchase[]>([]);

  async function refresh() {
    setLoadingSites(true);
    try {
      // Guard nil dari backend (reseller/agent tanpa akses site apapun bisa
      // return null di JSON kalau Go marshaling ke nil slice — normalisasi ke []).
      const list = (await api<Site[]>("/api/v1/sites")) ?? [];
      setSites(list);
      const entries = await Promise.all(
        list.map(async (s) => {
          try {
            const u = await api<SiteUsage>(`/api/v1/sites/${s.id}/usage`);
            return [s.id, u] as const;
          } catch {
            return null;
          }
        }),
      );
      const m: Record<string, SiteUsage> = {};
      for (const e of entries) if (e) m[e[0]] = e[1];
      setUsageMap(m);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingSites(false);
    }
  }

  useEffect(() => {
    refresh();
    // Fetch /auth/me untuk cek kelengkapan profil. Fire-and-forget — kalau
    // gagal, banner profile tidak tampil (silent, non-blocking).
    api<MeProfile>("/api/v1/auth/me")
      .then((u) => setMe(u))
      .catch(() => {});
    // Restore dismissed state dari sessionStorage (reset tiap close tab —
    // user tetap lihat lagi di sesi berikutnya kalau belum isi).
    try {
      if (sessionStorage.getItem("dashboard_profile_banner_dismissed") === "1") {
        setProfileDismissed(true);
      }
    } catch {
      /* sessionStorage disabled — biarkan default (banner tampil) */
    }
    // Domain purchases — best effort. Kalau endpoint 404 (registrar disabled),
    // kartu ini tidak muncul.
    //
    // Polling 30s untuk auto-refresh kartu "sedang diproses" — user tidak
    // perlu manual reload saat webhook fire dari registrar. Interval berhenti
    // diam-diam kalau tidak ada pending (no unnecessary requests).
    let cancelled = false;
    async function refreshPurchases() {
      try {
        // limit 100 karena expiring banner butuh sweep semua active — 10 terlalu
        // kecil untuk user dengan banyak domain.
        const list = await api<DomainPurchase[]>("/api/v1/domains/purchases?limit=100");
        if (cancelled) return;
        const items = list ?? [];
        setPendingPurchases(items.filter((p) => ACTIONABLE_STATUSES.has(p.status)));
        // Failed jobs — dedupe supaya tidak nag domain yang sudah user recover
        // (retry sukses → row active + row failed lama). Skip failed kalau ada
        // row pending/active untuk domain sama.
        const inProgress = new Set<string>();
        for (const p of items) {
          if (p.status === "active" || ACTIONABLE_STATUSES.has(p.status)) {
            inProgress.add(p.domain);
          }
        }
        const seenFailed = new Set<string>();
        const failed: DomainPurchase[] = [];
        for (const p of items) {
          if (p.status !== "failed") continue;
          if (inProgress.has(p.domain)) continue;
          if (seenFailed.has(p.domain)) continue;
          seenFailed.add(p.domain);
          failed.push(p);
        }
        setFailedPurchases(failed);
        // Expiry check per DOMAIN, bukan per-row: setelah renew, register-row
        // punya expires_at lama tapi renew-row punya expires_at baru. Ambil
        // yang terbaru per domain supaya user tidak salah panik.
        setExpiringPurchases(latestActivePerDomain(items).filter(isExpiringSoon));
        // Domain aktif register-kind — filter kind=register saja karena renew
        // job aktif tidak nambah entitas domain (cuma extend expiry). site_id
        // di-carry supaya UI bisa show "Buat situs" vs "Edit situs".
        setActiveDomains(
          items.filter((p) => p.status === "active" && p.kind === "register"),
        );
      } catch {
        /* silent — dashboard tidak block */
      }
    }
    refreshPurchases();
    const iv = setInterval(refreshPurchases, 30_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header — 1 domain = 1 situs; tidak ada quota. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Globe2 className="size-4 text-primary" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dashboard
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Situs Saya</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loadingSites
              ? "Memuat…"
              : sites.length === 0
                ? "Belum ada situs — beli domain untuk mulai."
                : `${sites.length} situs aktif · 1 domain = 1 situs`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Primary + satu-satunya alur create: beli domain lalu buat situs.
              Free subdomain flow sudah dihapus (produk decision). */}
          <Button className="gap-2 shadow-sm" asChild>
            <Link href="/sites/new-with-domain">
              <Globe2 className="size-4" />
              <span className="hidden sm:inline">Beli Domain + Buat Situs</span>
              <span className="sm:hidden">Beli Domain</span>
            </Link>
          </Button>
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span><span className="font-medium">Gagal memuat:</span> {err}</span>
        </div>
      )}

      {/* Profile completeness banner — proaktif ingatkan user isi profil
          supaya alur beli domain nanti tidak terputus di tengah. Hanya
          tampil kalau me sudah ter-fetch (hindari flicker saat loading)
          + ada minimal 1 field kosong + user belum dismiss di sesi ini. */}
      {me && !profileDismissed && missingProfileFields(me).length > 0 && (
        <div className="relative rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <button
            type="button"
            onClick={() => {
              setProfileDismissed(true);
              try {
                sessionStorage.setItem("dashboard_profile_banner_dismissed", "1");
              } catch {
                /* ignore write failure */
              }
            }}
            aria-label="Tutup pemberitahuan"
            title="Tutup pemberitahuan (akan muncul lagi di sesi berikutnya)"
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-amber-900 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            <X className="size-4" />
          </button>
          <div className="flex flex-wrap items-start gap-3 pr-8">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <UserCheck className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Lengkapi profil sebelum beli domain
              </div>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
                Data ini wajib untuk WHOIS & invoice domain. Isi sekali di sini
                supaya alur <strong>Beli Domain + Buat Situs</strong> nanti tidak
                terputus di tengah.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {missingProfileFields(me).map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center rounded-full border border-amber-300 bg-white/60 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                  >
                    {PROFILE_FIELD_LABEL[k]}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  asChild
                  className="h-8 gap-1.5 bg-amber-600 text-white hover:bg-amber-700"
                >
                  <Link href="/settings/profile">
                    Lengkapi Sekarang
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <span className="text-[11px] text-amber-900/70 dark:text-amber-200/70">
                  {missingProfileFields(me).length} dari {Object.keys(PROFILE_FIELD_LABEL).length} field belum terisi
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expiry warning — top-of-page karena missing renewal = site down */}
      {expiringPurchases.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-200">
              <AlertTriangle className="size-4" />
              Domain akan segera expire
            </div>
            <Link
              href="/settings/domains"
              className="text-xs font-medium text-red-900 underline underline-offset-4 hover:text-red-700 dark:text-red-200"
            >
              Kelola domain
            </Link>
          </div>
          <div className="space-y-2">
            {expiringPurchases.map((p) => {
              const days = p.expires_at ? daysUntil(p.expires_at) : 0;
              const label =
                days < 0
                  ? `sudah expire ${Math.abs(days)} hari lalu`
                  : days === 0
                    ? "expire hari ini"
                    : `sisa ${days} hari`;
              return (
                <Link
                  key={p.job_id}
                  href={`/settings/domains/${encodeURIComponent(p.domain)}`}
                  className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:border-red-400"
                >
                  <div className="flex items-center gap-2">
                    <Globe2 className="size-4 text-muted-foreground" />
                    <code className="font-medium">{p.domain}</code>
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <RefreshCw className="size-3" />
                      {label}
                    </Badge>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Domain pending — kartu prompt supaya user tidak lupa lanjutkan alurnya */}
      {pendingPurchases.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <Loader2 className="size-4 animate-spin" />
              Domain sedang diproses
            </div>
            <Link
              href="/settings/domains"
              className="text-xs font-medium text-amber-900 underline underline-offset-4 hover:text-amber-700 dark:text-amber-200"
            >
              Lihat semua domain
            </Link>
          </div>
          <div className="space-y-2">
            {pendingPurchases.map((p) => (
              <Link
                key={p.job_id}
                href={`/sites/pending/${p.job_id}`}
                className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary"
              >
                <div className="flex items-center gap-2">
                  <Globe2 className="size-4 text-muted-foreground" />
                  <code className="font-medium">{p.domain}</code>
                  <Badge variant="secondary" className="text-xs">
                    {statusCopy(p.status)}
                  </Badge>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Domain gagal — butuh action user (retry payment / restart flow).
          Sudah di-dedupe: kalau ada row pending/active untuk domain sama,
          card ini tidak muncul (user sudah recover). Deep-link ke pending
          page yang punya tombol Retry / detail failure reason. */}
      {failedPurchases.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-900 dark:text-red-200">
              <AlertCircle className="size-4" />
              Domain gagal — perlu perhatian
            </div>
            <Link
              href="/settings/domains"
              className="text-xs font-medium text-red-900 underline underline-offset-4 hover:text-red-700 dark:text-red-200"
            >
              Lihat semua domain
            </Link>
          </div>
          <div className="space-y-2">
            {failedPurchases.map((p) => (
              <Link
                key={p.job_id}
                href={`/sites/pending/${p.job_id}`}
                className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors hover:border-red-400"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Globe2 className="size-4 shrink-0 text-muted-foreground" />
                  <code className="truncate font-medium">{p.domain}</code>
                  <Badge variant="destructive" className="text-xs">
                    {p.kind === "renew" ? "Renew gagal" : "Pendaftaran gagal"}
                  </Badge>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-red-700 dark:text-red-300">
                  <span className="text-xs font-medium">Coba lagi</span>
                  <ArrowRight className="size-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Domain Aktif — dedupe per domain, prioritas domain yang BELUM ada
          situs (butuh action: pilih template). Domain yang sudah attached
          ke situs muncul juga tapi dengan CTA "Edit situs". */}
      {activeDomains.length > 0 && (
        <ActiveDomainsSection domains={latestActivePerDomain(activeDomains)} sites={sites} />
      )}

      {/* Site grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loadingSites &&
          sites.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-4 animate-pulse">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="h-5 w-16 rounded-full bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded bg-muted" />
                <div className="h-2 w-full rounded bg-muted" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-8 rounded-md bg-muted" />
                <div className="h-8 rounded-md bg-muted" />
                <div className="h-8 rounded-md bg-muted" />
              </div>
            </div>
          ))}

        {!loadingSites && sites.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Sparkles className="size-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">Belum ada situs</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Beli domain untuk mulai — 1 domain = 1 situs.
            </p>
            <Button asChild className="mt-5 gap-2 shadow-sm">
              <Link href="/sites/new-with-domain">
                <Globe2 className="size-4" />
                Beli Domain + Buat Situs
              </Link>
            </Button>
          </div>
        )}

        {sites.map((s) => {
          const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.draft;
          const Icon = cfg.icon;
          const updated = new Date(s.updated_at).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          return (
            <div
              key={s.id}
              className="group relative flex flex-col rounded-xl border bg-card shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 overflow-hidden"
            >
              {s.status === "published" && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-500" />
              )}

              <div className="p-5 flex-1 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{s.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      <span className="text-muted-foreground/50">/</span>{s.slug}
                    </p>
                    {s.role && s.role !== "owner" && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Kolaborator ({s.role})
                      </p>
                    )}
                  </div>
                  <Badge className={`shrink-0 gap-1 text-xs ${cfg.class}`}>
                    <Icon className="size-3" />
                    {cfg.label}
                  </Badge>
                </div>

                <SiteUsageMini usage={usageMap[s.id]} />

                <p className="text-[11px] text-muted-foreground">Diperbarui {updated}</p>
              </div>

              <div className="border-t bg-muted/20 px-3 py-2.5 grid grid-cols-3 gap-1.5">
                <Button variant="default" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/`}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/usage`}>
                    <BarChart3 className="size-3.5" />
                    Statistik
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <Link href={`/sites/${s.id}/domains`}>
                    <Globe2 className="size-3.5" />
                    Domain
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}

        {!loadingSites && sites.length > 0 && (
          <Link
            href="/sites/new-with-domain"
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/10 p-8 text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground hover:border-primary/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed">
              <Globe2 className="size-5" />
            </div>
            <span className="text-sm font-medium">Beli Domain + Buat Situs</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function SiteUsageMini({ usage }: { usage: SiteUsage | undefined }) {
  if (!usage) {
    return (
      <div className="space-y-2">
        <div className="h-5 w-full rounded bg-muted animate-pulse" />
        <div className="h-5 w-full rounded bg-muted animate-pulse" />
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      <UsageRow
        icon={FileText}
        label="Halaman"
        usedText={`${usage.pages.used} / ${usage.pages.max}`}
        percent={pct(usage.pages.used, usage.pages.max)}
      />
      <UsageRow
        icon={HardDrive}
        label="Storage"
        usedText={`${fmtBytes(usage.storage_bytes.used)} / ${fmtBytes(usage.storage_bytes.max)}`}
        percent={pct(usage.storage_bytes.used, usage.storage_bytes.max)}
      />
    </div>
  );
}

function UsageRow({
  icon: Icon,
  label,
  usedText,
  percent,
}: {
  icon: React.ElementType;
  label: string;
  usedText: string;
  percent: number;
}) {
  const barColor =
    percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const textColor =
    percent >= 90
      ? "text-red-600 dark:text-red-400"
      : percent >= 70
      ? "text-amber-600 dark:text-amber-400"
      : "";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon className="size-3" />
          {label}
        </span>
        <span className={`tabular-nums font-medium ${textColor}`}>{usedText}</span>
      </div>
      <Progress value={percent} indicatorClassName={barColor} className="h-1.5 bg-muted" />
    </div>
  );
}

// ActiveDomainsSection — daftar domain aktif user. Prioritas visual:
// domain yang belum di-attach ke situs muncul dulu dengan CTA prominent
// "Buat situs" (butuh action). Domain yang sudah attached muncul di bawah
// dengan link "Edit situs" (informational).
//
// Kenapa penting di dashboard: core product "1 domain = 1 situs" — user
// harus lihat domain-nya + entry point ke bikin situs tanpa perlu ke settings.
function ActiveDomainsSection({
  domains,
  sites,
}: {
  domains: DomainPurchase[];
  sites: Site[];
}) {
  // Sort: unattached dulu, attached di bawah. Antar unattached, expire terdekat.
  const sorted = [...domains].sort((a, b) => {
    const aAttached = a.site_id ? 1 : 0;
    const bAttached = b.site_id ? 1 : 0;
    if (aAttached !== bAttached) return aAttached - bAttached;
    const aExp = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
    const bExp = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
    return aExp - bExp;
  });
  const unattached = sorted.filter((d) => !d.site_id);
  const bySiteID = new Map(sites.map((s) => [s.id, s]));

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
            <Globe2 className="size-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold">Domain Anda</div>
            <div className="text-[11px] text-muted-foreground">
              {unattached.length > 0
                ? `${unattached.length} domain belum ada situs`
                : `${domains.length} domain aktif`}
            </div>
          </div>
        </div>
        <Link
          href="/settings/domains"
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Lihat semua
        </Link>
      </div>

      <ul className="space-y-2">
        {sorted.map((d) => (
          <ActiveDomainRow key={d.job_id} d={d} site={d.site_id ? bySiteID.get(d.site_id) : undefined} />
        ))}
      </ul>
    </div>
  );
}

function ActiveDomainRow({ d, site }: { d: DomainPurchase; site: Site | undefined }) {
  const attached = !!d.site_id;
  return (
    <li
      className={
        "flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors " +
        (attached ? "border-border bg-background" : "border-primary/40 bg-primary/5")
      }
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
        <Globe2 className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-sm font-semibold">{d.domain}</code>
          {attached ? (
            <Badge variant="secondary" className="text-[10px]">
              <CheckCircle2 className="mr-1 size-2.5" />
              Ada situs
            </Badge>
          ) : (
            <Badge variant="success" className="gap-1 text-[10px]">
              <Sparkles className="size-2.5" />
              Siap dibuat situs
            </Badge>
          )}
        </div>
        {attached && site && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {site.name} · /{site.slug}
          </div>
        )}
        {!attached && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Pilih template + bikin situs sekarang — gratis, ~1 menit.
          </div>
        )}
      </div>
      {attached && site ? (
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/sites/${site.id}/editor`}>
            <Pencil className="size-3.5" />
            Edit situs
          </Link>
        </Button>
      ) : (
        <Button asChild size="sm" className="gap-1.5 shadow-sm">
          <Link href={`/sites/pending/${d.job_id}`}>
            <Sparkles className="size-3.5" />
            Buat situs
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      )}
    </li>
  );
}

// statusCopy — mapping raw registrar status → label Indonesia untuk kartu
// "Domain sedang diproses" di dashboard. Sinkron dengan STATUS_INFO di
// /sites/pending/[jobId] tapi ringkas (satu kata) untuk badge kecil.
function statusCopy(status: string): string {
  switch (status) {
    case "pending_payment":
      return "Menunggu bayar";
    case "pending_document":
      return "Menunggu dokumen";
    case "pending_provisioning":
      return "Diproses registrar";
    default:
      return status;
  }
}

// isExpiringSoon — filter untuk expiry warning banner. Active + expires_at
// dalam ≤ EXPIRY_WARN_DAYS (termasuk yang sudah lewat/negatif). Kind tidak
// difilter karena input sudah di-dedupe latestActivePerDomain — kalau ada
// renew active untuk domain, itu yang jadi source of truth expires_at.
function isExpiringSoon(p: DomainPurchase): boolean {
  if (p.status !== "active" || !p.expires_at) return false;
  const dt = new Date(p.expires_at);
  if (isNaN(dt.getTime())) return false;
  const days = Math.round((dt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return days <= EXPIRY_WARN_DAYS;
}

// latestActivePerDomain — dedupe active purchases by domain, ambil yang
// `expires_at` paling akhir. Menghindari 2 baris untuk 1 domain (register +
// renew) di UI dan memastikan tanggal yang ditampilkan konsisten dengan
// backend notifier (yang juga DISTINCT ON per domain by max expires_at).
function latestActivePerDomain(items: DomainPurchase[]): DomainPurchase[] {
  const byDomain = new Map<string, DomainPurchase>();
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

// daysUntil — days remaining sampai iso date; negatif = sudah expire.
function daysUntil(iso: string): number {
  const dt = new Date(iso);
  return Math.round((dt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

