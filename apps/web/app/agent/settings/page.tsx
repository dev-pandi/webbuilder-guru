"use client";

// /agent/settings — pengaturan profil agent di dalam layout portal agent
// (sidebar tetap tampil). Reuse ProfileForm shared component.

import { ProfileForm } from "@/components/ProfileForm";

export default function AgentSettingsPage() {
  return (
    <ProfileForm
      title="Pengaturan Akun"
      description="Data kontak dipakai untuk komunikasi internal reseller & sistem. Tidak muncul ke klien Anda."
    />
  );
}
