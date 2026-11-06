// Bersama dipakai daftar + detail aduan. Terpisah dari page.tsx karena
// Next App Router menolak ekspor nilai selain default dari file page.

export type AbuseReport = {
  id: string;
  reported_url: string;
  reported_host: string;
  category: string;
  description: string;
  reporter_name: string;
  reporter_email: string;
  status: "baru" | "ditinjau" | "ditindak" | "ditolak";
  site_id?: string;
  admin_note: string;
  handled_at?: string;
  created_at: string;
  file_count: number;
};

export const CATEGORY_LABEL: Record<string, string> = {
  judi_online: "Judi online",
  pornografi: "Pornografi",
  penipuan: "Penipuan",
  phishing_malware: "Phishing / malware",
  sara_kebencian: "SARA / kebencian",
  hoaks: "Hoaks",
  hak_cipta: "Hak cipta",
  lainnya: "Lainnya",
};

export const STATUS_META: Record<
  AbuseReport["status"],
  { label: string; variant: "destructive" | "warning" | "success" | "secondary" }
> = {
  baru: { label: "Baru", variant: "destructive" },
  ditinjau: { label: "Ditinjau", variant: "warning" },
  ditindak: { label: "Ditindak", variant: "success" },
  ditolak: { label: "Ditolak", variant: "secondary" },
};

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
