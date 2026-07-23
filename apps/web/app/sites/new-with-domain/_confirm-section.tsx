"use client";

// Step 2 — profile check + years/payment/promo + total + CTA "Beli & bayar".
//
// Modernisasi: subsection dengan header kecil, total card gradient, CTA
// besar full-width di mobile.

import { ArrowRight, CheckCircle2, Loader2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { CheckEntry, Me, PaymentMethod } from "./_types";
import { formatIDR, FIELD_LABEL } from "./_helpers";
import { ProfileBlock } from "./_profile-block";
import { DocumentPicker } from "./_document-picker";

const YEARS_OPTIONS = [1, 2, 3, 5, 10];

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string; hint: string }> = [
  { value: "midtrans", label: "Midtrans", hint: "Kartu / VA / e-wallet" },
  { value: "paylabs", label: "Paylabs", hint: "Kartu / e-wallet" },
];

export function ConfirmSection(props: {
  selected: CheckEntry;
  me: Me | null;
  profileComplete: boolean;
  missingProfile: Array<keyof Me>;
  years: number;
  setYears: (n: number) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  promoCode: string;
  setPromoCode: (s: string) => void;
  documentIds: number[];
  setDocumentIds: (ids: number[]) => void;
  purchasing: boolean;
  onPurchase: () => void;
}) {
  const {
    selected, me, profileComplete, missingProfile,
    years, setYears, paymentMethod, setPaymentMethod,
    promoCode, setPromoCode, documentIds, setDocumentIds,
    purchasing, onPurchase,
  } = props;

  const total = selected.price ? selected.price.register * years : 0;
  const currency = selected.price?.currency ?? "IDR";
  const showKtpHint = selected.zone?.require_document && !selected.zone.nik_auto_approved;

  return (
    <Card className="overflow-hidden border-2 shadow-sm">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            2
          </div>
          <span>Konfirmasi &amp; bayar</span>
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            {selected.domain}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <ProfileBlock
          me={me}
          profileComplete={profileComplete}
          missingProfile={missingProfile}
        />

        {/* Zone butuh dokumen (mis. .id) — tampilkan picker inline supaya
            user bisa pre-attach dari library ATAU upload baru. Kalau di-skip,
            form upload muncul otomatis di /sites/pending/[jobId] post-payment
            (flow tetap jalan, sekedar 1 step extra). */}
        {showKtpHint && (
          <DocumentPicker selectedIds={documentIds} onChange={setDocumentIds} />
        )}

        <div className="space-y-4">
          <SectionHeader>Detail pembelian</SectionHeader>

          {/* Years selector — chip-based supaya lebih tactile dari <select> */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Lama registrasi
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {YEARS_OPTIONS.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setYears(y)}
                  className={
                    "rounded-lg border py-2.5 text-sm font-semibold transition-colors " +
                    (years === y
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground")
                  }
                >
                  {y}
                  <span className="ml-0.5 text-[10px] font-normal">thn</span>
                </button>
              ))}
            </div>
          </div>

          {/* Payment method — card-style radio */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Metode pembayaran
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={
                    "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors " +
                    (paymentMethod === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-background hover:border-primary/50")
                  }
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-semibold">{opt.label}</span>
                    {paymentMethod === opt.value && (
                      <CheckCircle2 className="size-4 text-primary" />
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Promo code — opsional. Kalau invalid, registrar silent-fallback ke
              harga normal (bukan reject) — user boleh coba tanpa risk. */}
          <div className="space-y-1.5">
            <Label htmlFor="promo" className="text-xs uppercase tracking-wider text-muted-foreground">
              Kode promo <span className="normal-case text-muted-foreground/70">(opsional)</span>
            </Label>
            <div className="relative">
              <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="promo"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Kosongkan kalau tidak ada"
                maxLength={32}
                className="pl-9 uppercase tracking-wider"
              />
            </div>
          </div>
        </div>

        {/* Total — prominent gradient card */}
        {selected.price && (
          <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Total pembayaran
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatIDR(selected.price.register, currency)} × {years} tahun
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {formatIDR(total, currency)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CTA — full-width mobile, right-aligned desktop */}
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!profileComplete && (
            <Badge variant="secondary" className="justify-center text-xs">
              Kurang:{" "}
              {missingProfile.map((k) => FIELD_LABEL[k] ?? k).join(", ")}
            </Badge>
          )}
          <Button
            onClick={onPurchase}
            disabled={!profileComplete || purchasing}
            size="lg"
            className="h-12 gap-2 text-base font-semibold shadow-sm sm:w-auto"
          >
            {purchasing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Memproses…
              </>
            ) : (
              <>
                Beli &amp; bayar
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm font-semibold">{children}</div>
  );
}
