"use client";

// Top-up wallet — pilih nominal + metode. Manual transfer flow butuh pilih bank
// + upload proof (di halaman status setelah initiate).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CreditCard,
  Loader2,
  Wallet as WalletIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Bank = {
  id: number;
  bank_name: string;
  bank_code?: string;
  account_number: string;
  account_holder: string;
  branch?: string;
  notes?: string;
};

type TopupResp = {
  topup_id: string;
  amount: number;
  payment_method: string;
  payment_url?: string;
  status: string;
};

type PaymentMethod = "midtrans" | "paylabs" | "manual_transfer";

const NOMINAL_PRESETS = [100_000, 500_000, 1_000_000, 5_000_000, 10_000_000];

export default function TopupPage() {
  const router = useRouter();
  const [amount, setAmount] = useState<string>("500000");
  const [method, setMethod] = useState<PaymentMethod>("midtrans");
  const [bankID, setBankID] = useState<number | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Idempotency key per mount (mirror wizard pattern).
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    [],
  );

  useEffect(() => {
    if (method !== "manual_transfer") return;
    if (banks.length > 0) return;
    api<Bank[]>("/api/v1/reseller/wallet/topup/banks")
      .then((b) => {
        setBanks(b ?? []);
        if ((b?.length ?? 0) > 0) setBankID(b[0].id);
      })
      .catch((e) => setErr((e as Error).message));
  }, [method, banks.length]);

  const amountNumber = Number(amount);
  const valid =
    Number.isFinite(amountNumber) &&
    amountNumber >= 100_000 &&
    amountNumber <= 100_000_000;

  async function submit() {
    setErr(null);
    if (!valid) {
      setErr("Nominal minimal Rp 100.000, maksimal Rp 100.000.000");
      return;
    }
    if (method === "manual_transfer" && !bankID) {
      setErr("Pilih bank tujuan dulu");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<TopupResp>("/api/v1/reseller/wallet/topup", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          amount: amountNumber,
          payment_method: method,
          bank_id: method === "manual_transfer" ? bankID : undefined,
          return_url: `${window.location.origin}/reseller/wallet/topup/${"__PLACEHOLDER__"}`,
        }),
      });

      // Gateway flow → redirect ke payment_url
      if (res.payment_url) {
        toast.success("Redirect ke halaman pembayaran…");
        window.location.href = res.payment_url;
        return;
      }
      // Manual transfer → ke halaman status untuk lihat instruksi + upload proof
      router.push(`/reseller/wallet/topup/${res.topup_id}`);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link href="/reseller/wallet">
            <ArrowLeft className="size-4" />
            Kembali ke Wallet
          </Link>
        </Button>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-2">
          <WalletIcon className="size-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Top-up Wallet</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Isi saldo untuk beli / perpanjang domain tanpa payment gateway tiap
          transaksi.
        </p>
      </div>

      {err && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 translate-y-0.5" />
          <span>{err}</span>
        </div>
      )}

      <Card>
        <CardContent className="space-y-5 p-6">
          {/* Nominal */}
          <div className="space-y-2">
            <Label htmlFor="amt">Nominal (IDR)</Label>
            <Input
              id="amt"
              type="number"
              value={amount}
              min={100_000}
              max={100_000_000}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500000"
            />
            <p className="text-xs text-muted-foreground">
              Min Rp 100.000, Max Rp 100.000.000 per top-up
            </p>
            <div className="flex flex-wrap gap-2">
              {NOMINAL_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAmount(String(n))}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                    Number(amount) === n
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted",
                  )}
                >
                  {formatIDR(n)}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method */}
          <div className="space-y-2">
            <Label>Metode Pembayaran</Label>
            <div className="grid gap-2">
              <MethodOption
                selected={method === "midtrans"}
                onSelect={() => setMethod("midtrans")}
                icon={CreditCard}
                title="Midtrans"
                desc="Kartu / e-wallet / bank transfer virtual account"
              />
              <MethodOption
                selected={method === "paylabs"}
                onSelect={() => setMethod("paylabs")}
                icon={CreditCard}
                title="Paylabs"
                desc="QRIS / virtual account"
              />
              <MethodOption
                selected={method === "manual_transfer"}
                onSelect={() => setMethod("manual_transfer")}
                icon={Building2}
                title="Manual Transfer"
                desc="Transfer bank, upload bukti — verify manual admin"
              />
            </div>
          </div>

          {/* Bank picker (manual only) */}
          {method === "manual_transfer" && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
              <Label>Bank Tujuan</Label>
              {banks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  <Loader2 className="mr-1 inline size-3 animate-spin" />
                  Memuat daftar bank…
                </p>
              ) : (
                <div className="space-y-2">
                  {banks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBankID(b.id)}
                      className={cn(
                        "block w-full rounded-md border p-3 text-left text-sm transition-colors",
                        bankID === b.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted",
                      )}
                    >
                      <div className="font-medium">{b.bank_name}</div>
                      <div className="mt-0.5 font-mono text-xs">
                        {b.account_number}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        a/n {b.account_holder}
                        {b.branch ? ` — ${b.branch}` : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" asChild disabled={submitting}>
              <Link href="/reseller/wallet">Batal</Link>
            </Button>
            <Button onClick={submit} disabled={!valid || submitting} className="gap-1.5">
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Lanjutkan Top-up
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MethodOption({
  selected,
  onSelect,
  icon: Icon,
  title,
  desc,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ElementType;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
    </button>
  );
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
