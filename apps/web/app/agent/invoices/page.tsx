"use client";

// Agent invoice list — redirect ke /settings/invoices canonical page.
// Aggregate on-behalf-of belum di-implement di local invoices.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AgentInvoicesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/invoices");
  }, [router]);
  return null;
}
