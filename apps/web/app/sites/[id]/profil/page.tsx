"use client";

// /sites/[id]/profil — edit profil guru dalam konteks situs (spec §13, §25).
// Data disimpan per-user (users table), UI-nya di sini supaya guru edit
// dari dashboard site — bukan dari settings global. Halaman ini di-share
// oleh <GuruProfileForm /> yang sama seperti /settings/profile-guru lama
// (deprecated).

import { GuruProfileForm } from "@/components/GuruProfileForm";

export default function SiteProfilPage() {
  return <GuruProfileForm />;
}
