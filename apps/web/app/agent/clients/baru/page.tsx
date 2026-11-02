"use client";

import { ClientForm } from "@/components/clients/ClientForm";

export default function NewClientPage() {
  return <ClientForm mode="create" basePath="/agent/clients" apiPrefix="agent" />;
}
