"use client";

// Wizard "Beli Domain + Buat Situs".
//
// State machine:
//   step=search  — user mengetik nama domain → tombol Cek → panggil /domains/check
//   step=confirm — availability OK, tampilkan harga + profile check
//                → tombol "Beli sekarang" panggil /domains/purchase
//                → navigate ke /sites/pending/<job_id>
//
// Kalau profile user belum lengkap (nama/HP/alamat/kota/kode pos kosong),
// tombol beli disable + arahkan ke /settings/profile.
//
// Halaman ini SENGAJA tidak handle payment redirect — /domains/purchase
// balik payment_url yang dipakai halaman /sites/pending polling untuk redirect
// ke Midtrans/Paylabs begitu URL siap.

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

type CheckResp = {
  domain: string;
  available: boolean;
  reason?: string;
  price?: {
    currency: string;
    register: number;
    renew: number;
    transfer: number;
  };
  // Zone info dari registrar-api — dipakai wizard untuk pre-warn user
  // kalau domain ini akan minta upload dokumen setelah bayar.
  zone?: {
    name: string;
    require_document: boolean;
    auto_approved: boolean;
    nik_auto_approved: boolean;
  };
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

// Label Indonesia untuk pesan "field kosong". Fallback ke key mentah kalau
// belum di-mapping.
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

  // Auth gate (page ini di luar (dashboard) group, jadi guard sendiri).
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/api/v1/auth/me")
      .then((u) => setMe(u))
      .catch(() => {
        clearTokens();
        router.replace("/login");
      })
      .finally(() => setReady(true));
  }, [router]);

  // Wizard state.
  const [domain, setDomain] = useState(prefillDomain);
  const [years, setYears] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"midtrans" | "paylabs">("midtrans");
  const [promoCode, setPromoCode] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResp | null>(null);
  const [checking, setChecking] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Idempotency key = 1 UUID per mount wizard (per checkout attempt). Kalau
  // user double-click "Beli", request kedua bawa key sama → backend dedup
  // ke job existing bukan bikin dobel invoice.
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    [],
  );

  // NIK hanya wajib kalau user pilih domain .id (Kemenkominfo regulation).
  // Cek hanya setelah user run domain check — sebelum itu tidak tahu TLD.
  const needsNik = (checkResult?.domain ?? "").trim().toLowerCase().replace(/\.$/, "").endsWith(".id");
  const requiredFields: Array<keyof Me> = needsNik
    ? [...REQUIRED_PROFILE_FIELDS, "nik"]
    : REQUIRED_PROFILE_FIELDS;
  const missingProfile = me
    ? requiredFields.filter((k) => !((me as Record<string, unknown>)[k] || "").toString().trim())
    : [];
  const profileComplete = me != null && missingProfile.length === 0;

  async function onCheck() {
    setErr(null);
    setCheckResult(null);
    const normalized = domain.trim().toLowerCase();
    if (!normalized.includes(".")) {
      setErr("Masukkan nama domain lengkap dengan TLD (contoh: myshop.com)");
      return;
    }
    setChecking(true);
    try {
      const res = await api<CheckResp>("/api/v1/domains/check", {
        method: "POST",
        body: JSON.stringify({ domain: normalized }),
      });
      setCheckResult(res);
    } catch (e) {
      // TLD extraction — kalau user ketik "foo.bar", grab "bar" untuk pesan
      // "TLD .bar belum tersedia".
      const parts = normalized.split(".");
      const tld = parts.length > 1 ? parts.slice(1).join(".") : undefined;
      setErr(friendlyError((e as Error).message, tld));
    } finally {
      setChecking(false);
    }
  }

  async function onPurchase() {
    if (!checkResult?.available || !profileComplete) return;
    setErr(null);
    setPurchasing(true);
    try {
      const res = await api<PurchaseResp>("/api/v1/domains/purchase", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          domain: checkResult.domain,
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
      setErr(friendlyError((e as Error).message, checkResult.zone?.name));
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
        {/* Intro */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Beli domain dulu, situs menyusul</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cari nama domain yang tersedia, bayar sekali, dan langsung buat situs
            profesional di atasnya.
          </p>
        </div>

        {/* Step 1 — Search */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                1
              </span>
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
                  placeholder="myshop.com"
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

            {checkResult && (
              <div
                className={`mt-4 flex items-start gap-3 rounded-lg border p-4 ${
                  checkResult.available
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                    : "border-destructive/30 bg-destructive/5"
                }`}
              >
                {checkResult.available ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                )}
                <div className="flex-1">
                  <div className="font-medium">
                    <code className="text-base">{checkResult.domain}</code>{" "}
                    {checkResult.available ? "tersedia" : "sudah dimiliki orang lain"}
                  </div>
                  {!checkResult.available && checkResult.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Alasan: {checkResult.reason}
                    </p>
                  )}
                  {checkResult.price && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Registrasi:{" "}
                      <strong>{formatIDR(checkResult.price.register, checkResult.price.currency)}</strong>{" "}
                      /tahun · Renew:{" "}
                      {formatIDR(checkResult.price.renew, checkResult.price.currency)}/tahun
                    </p>
                  )}
                </div>
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

        {/* Step 2 — Profile check + Confirm */}
        {checkResult?.available && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  2
                </span>
                Konfirmasi & bayar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Profile block */}
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

              {/* Zone hint — kalau butuh dokumen (mis. .id), pre-warn user
                  supaya tidak kaget di halaman /sites/pending saat status
                  jadi pending_document. NIK auto-approved = tidak perlu. */}
              {checkResult.zone?.require_document && !checkResult.zone?.nik_auto_approved && (
                <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                  <FileText className="mt-0.5 size-4 shrink-0" />
                  <div>
                    Domain <code>.{checkResult.zone.name}</code> butuh upload KTP setelah pembayaran.
                    Siapkan foto KTP di{" "}
                    <Link href="/settings/documents" className="underline">
                      library dokumen
                    </Link>{" "}
                    Anda dulu supaya proses langsung lanjut.
                  </div>
                </div>
              )}

              {/* Years + payment */}
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

              {/* Promo code — opsional. Kalau invalid, registrar silent-fallback
                  ke harga normal (bukan reject) — jadi user boleh coba tanpa risk. */}
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

              {/* Total */}
              {checkResult.price && (
                <div className="flex items-center justify-between rounded-lg border bg-background px-4 py-3">
                  <div className="text-sm text-muted-foreground">
                    Total ({years} tahun)
                  </div>
                  <div className="text-lg font-bold">
                    {formatIDR(checkResult.price.register * years, checkResult.price.currency)}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                {!profileComplete && (
                  <Badge variant="secondary" className="text-xs">
                    Lengkapi profil dulu
                  </Badge>
                )}
                <Button
                  onClick={onPurchase}
                  disabled={!profileComplete || purchasing}
                  className="gap-2"
                >
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
        )}
      </main>
    </div>
  );
}

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
//
// Kasus yang di-map:
//   - Zone allowlist (403 dari registrar's zoneAllowedForReseller check)
//   - Profile incomplete (400 dari purchase handler)
//   - NIK required untuk .id
//   - Generic bad gateway / 5xx dari registrar
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
  if (lower.includes("registrar_error") || lower.includes("bad gateway")) {
    return "Registrar sedang bermasalah. Coba beberapa saat lagi.";
  }
  return raw; // fallback ke pesan asli — user bisa lihat detail teknis
}
