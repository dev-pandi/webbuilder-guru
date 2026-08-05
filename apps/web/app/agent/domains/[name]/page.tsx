"use client";

// Agent domain detail — pakai DomainDetail shared component dengan basePath
// /agent/domains supaya back-link kembali ke layout portal agent. Default
// endpointPrefix /api/v1/domains works untuk self-purchase agent. Untuk
// domain klien (on-behalf-of), agent buka via link di /agent/collaborators.

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function AgentDomainDetailPage() {
  return <DomainDetail basePath="/agent/domains" />;
}
