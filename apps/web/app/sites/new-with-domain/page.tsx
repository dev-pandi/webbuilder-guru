"use client";

// Wizard "Beli Domain + Buat Situs".
//
// Alur:
//   1. User ketik nama domain — SLD saja ("myshop") ATAU full ("myshop.co.id").
//      Backend (registrar reseller check) balik `{query, allowed_zones, results}`:
//        - SLD-only → results = 1 entry per allowed zone
//        - Full     → results = 1 entry saja
//   2. Kalau hasil = 1 dan available, auto-select. Kalau >1, user pilih dari grid.
//   3. Setelah selected, tampilkan Step 2: profile check + years/payment/promo → Beli.
//   4. Sukses → /sites/pending/<job_id> untuk polling status.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Globe2,
  ArrowRight,
  AlertCircle,
  User,
  ExternalLink,
  ChevronLeft,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken, clearTokens } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Me = {
  id: string;
  email: string;
  name: string;
  phone_number: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  nik: string;
};

type PriceBlock = {
  currency: string;
  register: number;
  renew: number;
  transfer: number;
};

type ZoneBlock = {
  name: string;
  require_document: boolean;
  auto_approved: boolean;
  nik_auto_approved: boolean;
};

// CheckEntry = 1 baris hasil dari registrar check (per domain+TLD).
type CheckEntry = {
  domain: string;
  tld: string;
  available: boolean;
  reason?: string;
  price?: PriceBlock;
  zone?: ZoneBlock;
};

// CheckResp — envelope response. Length dari results tergantung mode input:
//   input SLD ("myshop")     → N entry (1 per allowed_zone)
//   input full ("myshop.id") → 1 entry
// allowed_zones = daftar TLD reseller — dipakai UI hint pre-search.
type CheckResp = {
  query: string;
  allowed_zones: string[];
  results: CheckEntry[];
};

type PurchaseResp = {
  job_id: string;
  domain: string;
  status: string;
  payment_url?: string;
};

const REQUIRED_PROFILE_FIELDS: Array<keyof Me> = [
  "name",
  "phone_number",
  "address",
  "city",
  "postal_code",
];

const FIELD_LABEL: Record<string, string> = {
  name: "Nama",
  phone_number: "Nomor HP",
  address: "Alamat",
  city: "Kota",
  state: "Provinsi",
  postal_code: "Kode Pos",
  nik: "NIK (KTP)",
};

