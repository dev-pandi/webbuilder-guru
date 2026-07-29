"use client";

// Reseller invoice list — pakai component yang sama dengan /settings/invoices
// tapi render di dalam layout reseller (sidebar tetap tampil). Backend endpoint
// /api/v1/invoices sudah scoped by caller.UserID (fix cross-tenant leak).

import { InvoicesList } from "@/components/invoices/InvoicesList";

export default function ResellerInvoicesPage() {
  return <InvoicesList />;
}
