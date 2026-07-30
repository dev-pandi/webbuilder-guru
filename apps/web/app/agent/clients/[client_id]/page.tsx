"use client";

// Detail klien untuk agent — mirror /reseller/clients/[client_id].
// Endpoint scope by assignment (backend enforce ownership).

import { useParams } from "next/navigation";
import { ClientDetail } from "@/components/clients/ClientDetail";

export default function AgentClientDetailPage() {
  const { client_id } = useParams<{ client_id: string }>();
  return (
    <ClientDetail
      clientID={client_id}
      basePath="/agent/clients"
      apiPrefix="agent"
    />
  );
}
