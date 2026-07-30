"use client";

// Agent domain detail — pakai DomainDetail shared component dengan basePath
// /agent/domains supaya back-link kembali ke layout portal agent.
//
// `listEndpoint` override ke /agent/purchases karena default
// /domains/purchases scope by user_id (self-purchase). Agent yang beli
// on-behalf-of client punya user_id=client, purchased_by=agent — hanya
// muncul di /agent/purchases.

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function AgentDomainDetailPage() {
  return (
    <DomainDetail
      basePath="/agent/domains"
      listEndpoint="/api/v1/agent/purchases?limit=100"
    />
  );
}
