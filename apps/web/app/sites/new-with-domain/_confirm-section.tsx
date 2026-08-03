"use client";

// Step 2 — profile check + years/payment/promo + total + CTA "Beli & bayar".
//
// Modernisasi: subsection dengan header kecil, total card gradient, CTA
// besar full-width di mobile.

import { ArrowRight, CheckCircle2, Loader2, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { CheckEntry, Me, PaymentMethod } from "./_types";
import { formatIDR, FIELD_LABEL } from "./_helpers";
import { ProfileBlock } from "./_profile-block";
import { DocumentPicker } from "./_document-picker";

const YEARS_OPTIONS = [1, 2, 3, 5, 10];

// PAYMENT_OPTIONS default (midtrans + paylabs). Wallet ditambah dinamis kalau
// caller reseller/agent (via `walletBalance` prop non-null).
const GATEWAY_OPTIONS: Array<{ value: PaymentMethod; label: string; hint: string }> = [
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
  documentIds: string[];
  setDocumentIds: (ids: string[]) => void;
  purchasing: boolean;
  onPurchase: () => void;
  // Phase 3 on-behalf-of: kalau set, ProfileBlock tampilkan copy "klien".
  forClientID?: string;
  // Callback pasca inline-edit klien sukses — wizard state `me` di-refresh.
  onClientUpdated?: (updated: Me) => void;
  // Phase 3.5 wallet — kalau caller reseller/agent, `walletBalance` di-set
  // (bisa 0). null = mode client (tanpa opsi wallet).
  walletBalance?: number | null;
}) {
  const {
    selected, me, profileComplete, missingProfile,
    years, setYears, paymentMethod, setPaymentMethod,
    documentIds, setDocumentIds,
    purchasing, onPurchase, forClientID, onClientUpdated, walletBalance,
  } = props;

  const total = selected.price ? selected.price.register * years : 0;
  const currency = selected.price?.currency ?? "IDR";
  const showKtpHint = selected.zone?.require_document && !selected.zone.nik_auto_approved;
  // Zone butuh NIK — mis. .id family. Kalau nik_auto_approved false + zone
  // require document, NIK jadi kritis (bisa auto-approve alt-alt kalau
  // nik_auto_approved true, tapi tetap butuh NIK di WHOIS).
  const needNik = Boolean(selected.zone?.require_document);
  // Block "Beli & bayar" kalau on-behalf-of + zone butuh NIK + client belum
  // isi. Kalau kita biarkan lolos, registrar reject → user bingung.
  const nikBlocking = needNik && Boolean(forClientID) && !me?.nik;

  const walletEnabled = walletBalance != null;
  const balanceEnough = walletEnabled && (walletBalance ?? 0) >= total;
  const paymentOptions: Array<{ value: PaymentMethod; label: string; hint: string; icon?: React.ElementType; warn?: string }> = walletEnabled
    ? [
        {
          value: "deposit_wallet",
          label: "Wallet",
          hint: balanceEnough
            ? `Saldo: ${formatIDR(walletBalance ?? 0, "IDR")} — instan tanpa gateway`
            : `Saldo kurang (${formatIDR(walletBalance ?? 0, "IDR")}) — top-up dulu`,
          icon: WalletIcon,
          warn: balanceEnough ? undefined : "insufficient",
        },
        ...GATEWAY_OPTIONS,
      ]
    : GATEWAY_OPTIONS;

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
          forClientID={forClientID}
          onClientUpdated={onClientUpdated}
          needNik={needNik}
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
            <div className={walletEnabled ? "grid gap-2" : "grid grid-cols-2 gap-2"}>
              {paymentOptions.map((opt) => {
                const Icon = opt.icon;
                const disabled = opt.warn === "insufficient" && !balanceEnough;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => !disabled && setPaymentMethod(opt.value)}
                    className={
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors " +
                      (paymentMethod === opt.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : disabled
                          ? "cursor-not-allowed border-dashed opacity-60"
                          : "border-border bg-background hover:border-primary/50")
                    }
                    disabled={disabled}
                  >
                    {Icon && (
                      <div
                        className={
                          paymentMethod === opt.value
                            ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                            : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                        }
                      >
                        <Icon className="size-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{opt.label}</span>
                        {paymentMethod === opt.value && (
                          <CheckCircle2 className="size-4 shrink-0 text-primary" />
                        )}
                      </div>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {opt.hint}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Transparency line untuk reseller/agent (Phase 3.14) — tampilkan
            wholesale supaya reseller sadar margin per transaksi. Wallet method
            = debit dari saldo, gateway = bayar via Midtrans/Paylabs. */}
        {walletEnabled && paymentMethod === "deposit_wallet" && selected.price && (
          <div className="rounded-md border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
            💡 Wallet Anda akan di-debit sesuai wholesale platform. Selisih ke
            kulakan agent atau harga jual ke client adalah margin Anda. Detail
            di menu <span className="font-medium">Harga Jual</span>.
          </div>
        )}

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
          {profileComplete && nikBlocking && (
            <Badge variant="warning" className="justify-center text-xs">
              NIK klien wajib untuk .{selected.tld ?? "id"}
            </Badge>
          )}
          <Button
            onClick={onPurchase}
            disabled={!profileComplete || nikBlocking || purchasing}
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
