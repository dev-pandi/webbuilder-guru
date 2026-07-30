"use client";

// Reseller domains list — pakai DomainsList shared component. basePath diset
// ke /reseller/domains supaya detail page navigate ke reseller layout, bukan
// settings layout (sidebar tidak hilang).
//
// `endpoint` override ke /reseller/purchases karena reseller portal fokus
// ke domain yang di-trigger on-behalf-of client. Default endpoint
// /domains/purchases scope by user_id = caller — jadi on-behalf-of
// (user_id = client, purchased_by = caller) tidak muncul.

import { DomainsList } from "@/components/domains/DomainsList";

export default function ResellerDomainsPage() {
  return (
    <DomainsList
      basePath="/reseller/domains"
      endpoint="/api/v1/reseller/purchases?limit=100"
    />
  );
}
