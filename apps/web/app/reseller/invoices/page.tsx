"use client";

// /reseller/invoices — reuse halaman /settings/invoices karena backend
// `/api/v1/invoices` sudah auto-scope untuk reseller (semua invoice tim,
// termasuk on-behalf-of purchase). Redirect client-side supaya reseller
// sidebar tetap konsisten dengan URL sinonim.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function ResellerInvoicesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/invoices");
  }, [router]);
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Membuka daftar invoice…
    </div>
  );
}
