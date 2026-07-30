"use client";

// Agent domain detail — pakai DomainDetail shared component dengan basePath
// /agent/domains supaya back-link kembali ke layout portal agent.

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function AgentDomainDetailPage() {
  return <DomainDetail basePath="/agent/domains" />;
}
