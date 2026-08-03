"use client";

// Reseller invoice list — arahkan ke /settings/invoices canonical page.
//
// Legacy: pakai component InvoicesList dengan endpoint /reseller/invoices
// yang fan-out ke registrar-api. Post-cleanup: aggregate reseller (self +
// client managed) belum di-implement di local invoices — sementara reseller
// lihat invoice diri sendiri saja.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResellerInvoicesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/invoices");
  }, [router]);
  return null;
}
