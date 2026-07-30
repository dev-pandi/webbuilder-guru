"use client";

// Reseller invoice list — pakai component yang sama dengan /settings/invoices
// tapi render di dalam layout reseller (sidebar tetap tampil).
//
// `endpoint` override ke /reseller/invoices karena default /invoices scope
// by external_user_id = caller — invoice on-behalf-of tagged external_user_id
// = client, jadi tidak muncul. Endpoint /reseller/invoices fan-out aggregate
// self + semua client yang di-manage.

import { InvoicesList } from "@/components/invoices/InvoicesList";

export default function ResellerInvoicesPage() {
  return <InvoicesList endpoint="/api/v1/reseller/invoices" />;
}
