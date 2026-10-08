"use client";

// Domain detail — halaman "kelola satu domain":
//   1. Overview: expiry countdown + tombol Perpanjang
//   2. WHOIS: registrar, tanggal daftar, status
//   3. Nameservers: baca current + edit (min 2, max 13)
//
// Semua fetch scoped by user (backend verify ownership sebelum forward).
// Kalau domain bukan milik user → 404 di semua endpoint → tampilkan
// "domain tidak ditemukan".

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Globe2,
  ChevronLeft,
  Loader2,
  AlertCircle,
  ArrowRight,
  Cloud,
  Info,
  Server,
  RefreshCw,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  UserCog,
  XCircle,
  ShieldCheck,
  ShieldAlert,
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
import { cn } from "@/lib/utils";
import { RenewDialog } from "@/components/domains/RenewDialog";

// DomainRow — aggregate current-state per FQDN dari tabel `domains`.
// Beda dari Purchase (transaction log): satu row per domain, include
// contact_id + registered_at + last_renewed_at yang di-cache post-register/renew.
type DomainRow = {
  name: string;
  status: string;
  contact_id?: string;
  expires_at?: string;
  registered_at?: string;
  last_renewed_at?: string;
  site_id?: string;
  registrar_job_id?: string;
  // DNS attach status — admin only field. Pending | success | failed | skipped.
  // Field names generic sejak multi-provider rollout; dns_provider identifies
  // the backend ("cloudflare" | "dnscloud").
  dns_attach_status?: string;
  dns_attach_error?: string;
  dns_attach_at?: string;
  dns_zone_id?: string;
  dns_provider?: string;
  dns_provider_config_id?: string;
};

type Whois = {
  domain: string;
  status?: string;
  registrar?: string;
  created_at?: string;
  expires_at?: string;
  owner_masked?: string;
};

type NameserverInfo = {
  domain: string;
  nameservers: string[];
};

