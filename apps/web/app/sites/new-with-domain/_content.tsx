"use client";

// Client component untuk wizard "Beli Domain + Buat Situs".
//
// Di-wrap oleh `page.tsx` server component dalam <Suspense> boundary supaya
// Next.js 14 tidak fail pre-render karena `useSearchParams()` di client
// component (Next.js WAJIB di-Suspense atau bail static generation).
//
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
import { ChevronLeft, Globe2, Loader2, Sparkles, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { api, getAccessToken, clearTokens, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

import type { CheckEntry, CheckResp, Me, PaymentMethod, PurchaseResp } from "./_types";
import { friendlyError, missingProfileFields } from "./_helpers";
import { Stepper, type StepIdx } from "./_stepper";
import { SearchSection } from "./_search-section";
import { ConfirmSection } from "./_confirm-section";

export function NewWithDomainContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prefill dari ?domain=... — dipakai saat user datang dari halaman terminal
  // failed/expired ("Mulai pembelian baru") supaya tidak perlu ngetik ulang.
  const prefillDomain = (searchParams.get("domain") ?? "").toLowerCase().trim();
  // ?for_client=<uuid> → mode "beli untuk klien" (Phase 3 on-behalf-of).
  // Kalau di-set, wizard fetch profil client (bukan self) + pass
  // on_behalf_of_user_id ke API purchase.
  const forClientID = (searchParams.get("for_client") ?? "").trim();

  // Auth gate + profile fetch. `me` di-refresh saat window regains focus
  // supaya user yang edit profil di tab lain (atau /settings/profile) langsung
  // dapat data baru begitu balik ke wizard — cegah stale "Profil belum
  // lengkap" warning padahal sudah diisi.
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  // callerRole dipakai UI copy ("Untuk klien X") + guard.
  const [callerRole, setCallerRole] = useState<string>("");
  // Wallet balance untuk reseller/agent (opsi payment_method=wallet).
  // null = tidak show wallet option (client role atau fetch gagal).
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace("/login");
      return;
    }
    // Selalu ambil caller info dulu — untuk mode for-client, kita fetch
    // client profile di endpoint terpisah (assignment-scoped). Untuk mode
    // self-purchase, /me sudah cukup.
    const fetchMe = async () => {
      try {
        const self = await api<Me & { role?: string }>("/api/v1/auth/me");
        setCallerRole(self.role || "");
        // Wallet — reseller/agent kedua-duanya bisa view balance (agent lihat
        // wallet reseller induk). Client tidak.
        if (self.role === "reseller" || self.role === "agent") {
          const path = self.role === "agent" ? "/api/v1/agent/wallet" : "/api/v1/reseller/wallet";
          api<{ balance: number }>(path)
            .then((w) => setWalletBalance(w.balance))
            .catch(() => setWalletBalance(0));
        } else {
          setWalletBalance(null);
        }
        if (forClientID) {
          // Fetch client profile — endpoint scope by assignment (reseller/agent).
          // Fall back error handled below (invalid id / no assignment).
          const isAgent = self.role === "agent";
          const path = isAgent
            ? `/api/v1/agent/clients/${forClientID}`
            : `/api/v1/reseller/clients/${forClientID}`;
          const client = await api<Me>(path);
          setMe(client);
        } else {
          setMe(self);
        }
      } catch (e) {
        // Kalau /me gagal → session invalid. Kalau client profile gagal
        // (403/404) → tampilkan pesan tapi jangan force logout.
        if (!forClientID) {
          clearTokens();
          router.replace("/login");
        } else {
          toast.error((e as Error).message || "Gagal ambil data klien");
          router.replace("/reseller/clients");
        }
      }
    };
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
  }, [router, forClientID]);

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
          // On-behalf-of: kalau wizard di-load dengan ?for_client=<id>,
          // backend set user_id purchase = client, purchased_by = caller.
          on_behalf_of_user_id: forClientID || undefined,
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
      // 402 wallet_insufficient — pesan spesifik + arahkan top-up.
      if (e instanceof ApiError && e.status === 402) {
        setErr(
          `Saldo wallet tidak cukup. ${e.message} — Klik "Top-up Wallet" untuk isi saldo, atau pilih metode pembayaran lain.`,
        );
        toast.error("Saldo wallet tidak cukup");
        setPurchasing(false);
        return;
      }
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

  const isForClient = forClientID !== "";
  const backHref = isForClient
    ? callerRole === "agent"
      ? "/agent/clients"
      : "/reseller/clients"
    : "/dashboard";
  const backLabel = isForClient ? "Daftar Klien" : "Dashboard";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Top bar */}
      <header className="border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3">
          <Button variant="ghost" size="sm" asChild className="gap-1.5">
            <Link href={backHref}>
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
          </Button>
          <Stepper current={currentStep} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8 sm:py-12">
        {/* Hero */}
        {isForClient ? <ForClientBanner me={me} /> : <Hero />}

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
            forClientID={forClientID || undefined}
            onClientUpdated={(updated) => setMe(updated)}
            walletBalance={walletBalance}
          />
        )}
      </main>
    </div>
  );
}

function ForClientBanner({ me }: { me: Me | null }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary shadow-sm">
        <UserCircle className="size-3" />
        Beli untuk Klien
      </div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Daftarkan domain atas nama{" "}
        <span className="text-primary">{me?.name || "klien"}</span>
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Kontak WHOIS + invoice pakai data klien. Domain akan muncul di dashboard
        klien setelah pembayaran selesai.
      </p>
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
