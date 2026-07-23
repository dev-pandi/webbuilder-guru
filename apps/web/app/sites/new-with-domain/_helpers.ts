// Helpers pure — formatting + error mapping. Tanpa React import supaya bisa
// unit-test terpisah tanpa render.

import type { Me } from "./_types";

export const REQUIRED_PROFILE_FIELDS: Array<keyof Me> = [
  "name",
  "phone_number",
  "address",
  "city",
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
  if (lower.includes("nik_required")) {
    return "NIK wajib untuk domain .id. Isi NIK di Pengaturan → Profil dulu.";
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

// missingProfileFields — turunkan daftar field kosong dari profile object.
// NIK selalu opsional: kalau diisi, registrar boleh pakai untuk skip upload
// KTP di zone yang `nik_auto_approved`. Kalau kosong, purchase tetap jalan
// dan user upload dokumen di halaman pending status kalau zone butuh.
export function missingProfileFields(me: Me | null): Array<keyof Me> {
  if (!me) return [];
  return REQUIRED_PROFILE_FIELDS.filter(
    (k) => !((me as Record<string, unknown>)[k] || "").toString().trim(),
  );
}
