"use client";

// Halaman "Dokumen" — kelola library dokumen (KTP/NPWP) yang dipakai saat
// registrasi domain yang butuh verifikasi identitas. Dokumen di-upload
// sekali di sini → bisa di-pre-attach saat checkout domain (skip step
// upload post-payment).
//
// Semua flow passthrough ke registrar via /api/v1/documents — web builder
// TIDAK simpan file (single source of truth = registrar).

import { DocumentsCard } from "./_documents-card";

export default function DocumentsSettingsPage() {
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
