"use client";

// Agent domains list — pakai DomainsList shared component. basePath diset
// ke /agent/domains supaya detail page navigate ke layout agent (sidebar
// tidak lompat ke settings).
//
// `endpoint` override ke /agent/purchases karena agent portal fokus ke
// domain yang di-trigger on-behalf-of client. Default endpoint scope by
// user_id = caller — on-behalf-of (user_id = client, purchased_by = agent)
// tidak muncul di sana.

import { DomainsList } from "@/components/domains/DomainsList";

export default function AgentDomainsPage() {
  return (
    <DomainsList
      basePath="/agent/domains"
      endpoint="/api/v1/agent/purchases?limit=100"
      domainsEndpoint="/api/v1/agent/domains"
    />
  );
}
