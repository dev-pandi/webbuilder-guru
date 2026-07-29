"use client";

// Profile settings — edit contact/postal fields untuk domain registry
// integration (WHOIS + EPP contact object). Logika di-share via
// ProfileForm component supaya reseller/agent portal bisa pakai form
// yang sama tanpa keluar dari layout mereka.

import { ProfileForm } from "@/components/ProfileForm";

export default function ProfilePage() {
  return <ProfileForm />;
}
