// Dynamic robots.txt per host. Sederhana untuk MVP:
//   - Allow semua crawler (User-agent: *)
//   - Point ke sitemap.xml di host yang sama
//   - Disallow preview draft (`_preview/*`)
//
// Kalau nanti butuh per-site kontrol (e.g., user mau block noindex all),
// bisa tambah `site.robots_txt` custom di DB dan render dari situ.
//
// CRITICAL: Konten HOST-DEPENDENT (Sitemap URL). Sebelumnya `revalidate=3600`
// bikin ISR cache 1 jam keyed by URL saja → cross-tenant leak (domain A
// visit → cached → domain B visit dalam 1 jam dapat robots.txt domain A
// dengan Sitemap URL yang salah). Fix: force-dynamic + Vary: Host header.

import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  const host = (await headers()).get("host") ?? "";
  const baseURL = host ? `https://${host}` : "";

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /_preview/",
    "",
    baseURL ? `Sitemap: ${baseURL}/sitemap.xml` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return new NextResponse(body + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Downstream cache OK, tapi WAJIB include Vary: Host supaya cache
      // key tidak collapse ke URL saja (host-dependent content).
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      Vary: "Host",
    },
  });
}
