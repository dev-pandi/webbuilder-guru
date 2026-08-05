"use client";

// Reseller domain detail — pakai DomainDetail shared component dengan
// basePath /reseller/domains supaya back-link kembali ke layout portal
// reseller. Default endpointPrefix /api/v1/domains works untuk self-purchase.
// Domain klien via on-behalf-of buka lewat link di /reseller/collaborators.

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function ResellerDomainDetailPage() {
  return <DomainDetail basePath="/reseller/domains" />;
}
