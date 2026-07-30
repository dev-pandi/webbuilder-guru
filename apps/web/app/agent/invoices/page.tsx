"use client";

// Agent invoice list — pakai InvoicesList shared component. Backend
// /api/v1/invoices sudah scoped by caller.UserID, jadi agent cuma lihat
// invoice sendiri (bukan reseller induk atau agent lain).

import { InvoicesList } from "@/components/invoices/InvoicesList";

export default function AgentInvoicesPage() {
  return <InvoicesList />;
}
