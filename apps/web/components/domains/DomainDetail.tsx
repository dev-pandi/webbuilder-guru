"use client";

// Domain detail — halaman "kelola satu domain":
//   1. Overview: expiry countdown + tombol Perpanjang
//   2. WHOIS: registrar, tanggal daftar, status
//   3. Nameservers: baca current + edit (min 2, max 13)
//
// Semua fetch scoped by user (backend verify ownership sebelum forward).
// Kalau domain bukan milik user → 404 di semua endpoint → tampilkan
// "domain tidak ditemukan".

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RenewDialog } from "@/components/domains/RenewDialog";

type Purchase = {
  job_id: string;
  domain: string;
  status: string;
  kind: string;
  expires_at?: string;
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
// `basePath` mengatur back-link supaya user tetap di layout yang benar
// (settings vs reseller vs agent).
export function DomainDetail({ basePath = "/settings/domains" }: { basePath?: string }) {
  const router = useRouter();
  const params = useParams<{ name: string }>();
  const domain = decodeURIComponent(params.name ?? "").toLowerCase();

  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [whois, setWhois] = useState<Whois | null>(null);
  const [ns, setNs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [renewOpen, setRenewOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      // 1) Purchase ownership check + expiry — dari list purchases, filter
      //    by domain. Alternatif: bikin GET /purchases/by-domain/:name.
      const list = await api<Purchase[]>("/api/v1/domains/purchases?limit=100");
      const found = (list ?? []).find(
        (p) => p.domain === domain && p.status === "active" && p.kind === "register",
      );
      if (!found) {
        setErr("Domain tidak ditemukan di akun Anda.");
        setLoading(false);
        return;
      }
      setPurchase(found);

      // 2 + 3) WHOIS + Nameservers parallel. Kalau salah satu gagal, non-fatal
      //         — tampilkan yang berhasil, error inline.
      const [whoisRes, nsRes] = await Promise.allSettled([
        api<Whois>(`/api/v1/domains/${encodeURIComponent(domain)}/whois`),
        api<NameserverInfo>(`/api/v1/domains/${encodeURIComponent(domain)}/nameservers`),
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
  }, [domain]);

  const expiryInfo = useMemo(() => formatExpiry(purchase?.expires_at), [purchase?.expires_at]);

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
          {purchase && (
            <Badge variant="success" className="text-xs">
              Aktif
            </Badge>
          )}
        </h1>
      </div>

      {loading && !purchase ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : err ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{err}</span>
        </div>
      ) : (
        purchase && (
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
                    <Button size="sm" onClick={() => setRenewOpen(true)} className="gap-1.5">
                      <RefreshCw className="size-3.5" />
                      Perpanjang
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* WHOIS */}
            <WhoisPanel whois={whois} />

            {/* Nameservers */}
            <NameserverPanel
              domain={domain}
              initial={ns}
              onUpdated={(next) => setNs(next)}
            />

            {/* DNS editor entry */}
            <DnsPanelLink domain={domain} />
          </>
        )
      )}

      {renewOpen && purchase && (
        <RenewDialog
          domain={purchase.domain}
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
}: {
  domain: string;
  initial: string[];
  onUpdated: (next: string[]) => void;
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
