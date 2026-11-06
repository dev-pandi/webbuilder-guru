import { headers } from "next/headers";

import { SuspendedNotice } from "@/components/SuspendedNotice";
import { lookupSiteByHost } from "@/lib/api";

// Semua rute situs (halaman, artikel, blog, produk, materi) memanggil
// notFound() begitu site-by-host tidak OK — termasuk saat situs/domain
// ditangguhkan (451). Membedakannya di sini membuat SEMUA rute menampilkan
// pemberitahuan penangguhan tanpa mengubah tiap rute satu per satu.
export default async function NotFound() {
  const host = ((await headers()).get("host") ?? "").toLowerCase().split(":")[0];
  if (host) {
    try {
      const lookup = await lookupSiteByHost(host);
      if (lookup.kind === "suspended") return <SuspendedNotice />;
    } catch {
      // Backend bermasalah → cukup tampilkan 404 biasa di bawah.
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="text-4xl font-bold">404</h1>
        <p className="mt-2 opacity-70">Halaman tidak ditemukan.</p>
      </div>
    </main>
  );
}
