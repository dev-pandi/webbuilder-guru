"use client";

// Reseller invoice list — redirect ke /settings/invoices canonical page.
// Aggregate reseller (self + client managed) belum di-implement — reseller
// sementara lihat invoice diri sendiri saja.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ResellerInvoicesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/invoices");
  }, [router]);
  return null;
}
