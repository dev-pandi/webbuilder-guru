"use client";

// Admin domain detail — reuse DomainDetail shared component dengan endpoint
// admin (`/api/v1/admin/domains`) yang bypass ownership check. Cocok untuk
// troubleshoot "domain user X tidak accessible".

import { DomainDetail } from "@/components/domains/DomainDetail";

export default function AdminDomainDetailPage() {
  return (
    <DomainDetail
      basePath="/admin/domain"
      endpointPrefix="/api/v1/admin/domains"
      adminMode
    />
  );
}
