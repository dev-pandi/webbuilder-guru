"use client";

// Agent invoice list — pakai InvoicesList shared component.
//
// `endpoint` override ke /agent/invoices karena default /invoices scope by
// external_user_id = caller — invoice on-behalf-of tagged external_user_id
// = client. Endpoint /agent/invoices fan-out aggregate self + semua client
// yang di-manage agent (bukan reseller induk atau agent lain).

import { InvoicesList } from "@/components/invoices/InvoicesList";

export default function AgentInvoicesPage() {
  return <InvoicesList endpoint="/api/v1/agent/invoices" />;
}
