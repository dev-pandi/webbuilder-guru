"use client";

// "Invoice Saya" — list invoice user. Logika di-share via InvoicesList
// component supaya reseller/agent portal bisa pakai UI yang sama tanpa
// keluar dari layout mereka.

import { InvoicesList } from "@/components/invoices/InvoicesList";

export default function InvoicesSettingsPage() {
  return <InvoicesList />;
}
