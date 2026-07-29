"use client";

// Reseller domains list — pakai DomainsList shared component. basePath diset
// ke /reseller/domains supaya detail page navigate ke reseller layout, bukan
// settings layout (sidebar tidak hilang).

import { DomainsList } from "@/components/domains/DomainsList";

export default function ResellerDomainsPage() {
  return <DomainsList basePath="/reseller/domains" />;
}