export default function NewWithDomainPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prefill dari ?domain=... — dipakai saat user datang dari halaman terminal
  // failed/expired ("Mulai pembelian baru") supaya tidak perlu ngetik ulang.
  const prefillDomain = (searchParams.get("domain") ?? "").toLowerCase().trim();

  // Auth gate.
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/api/v1/auth/me")
      .then(setMe)
      .catch(() => {
        clearTokens();
        router.replace("/login");
      })
      .finally(() => setReady(true));
  }, [router]);

  // Wizard state.
  const [domain, setDomain] = useState(prefillDomain);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<CheckEntry[] | null>(null);
  const [allowedZones, setAllowedZones] = useState<string[]>([]);
  const [selected, setSelected] = useState<CheckEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Purchase state.
  const [years, setYears] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"midtrans" | "paylabs">("midtrans");
  const [promoCode, setPromoCode] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  // Idempotency key = 1 UUID per mount wizard. Double-click "Beli" → backend
  // dedup ke job existing bukan bikin dobel invoice.
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    [],
  );

  // NIK wajib kalau selected domain TLD-nya .id — cek berdasarkan pilihan user.
  const needsNik = (selected?.tld ?? "").endsWith("id");
  const requiredFields: Array<keyof Me> = needsNik
    ? [...REQUIRED_PROFILE_FIELDS, "nik"]
    : REQUIRED_PROFILE_FIELDS;
  const missingProfile = me
    ? requiredFields.filter((k) => !((me as Record<string, unknown>)[k] || "").toString().trim())
    : [];
  const profileComplete = me != null && missingProfile.length === 0;

  async function onCheck() {
    setErr(null);
    setResults(null);
    setSelected(null);
    const normalized = domain.trim().toLowerCase();
    if (normalized === "") return;
    if (normalized.length > 65) {
      setErr("Nama domain maksimal 65 karakter");
      return;
    }
    setChecking(true);
    try {
      const res = await api<CheckResp>("/api/v1/domains/check", {
        method: "POST",
        body: JSON.stringify({ domain: normalized }),
      });
      setAllowedZones(res.allowed_zones ?? []);
      const items = res.results ?? [];
      // Sort: available dulu supaya user yang cari domain baru lihat opsi valid
      // di atas. Antar-available, jaga urutan asli registrar (allowed_zones).
      items.sort((a, b) => Number(b.available) - Number(a.available));
      setResults(items);
      // Single-result mode + available → auto-select (skip grid step).
      if (items.length === 1 && items[0].available) {
        setSelected(items[0]);
      }
    } catch (e) {
      // Extract TLD dari input full-domain untuk pesan lebih spesifik.
      const parts = normalized.split(".");
      const tld = parts.length > 1 ? parts.slice(1).join(".") : undefined;
      setErr(friendlyError((e as Error).message, tld));
    } finally {
      setChecking(false);
    }
  }

  async function onPurchase() {
    if (!selected?.available || !profileComplete) return;
    setErr(null);
    setPurchasing(true);
    try {
      const res = await api<PurchaseResp>("/api/v1/domains/purchase", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          domain: selected.domain,
          years,
          payment_method: paymentMethod,
          promo_code: promoCode.trim() || undefined,
          // Static return page — pengambil job terbaru user lalu redirect ke
          // /sites/pending/<job_id>. Kita nggak tahu job_id di sini karena
          // baru dapat dari response, sedangkan payment session butuh URL
          // saat POST /purchase.
          return_url: `${window.location.origin}/checkout/return`,
        }),
      });
      toast.success("Job pembelian dibuat");
      router.push(`/sites/pending/${res.job_id}`);
    } catch (e) {
      setErr(friendlyError((e as Error).message, selected.zone?.name));
      setPurchasing(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Memuat…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ChevronLeft />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
          <span className="text-lg font-semibold">Buat Situs dengan Domain</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Beli domain dulu, situs menyusul</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cari nama domain yang tersedia, bayar sekali, dan langsung buat situs
            profesional di atasnya.
          </p>
        </div>

        <SearchSection
          domain={domain}
          setDomain={setDomain}
          onCheck={onCheck}
          checking={checking}
          allowedZones={allowedZones}
          results={results}
          selected={selected}
          onSelect={setSelected}
          err={err}
        />

        {selected?.available && (
          <ConfirmSection
            selected={selected}
            me={me}
            profileComplete={profileComplete}
            missingProfile={missingProfile}
            needsNik={needsNik}
            years={years}
            setYears={setYears}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            purchasing={purchasing}
            onPurchase={onPurchase}
          />
        )}
      </main>
    </div>
  );
}

// ============ Sub-components (single-file supaya wizard tetap mudah dibaca) ============