// DomainDetail — shared component untuk halaman kelola 1 domain.
//
// Data source: /api/v1/domains (aggregate `domains` table) — one row per
// FQDN, include contact_id + expires_at + last_renewed_at yang di-cache
// post-register/renew. Ownership scope by user_id di backend (query dari
// tabel `domains`).
//
// `basePath` mengatur back-link (settings vs reseller vs agent vs admin).
// `endpointPrefix` prefix untuk semua endpoint domain — default per-user
// (`/api/v1/domains`), admin pass `/api/v1/admin/domains` untuk bypass
// ownership check (lihat troubleshoot lintas user).
// `adminMode` true → skip actions yg butuh ownership (renew, edit contact)
// karena admin bukan owner.
export function DomainDetail({
  basePath = "/settings/domains",
  endpointPrefix = "/api/v1/domains",
  adminMode = false,
}: {
  basePath?: string;
  endpointPrefix?: string;
  adminMode?: boolean;
}) {
  const router = useRouter();
  const params = useParams<{ name: string }>();
  const domain = decodeURIComponent(params.name ?? "").toLowerCase();

  const [row, setRow] = useState<DomainRow | null>(null);
  const [whois, setWhois] = useState<Whois | null>(null);
  const [ns, setNs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      // 1) Domain aggregate — user mode: list + filter by name. Admin mode:
      //    direct GET /:name (endpoint tunggal).
      let found: DomainRow | null = null;
      if (adminMode) {
        const single = await api<DomainRow & { name: string }>(
          `${endpointPrefix}/${encodeURIComponent(domain)}`,
        );
        if (single) found = single;
      } else {
        const list = await api<DomainRow[]>(endpointPrefix);
        found = (list ?? []).find((d) => d.name === domain) ?? null;
      }
      if (!found) {
        setErr(
          adminMode
            ? "Domain tidak ditemukan di database."
            : "Domain tidak ditemukan di akun Anda.",
        );
        setLoading(false);
        return;
      }
      setRow(found);

      // 2 + 3) WHOIS + Nameservers parallel. Kalau salah satu gagal, non-fatal
      //         — tampilkan yang berhasil, error inline.
      const [whoisRes, nsRes] = await Promise.allSettled([
        api<Whois>(`${endpointPrefix}/${encodeURIComponent(domain)}/whois`),
        api<NameserverInfo>(`${endpointPrefix}/${encodeURIComponent(domain)}/nameservers`),
      ]);
      if (whoisRes.status === "fulfilled") setWhois(whoisRes.value);
      if (nsRes.status === "fulfilled") setNs(nsRes.value.nameservers ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (domain) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, endpointPrefix, adminMode]);

  const expiryInfo = useMemo(() => formatExpiry(row?.expires_at), [row?.expires_at]);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 gap-1.5 -ml-3">
          <Link href={basePath}>
            <ChevronLeft className="size-4" />
            Domain Saya
          </Link>
        </Button>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight">
          <Globe2 className="size-6 text-primary" />
          <code>{domain}</code>
          {row && (
            <Badge variant="success" className="text-xs">
              Aktif
            </Badge>
          )}
        </h1>
      </div>

      {loading && !row ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : err ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{err}</span>
        </div>
      ) : (
        row && (
          <>
            {/* Overview card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {expiryInfo && (
                  <div
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      expiryInfo.urgent
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <Info
                      className={`mt-0.5 size-4 shrink-0 ${
                        expiryInfo.urgent ? "text-destructive" : "text-muted-foreground"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Tanggal expire</div>
                      <div
                        className={`mt-0.5 text-sm ${
                          expiryInfo.urgent ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {expiryInfo.label}
                      </div>
                    </div>
                    {!adminMode && (
                      <Button size="sm" onClick={() => setRenewOpen(true)} className="gap-1.5">
                        <RefreshCw className="size-3.5" />
                        Perpanjang
                      </Button>
                    )}
                  </div>
                )}
                {/* Info tambahan dari tabel domains (aggregate). */}
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {row.contact_id && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Contact ID (EPP handle)
                      </div>
                      <div className="mt-0.5 font-mono text-xs">{row.contact_id}</div>
                    </div>
                  )}
                  {row.registered_at && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Terdaftar sejak
                      </div>
                      <div className="mt-0.5 text-xs">{formatDate(row.registered_at)}</div>
                    </div>
                  )}
                  {row.last_renewed_at && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">
                        Perpanjangan terakhir
                      </div>
                      <div className="mt-0.5 text-xs">{formatDate(row.last_renewed_at)}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* DNS attach status — hanya admin mode. Nampilin status auto-attach
                dari saat register + tombol retry manual kalau failed. Generic
                antar CF/DNSCloud; badge provider ditampilkan di card. */}
            {adminMode && row && (
              <DNSAttachStatusCard
                domain={domain}
                initial={row}
                onRefreshed={(fresh) => setRow(fresh)}
              />
            )}

            {/* Health panel per-provider.
                - cloudflare / undefined (legacy row sebelum field dns_provider) → CF panel
                - dnscloud → DNSCloud panel
                - external → no panel (user manage zone di luar) */}
            {(row?.dns_provider === "cloudflare" || !row?.dns_provider) && (
              <CloudflareHealthPanel domain={domain} endpointPrefix={endpointPrefix} />
            )}
            {row?.dns_provider === "dnscloud" && (
              <DNSCloudInfoCard domain={domain} endpointPrefix={endpointPrefix} />
            )}
            {row?.dns_provider === "external" && (
              <ExternalProviderInfoCard domain={domain} />
            )}

            {/* WHOIS */}
            <WhoisPanel whois={whois} />

            {/* Nameservers — admin view-only */}
            <NameserverPanel
              domain={domain}
              initial={ns}
              onUpdated={(next) => setNs(next)}
              readOnly={adminMode}
            />

            {/* Edit-only panels — hide di admin mode */}
            {!adminMode && (
              <>
                <DnsPanelLink domain={domain} />
                <ContactPanelLink domain={domain} />
              </>
            )}
          </>
        )
      )}

      {renewOpen && row && (
        <RenewDialog
          domain={row.name}
          onClose={() => setRenewOpen(false)}
          onCreated={(jobID) => {
            setRenewOpen(false);
            toast.success("Job perpanjangan dibuat");
            router.push(`/sites/pending/${jobID}`);
          }}
        />
      )}
    </div>
  );
}

// -------------- WHOIS --------------

