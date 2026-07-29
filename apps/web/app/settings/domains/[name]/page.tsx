"use client";

// Detail 1 domain (overview + WHOIS + nameservers). Logika di
// DomainDetail component, di-share dengan reseller/agent portal.

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function DomainDetailPage() {
  return <DomainDetail basePath="/settings/domains" />;
}
