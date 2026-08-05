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

            {/* Cloudflare health — cek apakah domain akan bisa di-akses */}
            <CloudflareHealthPanel domain={domain} endpointPrefix={endpointPrefix} />

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
