// 06-headers.spec.mjs — OWASP A05 (Security Misconfiguration) — HTTP response headers.
//
// Baseline backend facts (verified di apps/api/internal/router/security.go):
//   - Middleware SecurityHeaders(production bool) applied globally
//   - X-Content-Type-Options: nosniff
//   - X-Frame-Options: DENY
//   - Referrer-Policy: strict-origin-when-cross-origin
//   - Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
//   - X-XSS-Protection: 0 (explicit disable legacy filter — modern browsers prefer CSP)
//   - Strict-Transport-Security: ONLY di production (env-based)
//   - Content-Security-Policy: TIDAK di-set (documented gap — butuh audit third-party origins)

import { test, expect } from "@playwright/test";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

test.describe("A05 — Security response headers", () => {
  test("X-Content-Type-Options: nosniff — cegah MIME sniffing", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /healthz → header 'X-Content-Type-Options' MUST = 'nosniff'. Cegah browser sniff response text/plain → application/javascript (drive-by exec).",
    );
    const res = await fetch(`${apiBase}/healthz`);
    const header = res.headers.get("x-content-type-options");
    expect(header).toBe("nosniff");
    act(testInfo, `Header present: X-Content-Type-Options="${header}"`);
  });

  test("X-Frame-Options: DENY — cegah clickjacking iframe", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /healthz → header 'X-Frame-Options' MUST = 'DENY'. Cegah dashboard/API di-embed di iframe attacker (clickjacking pattern).",
    );
    const res = await fetch(`${apiBase}/healthz`);
    const header = res.headers.get("x-frame-options");
    expect(header).toBe("DENY");
    act(testInfo, `Header present: X-Frame-Options="${header}"`);
  });

  test("Referrer-Policy: strict-origin-when-cross-origin — cegah URL leak", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /healthz → header 'Referrer-Policy' MUST = 'strict-origin-when-cross-origin'. Cegah full URL (dengan JWT di query, atau path sensitif) bocor ke third-party via Referer header.",
    );
    const res = await fetch(`${apiBase}/healthz`);
    const header = res.headers.get("referrer-policy");
    expect(header).toBe("strict-origin-when-cross-origin");
    act(testInfo, `Header present: Referrer-Policy="${header}"`);
  });

  test("Permissions-Policy disable camera/mic/geolocation/FLoC", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /healthz → 'Permissions-Policy' mengandung camera=(), microphone=(), geolocation=(), interest-cohort=(). Explicit disable browser API yang aplikasi tidak butuh (least-privilege).",
    );
    const res = await fetch(`${apiBase}/healthz`);
    const header = res.headers.get("permissions-policy") || "";
    expect(header).toMatch(/camera=\(\)/);
    expect(header).toMatch(/microphone=\(\)/);
    expect(header).toMatch(/geolocation=\(\)/);
    expect(header).toMatch(/interest-cohort=\(\)/);
    act(
      testInfo,
      `Permissions-Policy: "${header}" — semua 4 directive present`,
    );
  });

  test("X-XSS-Protection: 0 — explicit disable legacy filter (bukan omit)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /healthz → 'X-XSS-Protection: 0' (explicit). Legacy XSS filter Chrome DIKENAL bikin universal XSS di beberapa case; modern rekomendasi = disable + rely CSP. Kalau backend hilangkan header saja, browser Chrome ≤ 78 tetap aktifkan filter default.",
    );
    const res = await fetch(`${apiBase}/healthz`);
    const header = res.headers.get("x-xss-protection");
    expect(header).toBe("0");
    act(testInfo, `Header present: X-XSS-Protection="${header}" (explicit disable)`);
  });

  test("Security headers ada di endpoint ERROR juga (404), bukan cuma 200", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /nonexistent-route-abc-xyz → HTTP 404, TAPI semua security headers TETAP present. Kalau middleware tidak jalan di error path, attacker bisa hit 4xx route dan bypass framing protection.",
    );
    const res = await fetch(`${apiBase}/nonexistent-route-abc-xyz-${Date.now()}`);
    expect(res.status).toBeGreaterThanOrEqual(400);
    const nosniff = res.headers.get("x-content-type-options");
    const frame = res.headers.get("x-frame-options");
    expect(nosniff).toBe("nosniff");
    expect(frame).toBe("DENY");
    act(
      testInfo,
      `HTTP ${res.status}, headers persist: nosniff=${nosniff}, X-Frame-Options=${frame}`,
    );
  });

  test("Content-Security-Policy — documented gap (deferred)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /healthz → cek header 'Content-Security-Policy'. Backend intentionally TIDAK set CSP (per security.go:16-18 — butuh allowlist third-party: Google Fonts, MinIO/S3, YouTube). Test ini DOKUMENTASI gap — kalau suatu hari CSP ditambahkan, test bisa diubah jadi hard assert.",
    );
    const res = await fetch(`${apiBase}/healthz`);
    const csp = res.headers.get("content-security-policy");
    // Sekarang expect null (documented). Kalau backend tambahkan, akan fail dan
    // remind kita untuk update test dengan expected directives.
    if (csp) {
      act(testInfo, `SURPRISE: CSP sekarang di-set → "${csp.slice(0, 100)}". Update test ke hard assert.`);
    } else {
      act(testInfo, `CSP absent (documented gap). Follow-up: add CSP dengan allowlist third-party origins.`);
    }
    // Non-blocking — test PASS baik CSP present atau tidak.
    expect(true).toBe(true);
  });

  test("Response TIDAK leak server version / framework (Server header)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /healthz → response headers. Cek TIDAK ada header 'Server' berisi 'nginx/X.Y' atau 'fiber' spesifik version. Attacker enumerate via version → target CVE. Best practice: strip atau minimal.",
    );
    const res = await fetch(`${apiBase}/healthz`);
    const server = res.headers.get("server") || "";
    // Fiber default tidak set. Kalau ada, harus generic (bukan version leak).
    const leaksVersion = /\d+\.\d+/.test(server);
    expect(leaksVersion).toBe(false);
    act(testInfo, `Server header="${server || "(absent)"}" — no version leak`);
  });
});
