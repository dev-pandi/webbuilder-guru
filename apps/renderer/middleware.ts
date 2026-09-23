// Global middleware — jalankan per-request untuk SEMUA route renderer.
// Tugas tunggal: tambah header `Vary: Host` di response supaya downstream
// cache (Caddy, Cloudflare, browser) tidak collapse cache key ke URL saja.
//
// Konteks: renderer multi-tenant serve banyak domain dari single Next.js
// process. Kalau downstream cache tidak lihat Host header, response untuk
// domain A bisa diserve ke domain B (cross-tenant leak).
//
// Kenapa middleware (bukan tiap route handler tambah manual):
//   - Defensive layer — tiap route.ts / page.tsx tidak perlu ingat.
//   - Coverage: sitemap, robots, page.tsx, RSC output, semua ke-cover.
//   - Zero-cost — middleware Edge runtime cepat + Next.js short-circuit
//     untuk static assets (matcher exclude `/_next/*`).
//
// Note: Middleware TIDAK mengubah cache behavior Next.js internal (ISR
// cache tetap keyed by URL). Route yang butuh per-host cache harus tetap
// `dynamic = "force-dynamic"` (sitemap + robots sudah).

import { NextResponse, type NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  // Append (bukan replace) supaya kalau route sudah set Vary lain (mis.
  // "Accept-Encoding"), keep + append Host. Header dedup di Next.js.
  const existing = res.headers.get("Vary");
  if (existing) {
    if (!existing.toLowerCase().split(",").map((s) => s.trim()).includes("host")) {
      res.headers.set("Vary", `${existing}, Host`);
    }
  } else {
    res.headers.set("Vary", "Host");
  }
  return res;
}

// Skip static assets + Next.js internals — no cache concern there, dan
// hemat overhead (middleware jalan per request).
export const config = {
  matcher: [
    // Match semua kecuali:
    //   - _next/* (Next.js chunks + static)
    //   - favicon, images assets
    //   - api routes (renderer tidak punya, tapi safe skip)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf)$).*)",
  ],
};
