"use client";

// Reseller domain detail — pakai DomainDetail shared component dengan
// basePath /reseller/domains supaya back-link kembali ke layout portal
// reseller (sidebar tidak lompat ke settings).

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function ResellerDomainDetailPage() {
  return <DomainDetail basePath="/reseller/domains" />;
}
