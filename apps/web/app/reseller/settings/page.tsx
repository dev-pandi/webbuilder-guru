"use client";

// /reseller/settings — pengaturan profil reseller di dalam layout portal
// reseller (sidebar tetap tampil). Reuse ProfileForm shared component.

import { ProfileForm } from "@/components/ProfileForm";

export default function ResellerSettingsPage() {
  return (
    <ProfileForm
      title="Pengaturan Akun"
      description="Data kontak & alamat dipakai sebagai WHOIS contact + invoice saat Anda beli domain untuk diri sendiri atau atas nama klien."
    />
  );
}
