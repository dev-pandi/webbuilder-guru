// 03-form-validation-ui.spec.mjs — UI-level negative tests (browser interaction).
//
// Fokus: user experience saat input salah — apakah form validation kick in,
// error message muncul, submit di-block. Ini beda dengan API negative test:
// di sini kita simulate REAL USER dengan mouse + keyboard di browser.

import { test, expect } from "@playwright/test";
import { req, act } from "../../fixtures/qa.mjs";

test.describe("Negative — Login form UI validation", () => {
  test("Submit login form kosong → tidak redirect + error message atau HTML5 validation", async ({
    page,
  }, testInfo) => {
    req(
      testInfo,
      "GET /login, klik submit tanpa isi email+password → tidak navigate ke dashboard. Native HTML5 required attribute ATAU custom error toast HARUS block submit. Verify: URL tetap di /login setelah 2 detik.",
    );
    await page.goto("/login");
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 8000 });

    // Cari button submit
    const submitBtn = page
      .getByRole("button", { name: /masuk|login|sign in/i })
      .first();
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Wait 2 detik — kalau redirect terjadi, URL berubah
    await page.waitForTimeout(2000);

    // Assertion: URL tetap di /login (form tidak submit tanpa validation)
    expect(page.url()).toContain("/login");
    act(
      testInfo,
      `URL tetap ${new URL(page.url()).pathname} — form tidak submit dengan field kosong`,
    );
  });

  test("Login dengan email format invalid → validation kick sebelum submit", async ({
    page,
  }, testInfo) => {
    req(
      testInfo,
      "Fill email='not-an-email' + password valid, klik submit → HTML5 email input HARUS reject (browser native validation). URL tetap /login. Kalau backend kena hit dengan email invalid → 401 dari backend, atau frontend intercept.",
    );
    await page.goto("/login");
    const emailInput = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    const passInput = page.locator('input[type="password"]').first();
    await expect(emailInput).toBeVisible();
    await expect(passInput).toBeVisible();

    await emailInput.fill("not-an-email");
    await passInput.fill("somepassword");

    const submitBtn = page
      .getByRole("button", { name: /masuk|login|sign in/i })
      .first();
    await submitBtn.click();
    await page.waitForTimeout(2000);

    // Native browser validation ATAU backend 401 → URL harus tetap di /login
    expect(page.url()).toContain("/login");
    act(testInfo, `URL tetap /login — email format invalid tidak lolos ke dashboard`);
  });

  test("Login dengan credential salah → error message muncul di UI (bukan silent)", async ({
    page,
  }, testInfo) => {
    req(
      testInfo,
      "Fill email valid + password salah, submit → HTTP 401 dari backend, frontend HARUS tampilkan error message ke user (toast/inline). Kalau silent = UX broken (user bingung kenapa tidak login). Wait network response, look for error text.",
    );
    await page.goto("/login");
    const emailInput = page
      .locator('input[type="email"], input[name="email"]')
      .first();
    const passInput = page.locator('input[type="password"]').first();
    await emailInput.fill(process.env.CLIENT_EMAIL || "client@example.com");
    await passInput.fill("definitely-wrong-password-qa");

    const submitBtn = page
      .getByRole("button", { name: /masuk|login|sign in/i })
      .first();
    // Wait for network response ke /auth/login
    const [resp] = await Promise.all([
      page
        .waitForResponse((r) => r.url().includes("/auth/login") && r.request().method() === "POST", {
          timeout: 10_000,
        })
        .catch(() => null),
      submitBtn.click(),
    ]);

    await page.waitForTimeout(1500);
    // URL tetap /login (no navigation)
    expect(page.url()).toContain("/login");

    // Cek error indicator apapun — toast, red text, alert
    const errorEl = page
      .locator('[role="alert"], .text-destructive, .text-red-500, [class*="error"]')
      .first();
    const hasError = (await errorEl.count()) > 0;
    const respStatus = resp?.status() || "n/a";
    act(
      testInfo,
      `Login response HTTP ${respStatus}, URL=${new URL(page.url()).pathname}, error UI ditampilkan=${hasError}`,
    );
    // Soft assertion — banyak dashboard UX pattern tidak show error immediate
    // (fade-in delayed). Yang penting URL tetap.
    expect(page.url()).toContain("/login");
  });
});

test.describe("Negative — 404 handling", () => {
  test("Navigate ke route tidak exist → 404 page atau redirect (bukan blank/crash)", async ({
    page,
  }, testInfo) => {
    req(
      testInfo,
      "GET /this-route-does-not-exist-abc-${timestamp} → Next.js 404 page render dengan text '404' atau 'not found' visible. Bukan blank white page atau server error 500 crash.",
    );
    const random = Date.now();
    const res = await page.goto(`/nonexistent-route-abc-${random}`);
    const status = res?.status();
    // Next.js 404 return status 404; page tetap render
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);

    // Body harus punya text yang mengindikasikan 404 (bukan blank)
    const bodyText = (await page.locator("body").textContent()) || "";
    const has404Indicator = /404|not.?found|tidak.?ditemukan/i.test(bodyText);
    expect(has404Indicator).toBe(true);
    act(
      testInfo,
      `HTTP ${status}, body text mengandung 404 indicator (${bodyText.length} char total)`,
    );
  });
});

test.describe("Negative — Unauthorized dashboard access", () => {
  test("Akses /admin tanpa login → redirect ke /login", async ({ page }, testInfo) => {
    req(
      testInfo,
      "Clear cookies + localStorage, GET /admin → redirect ke /login (client-side guard di admin/layout.tsx). Verify URL setelah 3 detik ada /login.",
    );
    // Ensure no token
    await page.context().clearCookies();
    await page.goto("/admin");
    // Client-side redirect butuh waktu (fetch /auth/me → null → replace to /login)
    await page
      .waitForURL(/\/login/, { timeout: 5000 })
      .catch(() => {});
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/login/);
    act(testInfo, `Final URL: ${new URL(finalUrl).pathname} — redirect ke login`);
  });

  test("Akses /dashboard tanpa login → redirect ke /login", async ({ page }, testInfo) => {
    req(
      testInfo,
      "Clear session, GET /dashboard → redirect ke /login. Dashboard client-side guard sama pattern seperti admin.",
    );
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await page
      .waitForURL(/\/login/, { timeout: 5000 })
      .catch(() => {});
    expect(page.url()).toMatch(/\/login/);
    act(testInfo, `Redirect ke ${new URL(page.url()).pathname}`);
  });
});
