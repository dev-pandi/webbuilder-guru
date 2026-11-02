"use client";

import { useParams } from "next/navigation";
import { ClientEditLoader } from "@/components/clients/ClientEditLoader";

export default function EditClientPage() {
  const { client_id } = useParams<{ client_id: string }>();
  return (
    <ClientEditLoader
      clientID={client_id}
      basePath="/reseller/clients"
      apiPrefix="reseller"
    />
  );
}
