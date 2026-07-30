"use client";

// Detail klien untuk reseller — 2 tab: Profil (edit) + Domain (purchases
// atas nama klien ini). Pakai component shared supaya konsisten dengan
// agent view.

import { useParams } from "next/navigation";
import { ClientDetail } from "@/components/clients/ClientDetail";

export default function ResellerClientDetailPage() {
  const { client_id } = useParams<{ client_id: string }>();
  return (
    <ClientDetail
      clientID={client_id}
      basePath="/reseller/clients"
      apiPrefix="reseller"
    />
  );
}
