"use client";

// "Domain Saya" — list semua purchase user. Logika di-share via DomainsList
// component supaya reseller/agent portal bisa pakai UI yang sama tanpa
// keluar dari layout mereka.

import { DomainsList } from "@/components/domains/DomainsList";

export default function DomainsSettingsPage() {
  return <DomainsList basePath="/settings/domains" />;
}
