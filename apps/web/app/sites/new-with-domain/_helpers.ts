// Helpers pure — formatting + error mapping. Tanpa React import supaya bisa
// unit-test terpisah tanpa render.

import type { Me } from "./_types";

// Wajib untuk EPP CREATE contact — registrar (PANDI/newTLD) reject dengan
// "State is required" atau serupa kalau kolom ini kosong. State ditambah
// setelah insiden EPP code=2005 karena provinsi kosong di kontak klien.
export const REQUIRED_PROFILE_FIELDS: Array<keyof Me> = [
  "name",
  "phone_number",
  "address",
  "city",
  "state",
  "postal_code",
];

export const FIELD_LABEL: Record<string, string> = {
  name: "Nama",
  phone_number: "Nomor HP",
  address: "Alamat",
  city: "Kota",
  state: "Provinsi",
  postal_code: "Kode Pos",
  nik: "NIK (KTP)",
};

export function formatIDR(amount: number, currency: string): string {
  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return `${currency} ${amount.toLocaleString("id-ID")}`;
}

// friendlyError memetakan raw error dari backend/registrar ke pesan ID
// yang meaningful. Fallback ke raw message kalau tidak match pattern.
export function friendlyError(raw: string, tld?: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("tidak di-allow") || lower.includes("zone_not_allowed")) {
    return tld
      ? `TLD .${tld} belum tersedia untuk akun ini. Coba TLD lain atau hubungi admin.`
      : "TLD ini belum tersedia untuk akun Anda. Coba TLD lain atau hubungi admin.";
  }
  if (lower.includes("profile_incomplete")) {
    return "Lengkapi profil dulu di halaman Pengaturan → Profil.";
  }
  if (lower.includes("nik_required") || lower.includes("contact.nik") || lower.includes("nik wajib")) {
    return "Domain ini butuh NIK (KTP) dari registrar. Isi NIK di Pengaturan → Profil dulu.";
  }
  if (lower.includes("domain tidak tersedia") || lower.includes("already registered")) {
    return "Domain ini sudah dimiliki orang lain. Coba nama lain.";
  }
  if (lower.includes("sld minimal") || lower.includes("format domain tidak valid")) {
    return "Format domain tidak valid. Ketik minimal 2 karakter atau lengkap dengan extension.";
  }
  if (lower.includes("registrar_error") || lower.includes("bad gateway")) {
    return "Registrar sedang bermasalah. Coba beberapa saat lagi.";
  }
  return raw;
}

// missingProfileFields — daftar field kosong dari profile. NIK SELALU
// opsional di sisi frontend — kalau registrar zone butuh NIK (mis. .id per
// regulasi Kemenkominfo), backend yang tangkap + balik pesan Indonesia
// yang jelas. Kita tidak mau block user di sini karena kebanyakan TLD
// (.com/.net/dst.) tidak butuh NIK.
export function missingProfileFields(me: Me | null): Array<keyof Me> {
  if (!me) return [];
  return REQUIRED_PROFILE_FIELDS.filter(
    (k) => !((me as Record<string, unknown>)[k] || "").toString().trim(),
  );
}
