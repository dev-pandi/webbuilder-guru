"use client";

// Shared renew dialog untuk /settings/domains + /settings/domains/[name].
// Dulu di-duplikasi di 2 file — sekarang single source supaya form/prompt
// konsisten.

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// tld helper — "myshop.co.id" → "co.id"
function extractTLD(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return parts.slice(1).join(".");
}

export function RenewDialog({
  domain,
  onClose,
  onCreated,
}: {
  domain: string;
  onClose: () => void;
  onCreated: (jobID: string) => void;
}) {
  const [years, setYears] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<"midtrans" | "paylabs" | "deposit_wallet">("midtrans");
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Idempotency key per dialog open — cegah double-click bikin 2 renew job.
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36),
    [],
  );

  async function onApplyPromo() {
    if (!promoCode.trim()) return;
    setValidatingPromo(true);
    setPromoError(null);
    try {
      const res = await api<{ code: string; description?: string; discount: number }>(
        "/api/v1/promos/validate",
        {
          method: "POST",
          body: JSON.stringify({
            code: promoCode.trim(),
            tld: extractTLD(domain),
            kind: "renew",
            // Renew: subtotal tidak diketahui client (harga per TLD di-lookup
            // backend). Pass 0 supaya validate skip min_subtotal check;
            // backend akan hitung actual discount saat renew.
            subtotal: 0,
          }),
        },
      );
      setPromoDiscount(res.discount);
      toast.success(`Diskon ${res.description || "promo"} diterapkan`);
    } catch (e) {
      setPromoDiscount(0);
      setPromoError((e as Error).message);
    } finally {
      setValidatingPromo(false);
    }
  }

  function onClearPromo() {
    setPromoCode("");
    setPromoDiscount(0);
    setPromoError(null);
  }

  async function onSubmit() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await api<{ job_id: string }>(
        `/api/v1/domains/${encodeURIComponent(domain)}/renew`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({
            years,
            payment_method: paymentMethod,
            return_url: `${window.location.origin}/checkout/return`,
            promo_code: promoDiscount > 0 && promoCode.trim() ? promoCode.trim() : undefined,
          }),
        },
      );
      onCreated(res.job_id);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Perpanjang <code className="text-sm">{domain}</code>
          </DialogTitle>
          <DialogDescription>
            Pilih durasi + metode pembayaran.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="renew-years">Lama perpanjangan</Label>
            <select
              id="renew-years"
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
            <Label htmlFor="renew-payment">Metode pembayaran</Label>
            <select
              id="renew-payment"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "midtrans" | "paylabs" | "deposit_wallet")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="midtrans">Midtrans (kartu / VA / e-wallet)</option>
              <option value="paylabs">Paylabs</option>
              <option value="deposit_wallet">Wallet (saldo internal)</option>
            </select>
          </div>

          {/* Promo code */}
          <div className="space-y-1.5">
            <Label htmlFor="renew-promo" className="text-xs">
              Kode promo <span className="text-muted-foreground">(opsional)</span>
            </Label>
            {promoDiscount > 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30">
                <Tag className="size-4 text-emerald-600" />
                <span className="flex-1 font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                  {promoCode}
                </span>
                <button
                  type="button"
                  onClick={onClearPromo}
                  className="rounded p-1 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="renew-promo"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Kosongkan kalau tidak ada"
                    maxLength={32}
                    disabled={validatingPromo}
                    className="pl-9 uppercase tracking-wider"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onApplyPromo}
                  disabled={!promoCode.trim() || validatingPromo}
                  className="shrink-0"
                >
                  {validatingPromo ? <Loader2 className="size-4 animate-spin" /> : "Terapkan"}
                </Button>
              </div>
            )}
            {promoError && (
              <p className="text-xs text-destructive">{promoError}</p>
            )}
          </div>

          {err && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={submitting} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Memproses…
              </>
            ) : (
              <>
                Perpanjang &amp; bayar
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
