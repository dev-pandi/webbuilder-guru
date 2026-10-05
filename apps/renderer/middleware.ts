// Global middleware — jalankan per-request untuk SEMUA route renderer.
// Dua tugas:
//   1. Set `Vary: Host` → cegah downstream cache cross-tenant leak
//   2. Generate nonce + CSP header → fix WEBSEC03 (W3C CSP3) — tidak lagi
//      pakai 'unsafe-inline' / 'unsafe-eval' di script-src
//
// Multi-tenant note: CSP sama untuk semua tenant karena renderer serve
// konten pattern yang sama (user markdown + guru blocks). Kalau tenant
// butuh embed custom (mis. widget pihak ke-3), tambah ke script-src/frame-src.

import { NextResponse, type NextRequest } from "next/server";

const IS_PROD = process.env.NODE_ENV === "production";

export function middleware(req: NextRequest) {
  // Nonce — 16 bytes base64 ≈ 22 char, 128-bit entropy. Fresh per request.
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  );

  // CSP tenant renderer — permisif untuk embed (YouTube, Spotify, Maps) karena
  // guru boleh pakai di tulisan. Tetap drop 'unsafe-inline'/'unsafe-eval' di
  // script-src → W3C CSP3 compliance.
  //
  // frame-ancestors * : tenant site boleh di-iframe (editor preview + user
  // share link). Ini security trade-off khas platform multi-tenant site builder.
  const prodCsp = [
    `default-src 'self'`,
    `script-src 'nonce-${nonce}' 'strict-dynamic' https:`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' https://api.kubaca.id https:`,
    `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.google.com`,
    `media-src 'self' blob: https:`,
    `frame-ancestors *`,
    `base-uri 'self'`,
    `form-action 'self' https://api.kubaca.id`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const devCsp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' http://localhost:* ws://localhost:* https:`,
    `frame-src *`,
    `frame-ancestors *`,
  ].join("; ");

  const csp = IS_PROD ? prodCsp : devCsp;

  // CRITICAL: CSP header harus di-set di BOTH request + response headers.
  // - Request header → trigger Next.js server rendering auto-inject nonce
  //   ke <script> internal (bootstrap, RSC flight, hydration bootstrap).
  //   Tanpa ini: script internal tidak nonce'd → kena blok "inline script".
  // - Response header → enforce di browser.
  // Pattern dari Next.js official docs.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: reqHeaders } });

  // Vary: Host — defensive cache isolation (multi-tenant). Append (bukan
  // replace) supaya kalau route sudah set Vary lain, keep + append Host.
  const existing = res.headers.get("Vary");
  if (existing) {
    if (!existing.toLowerCase().split(",").map((s) => s.trim()).includes("host")) {
      res.headers.set("Vary", `${existing}, Host`);
    }
  } else {
    res.headers.set("Vary", "Host");
  }

  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf)$).*)",
  ],
};
