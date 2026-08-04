"use client";

// /reseller/wallet/topup — wizard bikin top-up wallet self-service.
// Flow: pilih amount (preset chip atau custom) → pilih payment method →
// POST /wallet/topup → redirect ke /reseller/wallet/topup/[id] untuk poll status.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Loader2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PRESET_AMOUNTS = [100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000];
const MIN_AMOUNT = 50_000;
const MAX_AMOUNT = 100_000_000;

type PaymentMethodItem = {
  id: string;
  code: string;
  label: string;
  type: string; // gateway | manual | wallet
  enabled: boolean;
  sort_order: number;
};

type TopupResp = {
  topup_id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_url?: string;
  instructions?: string;
  created_at: string;
};

function formatIDR(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// METHOD_HINTS — copy Indonesia untuk 4 code seed. Kalau admin bikin custom
// gateway, fallback ke label saja (tanpa hint).
const METHOD_HINTS: Record<string, string> = {
  midtrans: "Kartu / VA / e-wallet (langsung online)",
  paylabs: "Kartu / e-wallet (langsung online)",
  manual_bank: "Transfer + upload bukti — verifikasi 1–24 jam admin",
};

export default function TopupWizardPage() {
  const router = useRouter();
  const [amount, setAmount] = useState<number>(250_000);
  const [customMode, setCustomMode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [methods, setMethods] = useState<PaymentMethodItem[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load active payment methods. Filter out type=wallet (deposit_wallet gak
  // bisa dipakai untuk fund wallet itu sendiri — circular).
  useEffect(() => {
    api<{ items: PaymentMethodItem[] }>("/api/v1/payment-methods")
      .then((res) => {
        const items = (res?.items ?? [])
          .filter((m) => m.enabled && m.type !== "wallet")
          .sort((a, b) => a.sort_order - b.sort_order);
        setMethods(items);
        if (items.length > 0) setPaymentMethod(items[0].code);
      })
      .catch((e) => setErr((e as Error).message))
      .finally(() => setMethodsLoading(false));
  }, []);

  // Idempotency key = 1 UUID per wizard mount. Cegah double-click bikin
  // dobel invoice + charge.
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    [],
  );

  const valid =
    amount >= MIN_AMOUNT && amount <= MAX_AMOUNT && paymentMethod !== "";

  async function onSubmit() {
    if (!valid) return;
    setErr(null);
    setSubmitting(true);
    try {
      const res = await api<TopupResp>("/api/v1/wallet/topup", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          amount,
          payment_method: paymentMethod,
          return_url: `${window.location.origin}/checkout/return`,
        }),
      });
      toast.success("Top-up dibuat");
      router.push(`/reseller/wallet/topup/${res.topup_id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
      } else {
        setErr((e as Error).message);
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/reseller/wallet">
            <ArrowLeft className="size-4" /> Wallet
          </Link>
        </Button>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <Wallet className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Top-up wallet</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Isi saldo untuk transaksi domain (register / renew) dengan wallet.
          Setelah pembayaran sukses, saldo otomatis tersedia.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Pilih nominal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PRESET_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setAmount(v);
                  setCustomMode(false);
                }}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  !customMode && amount === v
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted",
                )}
              >
                {(v / 1000).toLocaleString("id-ID")}k
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custom">
              Atau custom{" "}
              <span className="text-xs text-muted-foreground">
                (min {formatIDR(MIN_AMOUNT)}, max {formatIDR(MAX_AMOUNT)})
              </span>
            </Label>
            <Input
              id="custom"
              type="number"
              value={customMode ? amount : ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCustomMode(true);
                setAmount(v || 0);
              }}
              placeholder="mis. 750000"
              min={MIN_AMOUNT}
              max={MAX_AMOUNT}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Metode pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          {methodsLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Memuat metode pembayaran…
            </div>
          ) : methods.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <AlertCircle className="size-4 shrink-0 translate-y-0.5 text-amber-600" />
              <span>
                Tidak ada metode pembayaran aktif saat ini. Hubungi admin untuk
                mengaktifkan gateway pembayaran.
              </span>
            </div>
          ) : (
            <div className="grid gap-2">
              {methods.map((m) => (
                <PaymentOption
                  key={m.id}
                  active={paymentMethod === m.code}
                  onClick={() => setPaymentMethod(m.code)}
                  label={m.label}
                  hint={METHOD_HINTS[m.code] ?? "Metode pembayaran"}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total bayar
            </div>
            <div className="mt-1 text-3xl font-bold tracking-tight">
              {formatIDR(amount)}
            </div>
          </div>
          <CreditCard className="size-8 text-primary/60" />
        </CardContent>
      </Card>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onSubmit}
          disabled={!valid || submitting}
          size="lg"
          className="gap-2 shadow-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Memproses…
            </>
          ) : (
            <>
              Lanjut ke pembayaran
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function PaymentOption({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50",
      )}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
    </button>
  );
}
