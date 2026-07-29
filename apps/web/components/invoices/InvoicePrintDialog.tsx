"use client";

// InvoicePrintDialog — modal berisi preview invoice format A4, plus tombol
// "Cetak" yang trigger window.print(). Print CSS di-inject di root layout
// print (via <style> tag) supaya `@media print` cuma menampilkan block
// `.print-invoice` — dialog overlay + app chrome disembunyikan.
//
// Data source: object Invoice dari list endpoint (sudah cukup untuk render
// row-per-job). Kalau kelak butuh detail lengkap (line-item + promo per
// baris) tinggal fetch tambahan di useEffect.

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Invoice, Me } from "./types";

type Props = {
  invoice: Invoice | null;
  me: Me | null;
  onClose: () => void;
};

// Company / issuer info untuk header invoice. Diambil dari env supaya bisa
// di-tweak per deployment tanpa rebuild. Fallback ke default web builder.
const COMPANY = {
  name: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Web Builder",
  address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "",
  email: process.env.NEXT_PUBLIC_COMPANY_EMAIL ?? "billing@pandi.id",
  taxId: process.env.NEXT_PUBLIC_COMPANY_TAX_ID ?? "",
};

const STATUS_STAMP: Record<
  string,
  { label: string; className: string }
> = {
  Paid: { label: "LUNAS", className: "border-emerald-500 text-emerald-600" },
  Unpaid: { label: "BELUM DIBAYAR", className: "border-amber-500 text-amber-600" },
  "On Check": { label: "VERIFIKASI", className: "border-blue-500 text-blue-600" },
  Rejected: { label: "DITOLAK", className: "border-red-500 text-red-600" },
  Canceled: { label: "DIBATALKAN", className: "border-slate-400 text-slate-500" },
  Expired: { label: "KEDALUWARSA", className: "border-red-500 text-red-600" },
  Refund: { label: "DIKEMBALIKAN", className: "border-slate-400 text-slate-500" },
};

