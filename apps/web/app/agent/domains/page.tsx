"use client";

// Agent domains list — pakai DomainsList shared component. basePath diset
// ke /agent/domains supaya detail page navigate ke layout agent (sidebar
// tidak lompat ke settings).

import { DomainsList } from "@/components/domains/DomainsList";

export default function AgentDomainsPage() {
  return <DomainsList basePath="/agent/domains" />;
}
