// Dynamic robots.txt per host. Sederhana untuk MVP:
//   - Allow semua crawler (User-agent: *)
//   - Point ke sitemap.xml di host yang sama
//   - Disallow preview draft (`_preview/*`)
//
// Kalau nanti butuh per-site kontrol (e.g., user mau block noindex all),
// bisa tambah `site.robots_txt` custom di DB dan render dari situ.

import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const revalidate = 3600; // 1 jam — jarang berubah

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
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}