export function InvoicePrintDialog({ invoice, me, onClose }: Props) {
  // Print handler — panggil window.print() setelah tab focus untuk pastikan
  // preview sudah rendered.
  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  // ESC close di-handle Dialog. Auto-focus print button? Skip — user biasanya
  // mau review preview dulu sebelum print.

  const stamp = invoice ? STATUS_STAMP[invoice.status] ?? null : null;
  const subtotal = invoice?.total_price ?? 0;
  const openState = !!invoice;

  return (
    <Dialog open={openState} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="print-hide border-b bg-muted/40 px-6 py-4">
          <DialogTitle className="text-lg font-semibold">
            Pratinjau Invoice
          </DialogTitle>
        </DialogHeader>

        {invoice ? (
          <PrintableInvoice
            invoice={invoice}
            me={me}
            stamp={stamp}
            subtotal={subtotal}
          />
        ) : null}

        <DialogFooter className="print-hide gap-2 border-t bg-muted/40 px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="size-4" />
            Cetak / Simpan PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrintableInvoice({
  invoice,
  me,
  stamp,
  subtotal,
}: {
  invoice: Invoice;
  me: Me | null;
  stamp: { label: string; className: string } | null;
  subtotal: number;
}) {
  const totalYears = useMemo(
    () => invoice.jobs.reduce((s, j) => s + (j.years || 0), 0) || 1,
    [invoice.jobs],
  );
  const perUnit =
    invoice.jobs.length === 1
      ? invoice.total_price / Math.max(totalYears, 1)
      : 0;

  return (
    <div className="print-invoice bg-white text-slate-900">
      <div className="px-8 py-10 sm:px-12">
        {/* Header ---------------------------------------------------------- */}
        <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
                WB
              </div>
              <div>
                <p className="text-base font-bold leading-tight">{COMPANY.name}</p>
                {COMPANY.address ? (
                  <p className="text-xs text-slate-600">{COMPANY.address}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 space-y-0.5 text-xs text-slate-600">
              {COMPANY.email ? <p>Email: {COMPANY.email}</p> : null}
              {COMPANY.taxId ? <p>NPWP: {COMPANY.taxId}</p> : null}
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Invoice
            </p>
            <p className="mt-1 font-mono text-lg font-bold tracking-tight">
              {invoice.invoice_number}
            </p>
            {stamp && (
              <div
                className={cn(
                  "mt-3 inline-block rounded border-2 px-3 py-1 text-xs font-bold uppercase tracking-wider",
                  stamp.className,
                )}
              >
                {stamp.label}
              </div>
            )}
          </div>
        </div>

        {/* From / To ------------------------------------------------------- */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Ditagihkan kepada
            </p>
            <div className="mt-2 space-y-0.5 text-sm">
              <p className="font-semibold">{me?.name || me?.email || "-"}</p>
              {me?.email ? <p className="text-slate-700">{me.email}</p> : null}
              {me?.phone_number ? (
                <p className="text-slate-700">{me.phone_number}</p>
              ) : null}
              {me?.address ? (
                <p className="text-slate-700">{me.address}</p>
              ) : null}
              {(me?.city || me?.state || me?.postal_code) && (
                <p className="text-slate-700">
                  {[me?.city, me?.state, me?.postal_code].filter(Boolean).join(", ")}
                </p>
              )}
              {me?.nik ? (
                <p className="text-slate-500">NIK: {me.nik}</p>
              ) : null}
            </div>
          </div>

          <div className="sm:text-right">
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tanggal terbit
                </p>
                <p className="mt-0.5 font-medium">{formatDate(invoice.created_at)}</p>
              </div>
              {invoice.due_date ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Jatuh tempo
                  </p>
                  <p className="mt-0.5 font-medium">{formatDate(invoice.due_date)}</p>
                </div>
              ) : null}
              {invoice.transaction_date ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Tanggal transaksi
                  </p>
                  <p className="mt-0.5 font-medium">
                    {formatDate(invoice.transaction_date)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Line items ------------------------------------------------------ */}
        <div className="mt-8 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Deskripsi
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Periode
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Jumlah
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.jobs.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-6 text-center text-sm text-slate-500"
                  >
                    Tidak ada detail line item.
                  </td>
                </tr>
              ) : (
                invoice.jobs.map((j) => {
                  const rowTotal = perUnit
                    ? perUnit * (j.years || 1)
                    : invoice.total_price / invoice.jobs.length;
                  return (
                    <tr key={j.job_id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <p className="font-medium">
                          {j.kind === "renew" ? "Perpanjangan domain" : "Pendaftaran domain"}{" "}
                          <span className="font-mono">{j.domain}</span>
                        </p>
                        <p className="text-xs text-slate-500">Job ID: {j.job_id}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {j.years || 1} tahun
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatIDR(rowTotal)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={2} className="px-4 py-3 text-right text-sm font-semibold">
                  Total
                </td>
                <td className="px-4 py-3 text-right text-lg font-bold tabular-nums">
                  {formatIDR(subtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer ---------------------------------------------------------- */}
        <div className="mt-8 space-y-3 text-xs text-slate-600">
          <p>
            Terima kasih telah menggunakan layanan kami. Simpan invoice ini
            sebagai bukti transaksi Anda. Pertanyaan bisa dikirim ke{" "}
            <span className="font-medium">{COMPANY.email}</span>.
          </p>
          {invoice.status === "Unpaid" && (
            <p className="rounded border-l-4 border-amber-500 bg-amber-50 p-3 text-amber-900">
              <strong>Invoice ini belum dibayar.</strong> Selesaikan pembayaran
              sebelum jatuh tempo supaya proses domain bisa dilanjutkan.
            </p>
          )}
        </div>

        <div className="mt-6 border-t border-dashed border-slate-200 pt-3 text-center text-[10px] text-slate-400">
          Dicetak dari {COMPANY.name} · {new Date().toLocaleString("id-ID")}
        </div>
      </div>
    </div>
  );
}

function formatIDR(v: number): string {
  if (!Number.isFinite(v)) return "Rp 0";
  return `Rp ${Math.round(v).toLocaleString("id-ID")}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// Inject print CSS sekali di module scope kalau dijalankan di browser. Rule
// `visibility:hidden` semua > reveal `.print-invoice` adalah pattern paling
// reliable untuk portal-based dialog (Radix di-portal ke body root).
if (typeof document !== "undefined" && !document.getElementById("wb-invoice-print-css")) {
  const style = document.createElement("style");
  style.id = "wb-invoice-print-css";
  style.textContent = `
    @media print {
      html, body {
        background: #fff !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body * {
        visibility: hidden !important;
      }
      .print-invoice,
      .print-invoice * {
        visibility: visible !important;
      }
      .print-invoice {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        box-shadow: none !important;
      }
      .print-hide {
        display: none !important;
      }
      /* Radix Dialog overlay & default dialog frame — hilangkan dari print */
      [data-radix-portal] > *:not(:has(.print-invoice)) {
        display: none !important;
      }
    }
    @page {
      size: A4;
      margin: 12mm;
    }
  `;
  document.head.appendChild(style);
}
