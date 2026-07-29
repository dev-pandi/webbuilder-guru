"use client";

// Shared renew dialog untuk /settings/domains + /settings/domains/[name].
// Dulu di-duplikasi di 2 file — sekarang single source supaya form/prompt
// konsisten.

import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Tag } from "lucide-react";
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
  const [paymentMethod, setPaymentMethod] = useState<"midtrans" | "paylabs">("midtrans");
  const [promoCode, setPromoCode] = useState("");
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

  async function onSubmit() {
    setErr(null);
    setSubmitting(true);
    try {
      const res = await api<{ job_id: string }>("/api/v1/domains/renew", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          domain,
          years,
          payment_method: paymentMethod,
          promo_code: promoCode.trim() || undefined,
          return_url: `${window.location.origin}/checkout/return`,
        }),
      });
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
            Pilih durasi + metode pembayaran. Kode promo opsional — kalau tidak
            valid, tetap lanjut dengan harga normal.
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
              onChange={(e) => setPaymentMethod(e.target.value as "midtrans" | "paylabs")}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="midtrans">Midtrans (kartu / VA / e-wallet)</option>
              <option value="paylabs">Paylabs</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="renew-promo">
              Kode promo{" "}
              <span className="text-xs font-normal text-muted-foreground">(opsional)</span>
            </Label>
            <div className="relative">
              <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="renew-promo"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="Kosongkan kalau tidak ada"
                maxLength={32}
                className="pl-9 uppercase tracking-wider"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Silent fallback ke harga normal kalau kode invalid/expired.
            </p>
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