function SearchSection(props: {
  domain: string;
  setDomain: (v: string) => void;
  onCheck: () => void;
  checking: boolean;
  allowedZones: string[];
  results: CheckEntry[] | null;
  selected: CheckEntry | null;
  onSelect: (e: CheckEntry) => void;
  err: string | null;
}) {
  const {
    domain, setDomain, onCheck, checking, allowedZones,
    results, selected, onSelect, err,
  } = props;

  const showZoneHint = results === null && allowedZones.length > 0;
  const showMultiGrid = results !== null && results.length > 1;
  const showSingleCard = results !== null && results.length === 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StepBadge n={1} />
          Cari nama domain
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="myshop atau myshop.co.id"
              className="pl-9"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCheck();
                }
              }}
            />
          </div>
          <Button onClick={onCheck} disabled={checking || !domain.trim()} className="gap-2">
            {checking ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Cek…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Cek
              </>
            )}
          </Button>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Ketik nama saja untuk cek di semua TLD sekaligus, atau lengkap dengan
          extension untuk cek satu.
        </p>

        {/* Allowed-zone chips — hint pre-search supaya user tahu opsi TLD. */}
        {showZoneHint && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">TLD tersedia:</span>
            {allowedZones.map((z) => (
              <Badge key={z} variant="secondary" className="text-[10px] font-mono">
                .{z}
              </Badge>
            ))}
          </div>
        )}

        {/* Multi-result grid — user pilih 1 untuk lanjut ke Step 2. */}
        {showMultiGrid && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Hasil pencarian ({results.length} TLD)
              </p>
              <span className="text-xs text-muted-foreground">
                Klik yang tersedia untuk lanjut
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {results.map((r) => (
                <ResultCard
                  key={r.domain}
                  entry={r}
                  active={selected?.domain === r.domain}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        )}

        {/* Single-result card — hasil full domain OR SLD dengan 1 allowed zone. */}
        {showSingleCard && (
          <div className="mt-4">
            <ResultCard entry={results[0]} active variant="wide" onSelect={onSelect} />
          </div>
        )}

        {err && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultCard({
  entry,
  active,
  variant = "compact",
  onSelect,
}: {
  entry: CheckEntry;
  active: boolean;
  variant?: "compact" | "wide";
  onSelect: (e: CheckEntry) => void;
}) {
  const wide = variant === "wide";
  return (
    <button
      type="button"
      onClick={() => entry.available && onSelect(entry)}
      disabled={!entry.available}
      className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
        entry.available
          ? `${
              active
                ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/30"
                : "border-emerald-200 bg-emerald-50 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/30"
            }`
          : "cursor-not-allowed border-border bg-muted/30 opacity-60"
      }`}
    >
      {entry.available ? (
        <CheckCircle2 className={`mt-0.5 shrink-0 text-emerald-600 ${wide ? "size-5" : "size-4"}`} />
      ) : (
        <XCircle className={`mt-0.5 shrink-0 text-muted-foreground ${wide ? "size-5" : "size-4"}`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <code className={`font-medium ${wide ? "text-base" : "text-sm"}`}>
            {entry.domain}
          </code>
          <Badge
            variant={entry.available ? "success" : "secondary"}
            className="text-[10px]"
          >
            {entry.available ? "Tersedia" : "Dipakai"}
          </Badge>
          {entry.zone?.require_document && !entry.zone.nik_auto_approved && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <FileText className="size-2.5" />
              Perlu KTP
            </Badge>
          )}
        </div>
        {entry.available && entry.price && (
          <p className="mt-1 text-xs text-muted-foreground">
            {wide ? (
              <>
                Registrasi:{" "}
                <strong>{formatIDR(entry.price.register, entry.price.currency)}</strong>
                /tahun · Renew: {formatIDR(entry.price.renew, entry.price.currency)}/tahun
              </>
            ) : (
              <>{formatIDR(entry.price.register, entry.price.currency)}/tahun</>
            )}
          </p>
        )}
        {!entry.available && entry.reason && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {entry.reason}
          </p>
        )}
      </div>
    </button>
  );
}

function ConfirmSection(props: {
  selected: CheckEntry;
  me: Me | null;
  profileComplete: boolean;
  missingProfile: Array<keyof Me>;
  needsNik: boolean;
  years: number;
  setYears: (n: number) => void;
  paymentMethod: "midtrans" | "paylabs";
  setPaymentMethod: (m: "midtrans" | "paylabs") => void;
  promoCode: string;
  setPromoCode: (s: string) => void;
  purchasing: boolean;
  onPurchase: () => void;
}) {
  const {
    selected, me, profileComplete, missingProfile, needsNik,
    years, setYears, paymentMethod, setPaymentMethod,
    promoCode, setPromoCode, purchasing, onPurchase,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <StepBadge n={2} />
          Konfirmasi & bayar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <ProfileBlock
          me={me}
          needsNik={needsNik}
          profileComplete={profileComplete}
          missingProfile={missingProfile}
        />

        {/* Zone hint — kalau butuh dokumen (mis. .id), pre-warn user supaya
            tidak kaget di halaman /sites/pending saat status jadi
            pending_document. NIK auto-approved = tidak perlu upload. */}
        {selected.zone?.require_document && !selected.zone.nik_auto_approved && (
          <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
            <FileText className="mt-0.5 size-4 shrink-0" />
            <div>
              Domain <code>.{selected.zone.name}</code> butuh upload KTP setelah
              pembayaran. Siapkan foto KTP/NPWP (PNG/JPG/PDF, maks 8 MiB) —
              form upload akan muncul otomatis di halaman status.
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="years">Lama registrasi</Label>
            <select
              id="years"
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
            <Label htmlFor="payment">Metode pembayaran</Label>
            <select
              id="payment"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "midtrans" | "paylabs")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="midtrans">Midtrans (kartu / VA / e-wallet)</option>
              <option value="paylabs">Paylabs</option>
            </select>
          </div>
        </div>

        {/* Promo code — opsional. Kalau invalid, registrar silent-fallback ke
            harga normal (bukan reject) — user boleh coba tanpa risk. */}
        <div className="space-y-1.5">
          <Label htmlFor="promo">Kode promo (opsional)</Label>
          <Input
            id="promo"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Kosongkan kalau tidak ada"
            maxLength={32}
            className="uppercase tracking-wider"
          />
        </div>

        {selected.price && (
          <div className="flex items-center justify-between rounded-lg border bg-background px-4 py-3">
            <div className="text-sm text-muted-foreground">
              Total ({years} tahun)
            </div>
            <div className="text-lg font-bold">
              {formatIDR(selected.price.register * years, selected.price.currency)}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {!profileComplete && (
            <Badge variant="secondary" className="text-xs">
              Lengkapi profil dulu
            </Badge>
          )}
          <Button onClick={onPurchase} disabled={!profileComplete || purchasing} className="gap-2">
            {purchasing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Memproses…
              </>
            ) : (
              <>
                Beli & bayar
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfileBlock({
  me,
  needsNik,
  profileComplete,
  missingProfile,
}: {
  me: Me | null;
  needsNik: boolean;
  profileComplete: boolean;
  missingProfile: Array<keyof Me>;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <User className="size-4 text-muted-foreground" />
          Data kontak (untuk WHOIS)
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/profile">
            Edit
            <ExternalLink className="ml-1 size-3" />
          </Link>
        </Button>
      </div>
      {profileComplete ? (
        <div className="mt-3 space-y-1 text-sm text-muted-foreground">
          <div>
            <span className="text-foreground">{me?.name}</span> · {me?.email}
          </div>
          <div>{me?.phone_number}</div>
          <div>
            {me?.address}, {me?.city}
            {me?.state ? `, ${me.state}` : ""} {me?.postal_code}
          </div>
          {needsNik && me?.nik && (
            <div className="font-mono text-xs">
              NIK: {me.nik.slice(0, 6)}••••••{me.nik.slice(-4)}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            Lengkapi profil dulu — field kosong:{" "}
            <strong>
              {missingProfile.map((k) => FIELD_LABEL[k] ?? k).join(", ")}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
      {n}
    </span>
  );
}

// ============ Helpers ============

function formatIDR(amount: number, currency: string) {
  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return `${currency} ${amount.toLocaleString("id-ID")}`;
}

// friendlyError memetakan raw error dari backend/registrar ke pesan ID
// yang meaningful. Fallback ke raw message kalau tidak match pattern.
function friendlyError(raw: string, tld?: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("tidak di-allow") || lower.includes("zone_not_allowed")) {
    return tld
      ? `TLD .${tld} belum tersedia untuk akun ini. Coba TLD lain atau hubungi admin.`
      : "TLD ini belum tersedia untuk akun Anda. Coba TLD lain atau hubungi admin.";
  }
  if (lower.includes("profile_incomplete")) {
    return "Lengkapi profil dulu di halaman Pengaturan → Profil.";
  }
  if (lower.includes("nik_required")) {
    return "NIK wajib untuk domain .id. Isi NIK di Pengaturan → Profil dulu.";
  }
  if (lower.includes("domain tidak tersedia") || lower.includes("already registered")) {
    return "Domain ini sudah dimiliki orang lain. Coba nama lain.";
  }
  if (lower.includes("sld minimal") || lower.includes("format domain tidak valid")) {
    return "Format domain tidak valid. Ketik minimal 2 karakter atau lengkap dengan extension.";
  }
  if (lower.includes("registrar_error") || lower.includes("bad gateway")) {
    return "Registrar sedang bermasalah. Coba beberapa saat lagi.";
  }
  return raw;
}
