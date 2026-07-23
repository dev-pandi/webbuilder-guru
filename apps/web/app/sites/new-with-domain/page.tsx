"use client";

// Wizard "Beli Domain + Buat Situs" — halaman orchestration.
//
// Alur:
//   1. User ketik nama domain — SLD ("myshop") atau full ("myshop.co.id").
//      Backend (registrar reseller check) balik {query, allowed_zones, results}:
//        - SLD-only → results = 1 entry per allowed zone
//        - Full     → results = 1 entry
//   2. Kalau results = 1 dan available, auto-select. Kalau >1, user pilih dari grid.
//   3. Setelah selected, Step 2 muncul: profile check + years/payment/promo → Beli.
//   4. Sukses → /sites/pending/<job_id> untuk polling status.
//
// Struktur file:
//   page.tsx              — main container + state (this file)
//   _stepper.tsx          — progress indicator
//   _search-section.tsx   — Step 1 UI
//   _result-card.tsx      — kartu hasil (available / taken)
//   _confirm-section.tsx  — Step 2 UI (profile + purchase form + total)
//   _profile-block.tsx    — profile summary widget
//   _types.ts             — shared TS types
//   _helpers.ts           — formatIDR + friendlyError + missing fields

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Globe2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken, clearTokens } from "@/lib/api";
import { Button } from "@/components/ui/button";

import type { CheckEntry, CheckResp, Me, PaymentMethod, PurchaseResp } from "./_types";
import { friendlyError, missingProfileFields } from "./_helpers";
import { Stepper, type StepIdx } from "./_stepper";
import { SearchSection } from "./_search-section";
import { ConfirmSection } from "./_confirm-section";

export default function NewWithDomainPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prefill dari ?domain=... — dipakai saat user datang dari halaman terminal
  // failed/expired ("Mulai pembelian baru") supaya tidak perlu ngetik ulang.
  const prefillDomain = (searchParams.get("domain") ?? "").toLowerCase().trim();

  // Auth gate + profile fetch. `me` di-refresh saat window regains focus
  // supaya user yang edit profil di tab lain (atau /settings/profile) langsung
  // dapat data baru begitu balik ke wizard — cegah stale "Profil belum
  // lengkap" warning padahal sudah diisi.
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    const fetchMe = () =>
      api<Me>("/api/v1/auth/me")
        .then(setMe)
        .catch(() => {
          clearTokens();
          router.replace("/login");
        });
    fetchMe().finally(() => setReady(true));

    // Re-fetch saat tab kembali fokus atau document visible lagi.
    const onFocus = () => {
      if (getAccessToken()) void fetchMe();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("midtrans");
  const [promoCode, setPromoCode] = useState("");
  // documentIds = pre-attach docs. Kalau non-empty, registrar skip
  // pending_document → langsung provisioning. Kalau kosong dan zone butuh
  // dokumen, user upload di halaman /sites/pending/[jobId].
  const [documentIds, setDocumentIds] = useState<number[]>([]);
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

  // NIK selalu opsional — tidak block frontend. Kalau ternyata registrar
  // reject (mis. zone .id yang butuh NIK per regulasi), user akan dapat
  // pesan Indonesia jelas dari backend + friendly toast.
  const missingProfile = missingProfileFields(me);
  const profileComplete = me != null && missingProfile.length === 0;

  // Derive step untuk stepper visual.
  const currentStep: StepIdx = selected
    ? 3
    : results !== null && results.length > 1
      ? 2
      : 1;

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
      // Single-result + available → auto-select (skip grid step).
      if (items.length === 1 && items[0].available) {
        setSelected(items[0]);
      }
    } catch (e) {
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
          // Pre-attach docs kalau user pilih dari picker — kosong = skip
          // (post-payment upload flow di /sites/pending/[jobId]).
          document_ids: documentIds.length > 0 ? documentIds : undefined,
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
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Top bar */}
      <header className="border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3">
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link href="/dashboard">
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </Button>
          <Stepper current={currentStep} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8 sm:py-12">
        {/* Hero */}
        <Hero />

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
            years={years}
            setYears={setYears}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            promoCode={promoCode}
            setPromoCode={setPromoCode}
            documentIds={documentIds}
            setDocumentIds={setDocumentIds}
            purchasing={purchasing}
            onPurchase={onPurchase}
          />
        )}
      </main>
    </div>
  );
}

function Hero() {
  return (
    <div className="text-center sm:text-left">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground shadow-sm">
        <Sparkles className="size-3 text-primary" />
        1 domain = 1 situs
      </div>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Beli domain,{" "}
        <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          buat situs instan
        </span>
      </h1>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
        Cari nama domain yang tersedia, bayar sekali, langsung punya situs
        profesional di atasnya.
      </p>
      <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:justify-start">
        <Globe2 className="size-3.5" />
        <span>Cek multi-TLD dalam 1 klik</span>
      </div>
    </div>
  );
}
