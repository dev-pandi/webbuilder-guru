// Global middleware — generate nonce per request + set strict CSP header
// supaya scan security (WEBSEC03) tidak flag 'unsafe-inline'/'unsafe-eval'
// di script-src.
//
// Flow nonce:
//   1. Middleware generate random nonce (crypto.randomUUID base64) per request
//   2. Set `x-nonce` request header → downstream Server Components bisa baca
//      via `headers().get("x-nonce")` dan apply ke custom <Script nonce=...>
//   3. Next.js 14+ auto-inject nonce di tag `<script>` internal (RSC flight,
//      hydration bootstrap, dsb) WHEN CSP response header contains nonce
//   4. Set response Content-Security-Policy dengan 'nonce-XXX' 'strict-dynamic'
//      → browser cuma trust script yang punya nonce + script yang di-loaded
//      oleh nonce'd script (strict-dynamic)
//
// Mode `script-src 'nonce-XXX' 'strict-dynamic'` adalah W3C CSP3 recommendation
// untuk SPA/bundled apps. 'unsafe-inline' dan 'unsafe-eval' DROP sepenuhnya.
//
// Dev vs Prod: Next.js dev mode butuh 'unsafe-eval' untuk Fast Refresh.
// Di dev, CSP di-loose (atau skip middleware); prod strict.

import { NextResponse, type NextRequest } from "next/server";

const IS_PROD = process.env.NODE_ENV === "production";

export function middleware(req: NextRequest) {
  // Generate nonce — 16 bytes = 128 bit entropy, base64 ~22 char.
  // Crypto.randomUUID juga OK (36 char) tapi UUID visual terkesan "ID",
  // bukan opaque secret. Pakai random bytes.
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  );

  // Build CSP sesuai W3C CSP3 recommendation.
  // - script-src: nonce + strict-dynamic (SPA-friendly, no unsafe-inline)
  // - style-src: tetap 'unsafe-inline' — Tailwind + Next.js inject inline
  //   <style>, susah di-nonce semuanya. CSP3 anggap style inline lebih
  //   rendah risk daripada script (tidak eksekusi code). securityheaders.com
  //   TIDAK deduct kalau style-src pakai unsafe-inline.
  // - connect-src: eksplisit ke API + same-origin
  // - font/style: Google Fonts allowed
  // - frame-ancestors 'self': dashboard tidak boleh di-embed di site lain
  const prodCsp = [
    `default-src 'self'`,
    `script-src 'nonce-${nonce}' 'strict-dynamic' https:`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' https://api.kubaca.id https://*.kubaca.id`,
    `frame-src 'self' https://*.kubaca.id https:`,
    `frame-ancestors 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  // Dev: skip strict script-src karena Fast Refresh butuh unsafe-eval.
  // Browser-side scan tetap di-run di prod — dev loose tidak masalah.
  const devCsp = [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' http://localhost:* ws://localhost:* https:`,
    `frame-src *`,
    `frame-ancestors 'self'`,
  ].join("; ");

  const csp = IS_PROD ? prodCsp : devCsp;

  // Forward nonce ke downstream (Server Components, Route Handlers)
  // via REQUEST header. Pattern Next.js 14 docs.
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  // Set CSP di response — overrides apapun yang Caddy set di hop sebelumnya.
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

// Skip static assets + Next.js internals — CSP header hanya relevan untuk
// HTML/document response. Static chunks diakses dengan referer HTML yang
// sudah carry CSP, no need to re-set.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|pdf)$).*)",
  ],
};
