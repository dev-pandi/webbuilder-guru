"use client";

// Reseller domain detail — pakai DomainDetail shared component dengan
// basePath /reseller/domains supaya back-link kembali ke layout portal
// reseller (sidebar tidak lompat ke settings).
//
// `listEndpoint` override ke /reseller/purchases karena default
// /domains/purchases scope by user_id (self-purchase). Reseller yang beli
// on-behalf-of client punya user_id=client, purchased_by=reseller — hanya
// muncul di /reseller/purchases.

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function ResellerDomainDetailPage() {
  return (
    <DomainDetail
      basePath="/reseller/domains"
      listEndpoint="/api/v1/reseller/purchases?limit=100"
    />
  );
}
