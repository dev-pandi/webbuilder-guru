// 02-jwt.spec.mjs — OWASP A02 (Cryptographic Failures) — JWT hardening.
// Baseline backend facts (verified di apps/api/internal/auth/jwt.go):
//   - Library: golang-jwt/jwt v5
//   - jwt.go:47-48 — explicit type-check *jwt.SigningMethodHMAC → reject non-HMAC
//     (alg=none pakai SigningMethodNone → tidak match assertion → error)
//   - Access token TTL 15m, refresh 7d
//
// Test approach: kita CRAFT JWT manual dengan header/payload/signature yang salah,
// lalu verifikasi backend reject. Tidak butuh secret asli — kita cuma test rejection path.

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

// Base64url encode (JWT-safe: no padding, +/ → -_)
function b64u(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

test.describe("A02 — JWT hardening", () => {
  test("JWT dengan alg=none ditolak → 401 (bukan 200 impersonation) @smoke", async ({}, testInfo) => {
    req(
      testInfo,
      "Craft JWT dengan header {alg:'none', typ:'JWT'} + payload role='admin' + signature kosong → GET /auth/me → HTTP 401. Backend golang-jwt v5 jwt.go:47 harus reject via type-check SigningMethodHMAC. Kalau lolos → CRITICAL: attacker bisa impersonate siapa saja.",
    );
    const header = b64u(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = b64u(
      JSON.stringify({
        sub: "00000000-0000-4000-8000-000000000001",
        email: "attacker@example.com",
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      }),
    );
    // alg=none → signature harus kosong
    const forgedJwt = `${header}.${payload}.`;

    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${forgedJwt}` },
    });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body.toLowerCase()).not.toMatch(/attacker@example\.com/);
    act(
      testInfo,
      `HTTP ${res.status}, forged alg=none ditolak, body tidak echo payload attacker`,
    );
  });

  test("JWT dengan signature tampered → 401", async ({ context }, testInfo) => {
    req(
      testInfo,
      "Ambil access_token valid, flip 1 char di segment signature → GET /auth/me → HTTP 401. HMAC verify HARUS gagal karena signature = MAC atas header+payload dengan secret; ubah 1 byte → mismatch.",
    );
    const { accessToken } = await loginAs(context, "client");
    const parts = accessToken.split(".");
    expect(parts.length).toBe(3); // header.payload.signature

    // Flip last char of signature
    const sig = parts[2];
    const flippedChar = sig.slice(-1) === "A" ? "B" : "A";
    const tamperedSig = sig.slice(0, -1) + flippedChar;
    const tamperedJwt = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${tamperedJwt}` },
    });
    expect(res.status).toBe(401);
    act(
      testInfo,
      `HTTP ${res.status}, signature 1-char flip ditolak (HMAC verify pass integrity check)`,
    );
  });

  test("JWT dengan payload tampered (elevate role client→admin) → 401 @smoke", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "Ambil access_token client, decode payload, ubah role='admin', re-encode WITHOUT re-sign → GET /admin/stats → HTTP 401 (signature mismatch). Kalau lolos → catastrophic role escalation.",
    );
    const { accessToken } = await loginAs(context, "client");
    const parts = accessToken.split(".");

    // Decode payload dari b64url
    const payloadRaw = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString();
    const payload = JSON.parse(payloadRaw);
    payload.role = "admin"; // elevation attempt
    const tamperedPayload = b64u(JSON.stringify(payload));
    const forgedJwt = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const res = await fetch(`${apiBase}/api/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${forgedJwt}` },
    });
    // 401 (signature verify fail) — bukan 403 (yang berarti sig lolos tapi role check gagal),
    // bukan 200 (yang berarti elevation berhasil = CRITICAL).
    expect(res.status).toBe(401);
    act(
      testInfo,
      `HTTP ${res.status}, role-elevation payload tamper ditolak sebelum RBAC middleware`,
    );
  });

  test("JWT expired ditolak → 401", async ({}, testInfo) => {
    req(
      testInfo,
      "Craft JWT dengan exp = 1 jam lalu (backdated). Meski HMAC signature valid, backend HARUS reject karena expired claim. Signature palsu OK di sini — kita test claim exp validation kick sebelum atau setelah signature, either way 401.",
    );
    const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = b64u(
      JSON.stringify({
        sub: "00000000-0000-4000-8000-000000000001",
        email: "expired@example.com",
        role: "admin",
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 jam lalu
        iat: Math.floor(Date.now() / 1000) - 7200,
      }),
    );
    // Signature dummy — kita tidak punya secret; expected reject di signature ATAU exp claim.
    const dummySignature = b64u("dummy-signature-not-real-hmac");
    const expiredJwt = `${header}.${payload}.${dummySignature}`;

    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${expiredJwt}` },
    });
    expect(res.status).toBe(401);
    act(testInfo, `HTTP ${res.status}, expired/invalid JWT ditolak`);
  });

  test("Login response TIDAK leak password hash / sensitive fields", async ({}, testInfo) => {
    req(
      testInfo,
      "POST /auth/login → response body inspect: WAJIB berisi access_token + refresh_token; TIDAK boleh berisi password_hash, argon2$..., atau field internal DB. Access token JWT length ≥ 100 char (JWT typical), refresh opaque atau JWT.",
    );

    // Retry-on-429: Fiber login limiter 5/menit per IP. Test ini bypass cache
    // (test sensitivity karena inspect response body langsung), jadi bisa
    // kena 429 kalau QA suite baru saja hit /auth/login.
    let res;
    const start = Date.now();
    while (Date.now() - start < 90_000) {
      res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: process.env.CLIENT_EMAIL || "client@example.com",
          password: process.env.CLIENT_PASSWORD || "changeme123",
        }),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    expect(res.status).toBe(200);
    const bodyRaw = await res.text();

    // Sensitive field leak check
    const bodyLower = bodyRaw.toLowerCase();
    expect(bodyLower).not.toMatch(/password_hash|argon2\$|\$argon2/);
    expect(bodyLower).not.toMatch(/password":\s*"[^"]/); // raw password echo

    // Positive shape
    const body = JSON.parse(bodyRaw);
    const token = body.data?.access_token;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(100);
    expect(token.split(".").length).toBe(3); // JWT format

    act(
      testInfo,
      `HTTP 200, access_token length=${token.length}, JWT segments=3, no hash/argon2 leak in body`,
    );
  });
});
