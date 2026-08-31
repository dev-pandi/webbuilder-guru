// 01-auth.spec.mjs — Test authentication flow untuk semua role.
// Tanpa fixture akun test — cukup validate API login endpoint respond benar.

import { test, expect } from "@playwright/test";
import { config, deriveApiBase } from "../fixtures/accounts.mjs";
import { loginAs } from "../fixtures/auth.mjs";
import { req, act } from "../fixtures/qa.mjs";

test.describe("Auth — Login per role", () => {
  const roles = /** @type {const} */ ([
    "client",
    "agent",
    "reseller",
    "admin",
  ]);

  for (const role of roles) {
    test(`Login sebagai ${role} berhasil + dashboard bisa dibuka @smoke @cross-browser`, async ({
      context,
      page,
    }, testInfo) => {
      req(
        testInfo,
        `POST /auth/login sebagai ${role} → access_token (>20 char) + role dashboard 2xx + main visible`,
      );

      const { accessToken } = await loginAs(context, role);
      expect(accessToken).toBeTruthy();
      expect(accessToken.length).toBeGreaterThan(20);

      const dashboardPaths = {
        admin: "/admin",
        reseller: "/reseller/dashboard",
        agent: "/agent/dashboard",
        client: "/dashboard",
      };
      const res = await page.goto(dashboardPaths[role]);
      const status = res?.status();
      expect(status).toBeLessThan(400);
      await expect(page.locator("main")).toBeVisible({ timeout: 8000 });

      act(
        testInfo,
        `access_token length=${accessToken.length}, GET ${dashboardPaths[role]} → ${status}, main tampil`,
      );
    });
  }

  test("Login dengan credential salah ditolak dengan 401 (bukan 200/500 leak)", async ({}, testInfo) => {
    req(
      testInfo,
      "POST /auth/login email+password ngawur → HTTP 401 dengan error envelope { code, message } dan TIDAK mengandung hash/token; response body tidak leak 'user not found' vs 'wrong password' (harus generic)",
    );
    const apiBase = deriveApiBase();

    // Wait until rate limit clears (5 req/min per IP di Fiber limiter).
    // Test 429 sebagai pass sebelumnya bikin false-positive: waktu backend spam
    // rate-limited, test lolos walaupun tidak sempat verify perilaku 401 asli.
    let status = 429;
    let body = "";
    const start = Date.now();
    while (status === 429 && Date.now() - start < 90_000) {
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "wrong-qa-invalid@example.com",
          password: "wrongpass-qa",
        }),
      });
      status = res.status;
      body = await res.text();
      if (status === 429) {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    expect(status).toBe(401);

    // Body harus envelope error, bukan raw stack trace / SQL / user data.
    const bodyLower = body.toLowerCase();
    expect(bodyLower).not.toMatch(/access_token|refresh_token|password_hash|argon2|panic|pgx|goroutine/);

    // Response tidak boleh discriminate "user not found" vs "wrong password"
    // — attacker bisa enumerate email dari perbedaan message.
    const hasEnumerationLeak =
      bodyLower.includes("user not found") ||
      bodyLower.includes("user tidak ditemukan") ||
      bodyLower.includes("email tidak terdaftar");
    expect(hasEnumerationLeak).toBe(false);

    act(
      testInfo,
      `HTTP ${status} setelah wait rate-limit; body length=${body.length}, no token/hash leak, no user-enumeration wording`,
    );
  });

  test("GET /auth/me tanpa token return 401", async ({}, testInfo) => {
    req(testInfo, "GET /auth/me tanpa Authorization header → 401 Unauthorized");
    const apiBase = deriveApiBase();
    const res = await fetch(`${apiBase}/api/v1/auth/me`);
    expect(res.status).toBe(401);
    act(testInfo, `HTTP ${res.status}`);
  });

  test("GET /auth/me dengan valid token return user data", async ({ context }, testInfo) => {
    req(
      testInfo,
      "GET /auth/me + Bearer token admin → 200 + response.data.email = admin email",
    );
    // Reuse cached token dari loginAs (cegah rate limit hit /login lagi).
    const { accessToken } = await loginAs(context, "admin");
    const apiBase = deriveApiBase();
    const meRes = await fetch(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.status).toBe(200);
    const meJson = await meRes.json();
    expect(meJson.data.email).toBe(config.accounts.admin.email);
    expect(meJson.data.role).toBeTruthy();
    act(
      testInfo,
      `HTTP 200, email=${meJson.data.email}, role=${meJson.data.role}`,
    );
  });
});

test.describe("Auth — Public endpoints (no token)", () => {
  test("GET /healthz return 200 @smoke", async ({}, testInfo) => {
    req(testInfo, "GET /healthz (public health probe) → HTTP 200");
    const apiBase = deriveApiBase();
    const res = await fetch(`${apiBase}/healthz`);
    expect(res.status).toBe(200);
    act(testInfo, `HTTP ${res.status}`);
  });

  test("GET /livez return 200", async ({}, testInfo) => {
    req(testInfo, "GET /livez (liveness probe) → HTTP 200");
    const apiBase = deriveApiBase();
    const res = await fetch(`${apiBase}/livez`);
    expect(res.status).toBe(200);
    act(testInfo, `HTTP ${res.status}`);
  });

  test("Frontend /login page loads @smoke @cross-browser", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /login (frontend) → halaman render, input password field muncul",
    );
    await page.goto("/login");
    const passwordInput = page
      .locator('input[type="password"], input[name="password"]')
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 8000 });
    act(testInfo, "Halaman /login render, input password terlihat");
  });
});
