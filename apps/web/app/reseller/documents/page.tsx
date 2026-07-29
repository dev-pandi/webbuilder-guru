"use client";

// Reseller documents — library KTP/NPWP untuk domain yang butuh verifikasi.
// DocumentsCard shared dengan /settings/documents.

import { DocumentsCard } from "@/components/documents/DocumentsCard";

export default function ResellerDocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dokumen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Library KTP/NPWP untuk verifikasi domain yang butuh dokumen
          (mis. <code>.id</code>). Upload sekali, pilih saat checkout supaya
          proses langsung provisioning tanpa step upload tambahan.
        </p>
      </div>

      <DocumentsCard />
    </div>
  );
}
