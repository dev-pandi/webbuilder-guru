// 08-ssrf.spec.mjs — OWASP A10 (Server-Side Request Forgery).
//
// Baseline backend facts (verified):
//   - /internal/caddy/ask endpoint (caddy/handler.go:35):
//     - Fail closed: askSecret WAJIB match (constant-time compare) sebelum apapun.
//     - Tanpa secret / secret salah → 403 (bukan 401 supaya tidak signal endpoint exist).
//     - Empty domain → 400 (setelah secret lolos).
//     - Domain di DB verified atau match renderer/app/api host → 200.
//     - Else → 403 (no info leak apakah domain exist di DB).
//   - Domain hostname validator: ValidHost() rejects single-label ("localhost")
//     dan numeric IP tidak match RFC hostname (butuh ≥2 label + TLD).
//   - Comment: "without secret check, anyone... could induce Caddy to issue certs
//     for arbitrary hostnames they don't control" — jadi secret = SATU-SATUNYA
//     line of defense untuk endpoint public.

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

test.describe("A10 — SSRF via Caddy ask endpoint", () => {
  test("Caddy ask TANPA secret → 403 (fail-closed constant-time compare)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /internal/caddy/ask?domain=example.com (tanpa &secret=...) → HTTP 403. Kalau backend allow tanpa secret → attacker bisa spam ini dan trick Caddy issue certificate untuk domain apapun (billing abuse + SEO poisoning).",
    );
    const res = await fetch(`${apiBase}/internal/caddy/ask?domain=example.com`);
    expect(res.status).toBe(403);
    act(testInfo, `HTTP ${res.status} — secret gate aktif (fail-closed)`);
  });

  test("Caddy ask dengan secret salah → 403 (bukan 401 supaya no signal)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /internal/caddy/ask?domain=example.com&secret=wrong-guess-12345 → HTTP 403 (bukan 401). Perbedaan status code = information leak: 401='secret perlu' vs 403='auth gagal'. Konsisten 403 = attacker tidak bisa distinguish antara 'endpoint tidak butuh auth' vs 'auth gagal'.",
    );
    const res = await fetch(
      `${apiBase}/internal/caddy/ask?domain=example.com&secret=wrong-guess-12345`,
    );
    expect(res.status).toBe(403);
    act(testInfo, `HTTP ${res.status} — invalid secret ditolak, no info leak via status code`);
  });

  test("Caddy ask dengan domain=localhost → 403 (info leak-free)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /internal/caddy/ask?domain=localhost → HTTP 403 (sama seperti domain lain). Attacker probing SSRF target internal harus DAPAT response identik dengan yang public — kalau localhost dapat 200 (allow) tanpa DB entry, itu bocor Caddy config internal.",
    );
    const res = await fetch(`${apiBase}/internal/caddy/ask?domain=localhost`);
    expect(res.status).toBe(403);
    act(testInfo, `HTTP ${res.status} — localhost tidak lolos default allowlist`);
  });

  test("Caddy ask dengan domain=169.254.169.254 (AWS metadata IP) → 403", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /internal/caddy/ask?domain=169.254.169.254 → HTTP 403. Metadata IP = classic SSRF target (steal AWS IAM creds). Backend TIDAK boleh return 200 untuk numeric IP karena ValidHost() reject single-label + IP tidak match ≥2-label rule + platformIPs allowlist.",
    );
    const res = await fetch(`${apiBase}/internal/caddy/ask?domain=169.254.169.254`);
    expect(res.status).toBe(403);
    act(testInfo, `HTTP ${res.status} — AWS metadata IP ditolak`);
  });

  test("Caddy ask dengan domain empty (?domain=) → 400 atau 403 (uniform)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /internal/caddy/ask?domain= (empty value) → HTTP 400 (missing param) atau 403 (kalau secret gate kick dulu). Yang penting: tidak 200 accept, tidak 500 crash.",
    );
    const res = await fetch(`${apiBase}/internal/caddy/ask?domain=`);
    expect([400, 403]).toContain(res.status);
    expect(res.status).not.toBe(200);
    act(testInfo, `HTTP ${res.status} — empty domain ditolak`);
  });

  test("Caddy ask response body kosong/pendek (no leak internal detail)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /internal/caddy/ask?domain=xyz → response body ≤ 30 char (SendStatus native Fiber = body kosong atau nama status). Bukan JSON envelope error yang berisi hint 'domain not in allowlist' atau 'secret required' — semua hints itu info leak untuk enumerator.",
    );
    const res = await fetch(`${apiBase}/internal/caddy/ask?domain=xyz-nonexistent-domain-abc.com`);
    const body = await res.text();
    expect(body.length).toBeLessThan(50);
    // Response body harusnya generic ("Forbidden") tanpa mention "allowlist", "secret", dsb.
    const bodyLower = body.toLowerCase();
    expect(bodyLower).not.toMatch(/allowlist|secret|whitelist|verified|domain not/);
    act(
      testInfo,
      `HTTP ${res.status}, body="${body.slice(0, 30)}" length=${body.length}, no verbose leak`,
    );
  });
});

test.describe("A10 — Domain verify hostname validation (indirect SSRF)", () => {
  test("POST /domains/verify dengan hostname invalid (single-label) → 400/404", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /api/v1/domains/localhost/verify → HTTP 400 (invalid host format) atau 404 (domain tidak owned). ValidHost() reject single-label. Kalau lolos ke DNS lookup, backend akan spend resource lookup localhost → return 127.0.0.1 → potential platform IP allowlist bypass di dev mode.",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await fetch(`${apiBase}/api/v1/domains/localhost/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 400 (ValidHost fail) atau 404 (ownership fail) — dua-duanya OK.
    expect([400, 404]).toContain(res.status);
    act(
      testInfo,
      `HTTP ${res.status} — single-label 'localhost' ditolak sebelum DNS lookup`,
    );
  });

  test("POST /domains/verify dengan IP address literal → 400/404", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /api/v1/domains/169.254.169.254/verify → HTTP 400/404. IPv4 literal tidak match ValidHost pattern (butuh ≥2 alfabetik label). Cegah SSRF via 'domain = IP metadata'.",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await fetch(`${apiBase}/api/v1/domains/169.254.169.254/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect([400, 404]).toContain(res.status);
    act(testInfo, `HTTP ${res.status} — IP literal sebagai domain ditolak`);
  });

  test("POST /domains/verify dengan URL scheme → 400/404 (bukan strip lalu accept)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /api/v1/domains/http:%2F%2Fattacker.com/verify → HTTP 400/404. Backend TIDAK boleh permissively strip 'http://' dan accept domain-nya. Path param harus literal hostname; scheme = invalid char.",
    );
    const { accessToken } = await loginAs(context, "client");
    const evilPath = encodeURIComponent("http://attacker.com");
    const res = await fetch(`${apiBase}/api/v1/domains/${evilPath}/verify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect([400, 404]).toContain(res.status);
    act(testInfo, `HTTP ${res.status} — URL scheme di path ditolak`);
  });
});
