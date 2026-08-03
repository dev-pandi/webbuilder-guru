"use client";

// Legacy webhook config sudah tidak relevan di mode self-sufficient
// (tidak ada external registrar-api yang perlu di-configure webhook-nya).
// Redirect ke halaman utama admin registrar = domain purchases observability.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminRegistrarPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/registrar/purchases");
  }, [router]);
  return null;
}