function WhoisPanel({ whois }: { whois: Whois | null }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">WHOIS</CardTitle>
      </CardHeader>
      <CardContent>
        {!whois ? (
          <p className="text-sm text-muted-foreground">Info WHOIS tidak tersedia.</p>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row label="Status" value={whois.status || "—"} />
            <Row label="Registrar" value={whois.registrar || "—"} />
            <Row label="Terdaftar sejak" value={formatDate(whois.created_at)} />
            <Row label="Expire" value={formatDate(whois.expires_at)} />
            {whois.owner_masked && (
              <Row label="Pemilik" value={whois.owner_masked} className="sm:col-span-2" />
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

// -------------- Nameservers --------------

function NameserverPanel({
  domain,
  initial,
  onUpdated,
  readOnly = false,
}: {
  domain: string;
  initial: string[];
  onUpdated: (next: string[]) => void;
  readOnly?: boolean;
}) {
  // Local edit buffer — initial-nya di-sync via useEffect ketika parent re-fetch.
  const [items, setItems] = useState<string[]>(initial.length > 0 ? initial : ["", ""]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (initial.length > 0) setItems(initial);
  }, [initial]);

  const dirty = useMemo(
    () => JSON.stringify(items.map((n) => n.trim()).filter(Boolean))
      !== JSON.stringify(initial),
    [items, initial],
  );

  function updateItem(i: number, val: string) {
    setItems((arr) => arr.map((x, j) => (j === i ? val : x)));
  }
  function addItem() {
    if (items.length >= 13) return;
    setItems((arr) => [...arr, ""]);
  }
  function removeItem(i: number) {
    if (items.length <= 2) return; // min 2
    setItems((arr) => arr.filter((_, j) => j !== i));
  }

  async function save() {
    const cleaned = items.map((n) => n.trim().toLowerCase()).filter(Boolean);
    if (cleaned.length < 2) {
      setErr("Minimal 2 nameserver");
      return;
    }
    if (cleaned.length > 13) {
      setErr("Maksimal 13 nameserver");
      return;
    }
    // Basic hostname validation client-side (server validate lebih ketat).
    const badFormat = cleaned.find((n) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(n));
    if (badFormat) {
      setErr(`Format tidak valid: ${badFormat}`);
      return;
    }

    setErr(null);
    setSaving(true);
    try {
      const res = await api<NameserverInfo>(
        `/api/v1/domains/${encodeURIComponent(domain)}/nameservers`,
        {
          method: "POST",
          body: JSON.stringify({ nameservers: cleaned }),
        },
      );
      toast.success("Nameserver berhasil diupdate");
      onUpdated(res.nameservers ?? cleaned);
      setItems(res.nameservers ?? cleaned);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="size-4 text-muted-foreground" />
          Nameservers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Nameserver menentukan siapa yang jawab query DNS untuk domain Anda.
          Default: nameserver hosting yang kami sediakan. Ubah kalau mau pindah
          DNS ke Cloudflare / provider lain. Perubahan bisa perlu waktu propagasi
          hingga 24 jam.
        </p>

        {readOnly ? (
          <ul className="space-y-1 rounded-md border bg-muted/30 p-3">
            {initial.length === 0 ? (
              <li className="text-xs text-muted-foreground">(tidak ada info NS)</li>
            ) : (
              initial.map((n) => (
                <li key={n} className="font-mono text-xs">
                  {n}
                </li>
              ))
            )}
          </ul>
        ) : (
          <>
            <div className="space-y-2">
              {items.map((n, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Label htmlFor={`ns-${i}`} className="w-16 shrink-0 text-xs text-muted-foreground">
                    NS {i + 1}
                  </Label>
                  <Input
                    id={`ns-${i}`}
                    value={n}
                    onChange={(e) => updateItem(i, e.target.value)}
                    placeholder="ns1.example.com"
                    className="font-mono lowercase"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(i)}
                    disabled={items.length <= 2}
                    title={items.length <= 2 ? "Minimal 2" : "Hapus"}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={addItem}
                disabled={items.length >= 13}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Tambah nameserver
              </Button>
              <Button onClick={save} disabled={!dirty || saving} className="gap-2">
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Menyimpan…
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    Simpan
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {err && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {!dirty && initial.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            Sesuai dengan konfigurasi di registry
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------- Renew dialog (sama dengan di list page) --------------


// -------------- helpers --------------

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
    if (days <= 0) return { label: `${label} — sudah expire`, urgent: true };
    if (days <= 30) return { label: `${label} · ${days} hari lagi`, urgent: true };
    return { label: `${label} · ${days} hari lagi`, urgent: false };
  } catch {
    return { label: iso, urgent: false };
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// -------------- DNS Panel Link --------------
//
// Entry point ke sub-route DNS editor. Sengaja tidak fetch record di sini —
// halaman detail sudah cukup padat; user klik untuk masuk ke halaman
// dedicated (bisa deep-link + bookmark).

function DnsPanelLink({ domain }: { domain: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-4 text-orange-500" />
          DNS Records
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              Kelola DNS record via Cloudflare — tambah A, CNAME, MX, TXT
              untuk arahkan subdomain, terima email, atau verifikasi layanan
              pihak ketiga.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
            <Link href={`/settings/domains/${encodeURIComponent(domain)}/dns`}>
              Kelola DNS
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// -------------- Contact Panel Link --------------
//
// Entry point ke sub-route contact editor. WHOIS contact update penting untuk
// user yang pindah alamat / ganti nomor telepon — regulasi mengharuskan
// WHOIS akurat. EPP contact:update replace-all, form full-page di sub-route.
function ContactPanelLink({ domain }: { domain: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="size-4 text-primary" />
          Kontak WHOIS
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              Update nama, email, alamat, atau nomor telepon yang terdaftar
              di WHOIS. Wajib akurat sesuai regulasi Kemenkominfo untuk
              domain .id.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
            <Link href={`/settings/domains/${encodeURIComponent(domain)}/contact`}>
              Edit kontak
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// -------------- Cloudflare Health --------------
// Fetch /api/v1/domains/:name/cloudflare-info → tampilkan zone status,
// NS sync antara CF vs registrar, apex/www record. Cegah user bingung
// kenapa domain baru mereka tidak bisa diakses (biasanya NS belum switch
// atau A record belum point ke platform IP).

type CFHealthResp = {
  zone: {
    id: string;
    status: string;
    name_servers: string[];
  };
  records: Array<{
    id: string;
    type: string;
    name: string;
    content: string;
    proxied?: boolean;
    ttl?: number;
  }>;
  nameservers_at_registrar: string[];
  platform_ips: string[];
  checks: {
    zone_active: boolean;
    ns_synced: boolean;
    apex_present: boolean;
    apex_points_to_platform: boolean;
    www_present: boolean;
  };
};

function CloudflareHealthPanel({
  domain,
  endpointPrefix = "/api/v1/domains",
}: {
  domain: string;
  endpointPrefix?: string;
}) {
  const [data, setData] = useState<CFHealthResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api<CFHealthResp>(
        `${endpointPrefix}/${encodeURIComponent(domain)}/cloudflare-info`,
      );
      setData(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [domain, endpointPrefix]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="size-4 text-primary" />
            Cloudflare Health
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && <OverallBadge checks={data.checks} />}
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchData}
              disabled={loading}
              className="gap-1"
              title="Refresh"
            >
              <RefreshCw className={loading ? "size-3 animate-spin" : "size-3"} />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Mengambil data Cloudflare…
          </div>
        ) : err ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertCircle className="size-4 shrink-0 translate-y-0.5 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium">Cloudflare data tidak tersedia</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Kemungkinan: Cloudflare belum di-setup admin, atau zone
                domain ini belum ter-attach ke CF akun kita. Pakai custom NS
                manual di panel di bawah kalau perlu.
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">{err}</p>
            </div>
          </div>
        ) : data ? (
          <>
            {/* Overall check list — 5 indikator */}
            <div className="grid gap-2 sm:grid-cols-2">
              <CheckRow
                ok={data.checks.zone_active}
                label="Zone Cloudflare aktif"
                hint={
                  data.checks.zone_active
                    ? "Zone berstatus 'active' — CF sudah verify NS switch."
                    : `Zone berstatus '${data.zone.status}'. Butuh update NS di registrar supaya CF verify.`
                }
              />
              <CheckRow
                ok={data.checks.ns_synced}
                label="NS di registrar match CF"
                hint={
                  data.checks.ns_synced
                    ? "Nameserver di PANDI sudah pakai NS Cloudflare."
                    : "NS di registrar BEDA dengan NS CF. Update di panel Nameserver di bawah."
                }
              />
              <CheckRow
                ok={data.checks.apex_present}
                label="Record A untuk root domain"
                hint={
                  data.checks.apex_present
                    ? "A record untuk @ sudah ada."
                    : "Belum ada A record — buka DNS editor untuk tambahkan."
                }
              />
              <CheckRow
                ok={data.checks.apex_points_to_platform}
                label="A record → platform IP"
                hint={
                  data.checks.apex_points_to_platform
                    ? "Root domain point ke IP platform yang benar."
                    : `A record TIDAK point ke ${data.platform_ips.join(", ") || "platform IP"}. Domain akan resolve ke server lain.`
                }
              />
              <CheckRow
                ok={data.checks.www_present}
                label="CNAME untuk www"
                hint={
                  data.checks.www_present
                    ? "www.domain akan resolve ke root."
                    : "www subdomain belum ada — user yang ketik www.<domain> tidak akan buka situs."
                }
              />
            </div>

            {/* NS comparison */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nameserver
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Cloudflare assigned
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {data.zone.name_servers.map((ns) => (
                      <li key={ns} className="font-mono text-xs">
                        {ns}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground">
                    Aktual di registrar (PANDI)
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {data.nameservers_at_registrar.length === 0 ? (
                      <li className="text-xs text-muted-foreground">
                        (tidak ada info NS)
                      </li>
                    ) : (
                      data.nameservers_at_registrar.map((ns) => (
                        <li key={ns} className="font-mono text-xs">
                          {ns}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">
                Perlu edit DNS record (A / CNAME / MX / TXT)?
              </p>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href={`/settings/domains/${encodeURIComponent(domain)}/dns`}>
                  Buka DNS Editor
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OverallBadge({ checks }: { checks: CFHealthResp["checks"] }) {
  const total = Object.values(checks).length;
  const passed = Object.values(checks).filter(Boolean).length;
  if (passed === total) {
    return (
      <Badge variant="success" className="gap-1 text-[10px]">
        <ShieldCheck className="size-3" />
        Semua OK
      </Badge>
    );
  }
  if (passed === 0) {
    return (
      <Badge variant="destructive" className="gap-1 text-[10px]">
        <XCircle className="size-3" />
        {total - passed} masalah
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="gap-1 text-[10px]">
      <ShieldAlert className="size-3" />
      {total - passed} peringatan
    </Badge>
  );
}

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div
      className={
        "flex items-start gap-2 rounded-md border p-2.5 text-sm " +
        (ok
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-amber-500/25 bg-amber-500/5")
      }
    >
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className={ok ? "text-sm font-medium" : "text-sm font-medium text-amber-900 dark:text-amber-200"}>
          {label}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

// -------------- DNS Attach Status (admin only) --------------
// Nampilin status auto-attach ke DNS provider yang di-record saat register.
// Backend provider agnostic (Cloudflare atau DNSCloud); badge provider di
// render di dalam card. Admin bisa klik "Retry" kalau failed / skipped.
// Endpoint retain legacy name /cloudflare-retry untuk URL back-compat;
// internally tryAttachToDNS routes ke provider yang sticky di row.

function DNSAttachStatusCard({
  domain,
  initial,
  onRefreshed,
}: {
  domain: string;
  initial: DomainRow;
  onRefreshed: (fresh: DomainRow) => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    status: string;
    error: string;
    at?: string;
    zoneId?: string;
    provider?: string;
  }>({
    status: initial.dns_attach_status ?? "pending",
    error: initial.dns_attach_error ?? "",
    at: initial.dns_attach_at,
    zoneId: initial.dns_zone_id,
    provider: initial.dns_provider,
  });

  async function onRetry() {
    if (retrying) return;
    setRetrying(true);
    try {
      const res = await api<{
        dns_attach_status: string;
        dns_attach_error: string;
        dns_attach_at?: string;
        dns_zone_id?: string;
        dns_provider?: string;
        dns_provider_config_id?: string;
      }>(`/api/v1/admin/domains/${encodeURIComponent(domain)}/cloudflare-retry`, {
        method: "POST",
      });
      setSnapshot({
        status: res.dns_attach_status,
        error: res.dns_attach_error,
        at: res.dns_attach_at,
        zoneId: res.dns_zone_id,
        provider: res.dns_provider,
      });
      // Sync ke parent DomainRow state juga.
      onRefreshed({
        ...initial,
        dns_attach_status: res.dns_attach_status,
        dns_attach_error: res.dns_attach_error,
        dns_attach_at: res.dns_attach_at,
        dns_zone_id: res.dns_zone_id,
        dns_provider: res.dns_provider,
        dns_provider_config_id: res.dns_provider_config_id,
      });
      if (res.dns_attach_status === "success") {
        toast.success("DNS attach berhasil");
      } else if (res.dns_attach_status === "failed") {
        toast.error(`Retry gagal: ${res.dns_attach_error || "unknown error"}`);
      } else {
        toast.info(`Status: ${res.dns_attach_status}`);
      }
    } catch (e) {
      toast.error(`Retry error: ${(e as Error).message}`);
    } finally {
      setRetrying(false);
    }
  }

  const { status, error, at, zoneId, provider } = snapshot;
  const providerLabel = provider === "dnscloud" ? "DNSCloud.ID" : provider === "cloudflare" ? "Cloudflare" : "—";

  // Visual per status.
  const style: Record<
    string,
    { icon: React.ReactNode; label: string; badgeCls: string }
  > = {
    success: {
      icon: <CheckCircle2 className="size-4 text-emerald-600" />,
      label: "Terhubung",
      badgeCls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    failed: {
      icon: <XCircle className="size-4 text-destructive" />,
      label: "Gagal",
      badgeCls: "border-destructive/40 bg-destructive/10 text-destructive",
    },
    pending: {
      icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
      label: "Menunggu",
      badgeCls: "border-border bg-muted/40 text-muted-foreground",
    },
    skipped: {
      icon: <AlertCircle className="size-4 text-amber-600" />,
      label: "Belum di-setup",
      badgeCls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
  };
  const cur = style[status] ?? style.pending;
  const canRetry = status === "failed" || status === "skipped" || status === "pending";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-4 text-primary" />
          Status DNS Provider Attach
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {providerLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            {cur.icon}
            <div>
              <div className="flex items-center gap-2">
                <span className={"rounded-md border px-2 py-0.5 text-xs font-medium " + cur.badgeCls}>
                  {cur.label}
                </span>
                {zoneId && (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    zone: {zoneId.slice(0, 8)}…
                  </code>
                )}
              </div>
              {at && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Terakhir dicek {new Date(at).toLocaleString("id-ID")}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canRetry && provider !== "external" && (
              <Button
                onClick={onRetry}
                disabled={retrying}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                {retrying ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Retry…
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" />
                    Retry
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={() => setSwitchOpen(true)}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <Cloud className="size-3.5" />
              Switch Provider
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-destructive">
              <Info className="size-3" />
              Detail error
            </div>
            <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-destructive/90">
              {error}
            </p>
          </div>
        )}

        {status === "skipped" && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
            Setup DNS provider config di{" "}
            <Link href="/admin/dns-providers" className="font-medium underline">
              /admin/dns-providers
            </Link>{" "}
            dulu, lalu klik Retry.
          </div>
        )}

        {status === "success" && error && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
            Attach berhasil tapi ada warning: <span className="font-mono">{error}</span>
          </div>
        )}

        {provider === "external" && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            Domain diset ke <strong>external</strong> — platform tidak lagi
            kelola zone (A/AAAA/CNAME/MX/TXT). User manage DNS record di
            provider mereka sendiri. Nameserver tetap bisa diubah di PANDI
            lewat panel Nameservers di bawah.
          </div>
        )}
      </CardContent>

      <SwitchProviderDialog
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        domain={domain}
        currentProvider={provider ?? ""}
        onDone={(res) => {
          setSnapshot({
            status: res.new_provider === "external" ? "skipped" : "success",
            error: "",
            at: new Date().toISOString(),
            zoneId: res.new_zone_id ?? "",
            provider: res.new_provider,
          });
          onRefreshed({
            ...initial,
            dns_provider: res.new_provider,
            dns_zone_id: res.new_zone_id ?? "",
            dns_attach_status: res.new_provider === "external" ? "skipped" : "success",
            dns_attach_error: "",
            dns_attach_at: new Date().toISOString(),
          });
        }}
      />
    </Card>
  );
}

// -------------- Switch Provider Dialog --------------
// Admin pindah ownership zone antar CF ↔ DNSCloud, atau release ke external.
// Call POST /admin/domains/:name/switch-provider.

function SwitchProviderDialog({
  open,
  onClose,
  domain,
  currentProvider,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  domain: string;
  currentProvider: string;
  onDone: (res: SwitchResponse) => void;
}) {
  const [target, setTarget] = useState<"cloudflare" | "dnscloud" | "external">("cloudflare");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setErr(null);
      // Default pilih provider yang beda dari current — paling umum admin
      // mau pindah ke yang lain.
      if (currentProvider === "cloudflare") setTarget("dnscloud");
      else if (currentProvider === "dnscloud") setTarget("cloudflare");
      else setTarget("cloudflare");
    }
  }, [open, currentProvider]);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<SwitchResponse>(
        `/api/v1/admin/domains/${encodeURIComponent(domain)}/switch-provider`,
        { method: "POST", body: JSON.stringify({ target_provider: target }) },
      );
      toast.success(
        target === "external"
          ? `${domain} di-release ke external`
          : `${domain} pindah ke ${target}`,
      );
      onDone(res);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sameAsCurrent = target === currentProvider;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="size-5 text-primary" />
            Switch DNS Provider
          </DialogTitle>
          <DialogDescription>
            Pindah ownership zone untuk {domain} ke provider lain, atau
            release ke external supaya user kelola sendiri.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <p>
              Provider saat ini:{" "}
              <strong>{providerDisplayLabel(currentProvider)}</strong>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Target</Label>
            <div className="grid gap-2">
              {([
                {
                  v: "cloudflare" as const,
                  title: "Cloudflare",
                  hint: "Global 300+ POP. Zone + records otomatis di-provision + NS di-push ke PANDI.",
                },
                {
                  v: "dnscloud" as const,
                  title: "DNSCloud.ID",
                  hint: "Indonesia-hosted (data residency). Zone + records di-provision + NS di-push.",
                },
                {
                  v: "external" as const,
                  title: "External (user kelola sendiri)",
                  hint: "Platform STOP manage zone. User set NS + record di provider pilihan mereka. NS tetap bisa diubah di tab Nameservers.",
                },
              ]).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTarget(opt.v)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-md border p-3 text-left text-sm transition",
                    target === opt.v
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{opt.title}</span>
                    {currentProvider === opt.v && (
                      <Badge variant="secondary" className="text-[10px]">
                        Current
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {sameAsCurrent && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
              Target sama dengan provider saat ini. Operasi akan jalan tapi
              efeknya minimal — mostly re-run attach pattern + sanity check.
            </div>
          )}

          {target !== "external" && target !== currentProvider && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
              ⚠ NS di PANDI akan di-update ke NS {target}. Visitor domain
              bisa kena brief downtime (~5-10 menit) selama propagasi parent
              zone. Zone lama di {providerDisplayLabel(currentProvider)}{" "}
              akan dihapus best-effort setelah switch sukses.
            </div>
          )}

          {target === "external" && currentProvider !== "external" && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-200">
              ⚠ Setelah release ke external, user TANGGUNG JAWAB manage DNS
              record sendiri di provider pilihan mereka. Website mereka akan
              DOWN sampai mereka setup NS + A/CNAME ke IP yang benar.
            </div>
          )}

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
              {err}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Switch ke {providerDisplayLabel(target)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SwitchResponse = {
  ok: boolean;
  old_provider: string;
  old_zone_id?: string;
  new_provider: string;
  new_zone_id?: string;
  new_nameservers?: string[];
  warnings?: string[];
  note?: string;
};

function providerDisplayLabel(p: string): string {
  switch (p) {
    case "cloudflare":
      return "Cloudflare";
    case "dnscloud":
      return "DNSCloud.ID";
    case "external":
      return "External";
    default:
      return p || "(belum ada)";
  }
}

// -------------- External Provider Info --------------
// Panel info minimal saat domain di-release ke external — tidak ada zone
// data untuk ditampilkan karena platform tidak manage.
function ExternalProviderInfoCard({ domain }: { domain: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-4 text-muted-foreground" />
          DNS Provider: External
          <Badge variant="secondary" className="ml-1 text-[10px]">
            Self-managed
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Domain <span className="font-mono">{domain}</span> dikelola user di
          provider eksternal. Platform tidak punya zone atau record data
          untuk domain ini.
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Yang platform masih kelola:
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>Status registrasi domain (expire, renew)</li>
            <li>WHOIS contact (via PANDI)</li>
            <li>Nameserver di PANDI registrar (tab Nameservers di bawah)</li>
          </ul>
          Yang TIDAK platform kelola: DNS record (A/CNAME/MX/TXT/etc.), zone
          health, SSL cert, proxy edge. Semua ini user atur di provider mereka.
        </div>
      </CardContent>
    </Card>
  );
}

// -------------- DNSCloud Info (admin health panel) --------------
// Mirror CloudflareHealthPanel untuk zone yang di DNSCloud. Fetch
// /admin/domains/:name/dnscloud-info yang hit GET /zones/{id} +
// /zones/{id}/dnssec di DNSCloud API via sticky config token.

type DNSCloudInfo = {
  zone: {
    id: string;
    name: string;
    status: string;
    version: number;
    soa_serial: number;
    dnssec_enabled: boolean;
    nameservers: string[];
    plan_name?: string;
  };
  propagation: Array<{
    hostname: string;
    serial: number;
    healthy: boolean;
    error?: string;
    observed_at?: string;
  }>;
  dnssec: {
    enabled: boolean;
    chain_state: string;
    chain_label?: string;
    detail?: string;
    ds?: string[];
    dnskey?: string;
    key_tag?: number;
    algorithm?: number;
    checked_at?: string;
    rrsig_expires_at?: string;
  } | null;
  nameservers_at_registrar: string[];
  checks: {
    zone_active: boolean;
    ns_synced: boolean;
  };
};

function DNSCloudInfoCard({ domain, endpointPrefix }: { domain: string; endpointPrefix: string }) {
  const [info, setInfo] = useState<DNSCloudInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function fetchInfo() {
    setLoading(true);
    setErr(null);
    try {
      const d = await api<DNSCloudInfo>(
        `${endpointPrefix}/${encodeURIComponent(domain)}/dnscloud-info`,
      );
      setInfo(d);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, endpointPrefix]);

  const dnssecBadge = (state: string) => {
    switch (state) {
      case "aman": return { label: "Aman", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
      case "menunggu_ds": return { label: "Menunggu DS di registrar", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" };
      case "mismatch": return { label: "DS mismatch", cls: "border-destructive/40 bg-destructive/10 text-destructive" };
      case "error": return { label: "Error", cls: "border-destructive/40 bg-destructive/10 text-destructive" };
      default: return { label: "Nonaktif", cls: "border-border bg-muted/40 text-muted-foreground" };
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-4 text-primary" />
          DNS Provider: DNSCloud.ID
          <Badge variant="secondary" className="ml-1 text-[10px]">Indonesia</Badge>
        </CardTitle>
        <Button variant="outline" size="sm" onClick={fetchInfo} disabled={loading} className="gap-1.5">
          <RefreshCw className={"size-3.5 " + (loading ? "animate-spin" : "")} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Mengambil data DNSCloud…
          </div>
        ) : err ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <p className="font-medium">DNSCloud data tidak tersedia</p>
            <p className="mt-1 font-mono text-[11px] opacity-80">{err}</p>
          </div>
        ) : info ? (
          <>
            {/* Zone status + checks */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CheckRow
                ok={info.checks.zone_active}
                label="Zone aktif di DNSCloud"
                hint={
                  info.checks.zone_active
                    ? "Zone berstatus 'active' — DNSCloud sudah verify NS switch."
                    : `Zone berstatus '${info.zone.status}'. Pastikan nameserver sudah di-update di registrar.`
                }
              />
              <CheckRow
                ok={info.checks.ns_synced}
                label="NS di registrar match DNSCloud"
                hint={
                  info.checks.ns_synced
                    ? "Nameserver di PANDI cocok dengan NS DNSCloud."
                    : "Registrar NS tidak match. Update di panel Nameserver di bawah."
                }
              />
            </div>

            {/* Nameserver assignment */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Nameservers (DNSCloud assigned)
              </p>
              <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                {info.zone.nameservers.map((ns) => (
                  <code key={ns} className="block font-mono text-[11px]">{ns}</code>
                ))}
              </div>
            </div>

            {/* Propagation per-NS */}
            {info.propagation && info.propagation.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Propagasi per Nameserver
                </p>
                <div className="space-y-1">
                  {info.propagation.map((p) => (
                    <div key={p.hostname} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        {p.healthy ? (
                          <CheckCircle2 className="size-3.5 text-emerald-600" />
                        ) : (
                          <XCircle className="size-3.5 text-destructive" />
                        )}
                        <code className="font-mono">{p.hostname}</code>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>serial: {p.serial}</span>
                        {p.error && (
                          <span className="text-destructive">({p.error})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* DNSSEC */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                DNSSEC
              </p>
              {info.dnssec && info.dnssec.enabled ? (
                <div className="rounded-md border p-3 text-xs">
                  <div className="mb-2 flex items-center gap-2">
                    {(() => {
                      const b = dnssecBadge(info.dnssec.chain_state);
                      return (
                        <span className={"rounded-md border px-2 py-0.5 text-xs font-medium " + b.cls}>
                          {b.label}
                        </span>
                      );
                    })()}
                    {info.dnssec.chain_label && (
                      <span className="text-muted-foreground">{info.dnssec.chain_label}</span>
                    )}
                  </div>
                  {info.dnssec.detail && (
                    <p className="mb-2 text-muted-foreground">{info.dnssec.detail}</p>
                  )}
                  {info.dnssec.ds && info.dnssec.ds.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-medium">DS records (salin ke panel registrar):</p>
                      {info.dnssec.ds.map((ds, i) => (
                        <code key={i} className="block break-all rounded bg-muted px-1.5 py-1 font-mono text-[10px]">
                          {ds}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-md border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                  DNSSEC belum aktif untuk zona ini.
                </div>
              )}
            </div>

            {info.zone.plan_name && (
              <div className="text-[11px] text-muted-foreground">
                Paket DNSCloud: <span className="font-medium">{info.zone.plan_name}</span> ·
                Version zone: {info.zone.version} · SOA serial: {info.zone.soa_serial}
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
