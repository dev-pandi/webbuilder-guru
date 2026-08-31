// 01-critical-pages.spec.mjs — Visual regression untuk 5 halaman kunci.
//
// Playwright `toHaveScreenshot()` auto-generate baseline PNG saat first run,
// simpan di test-name.spec.mjs-snapshots/. Run kedua diff terhadap baseline;
// kalau ratio pixel berubah > maxDiffPixelRatio (di config = 2%), test FAIL.
//
// Baseline invariance: viewport 1440x900, locale id-ID, timezone konsisten.
// Dynamic content (timestamp, counter changing) di-mask atau di-hide.
//
// Update baseline saat design berubah legit:
//   npx playwright test tests/visual --update-snapshots
//
// Tag @visual → project firefox/webkit di config akan grep juga (kalau
// PLAYWRIGHT_BROWSERS=all set).

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { req, act } from "../../fixtures/qa.mjs";

// Common config supaya screenshot stabil.
const shotOpts = {
  fullPage: false, // viewport only — konsisten cross-run
  animations: "disabled",
  caret: "hide",
  // Mask elemen yang berubah tiap render (timestamp, animated counter)
  mask: [],
};

test.describe("Visual regression — halaman kunci", () => {
  test("Landing page marketing (/) @visual @cross-browser", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET / (public marketing) → screenshot match baseline. Baseline generate di run pertama; run selanjutnya diff dengan tolerance 2% pixel + 20% color per pixel (anti-alias tolerance cross-OS).",
    );
    await page.goto("/");
    // Tunggu content stabil — hero image + font loaded.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot("landing.png", shotOpts);
    act(testInfo, `Baseline landing.png match dalam tolerance`);
  });

  test("Login page @visual @cross-browser", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /login → screenshot match baseline. Login page = entry point critical, regression visual = warning kalau ada breaking CSS change.",
    );
    await page.goto("/login");
    await expect(page.locator('input[type="password"]')).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("login.png", shotOpts);
    act(testInfo, `Baseline login.png match dalam tolerance`);
  });

  test("Dashboard client @visual", async ({ page, context }, testInfo) => {
    req(
      testInfo,
      "Login sebagai client, GET /dashboard → screenshot match baseline. Mask user-specific content (nama, tanggal terakhir login) supaya baseline tidak drift.",
    );
    await loginAs(context, "client");
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("dashboard-client.png", {
      ...shotOpts,
      // Mask elemen berisi timestamp / count yang mungkin berubah
      mask: [
        page.locator("[data-testid='last-login']"),
        page.locator("time"),
      ],
    });
    act(testInfo, `Baseline dashboard-client.png match dalam tolerance`);
  });

  test("Admin overview @visual", async ({ page, context }, testInfo) => {
    req(
      testInfo,
      "Login admin, GET /admin → screenshot match baseline. Admin overview punya stats cards yang render pertama load. Mask counter/stat number supaya baseline tidak drift kalau data berubah.",
    );
    await loginAs(context, "admin");
    await page.goto("/admin");
    await expect(page.locator("main")).toBeVisible({ timeout: 8000 });
    // Wait heading + stats render
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot("admin-overview.png", {
      ...shotOpts,
      // Stats numeric values sering berubah — mask total user/site/dsb cards
      mask: [
        page.locator("[class*='stat'] [class*='number']"),
        page.locator(".tabular-nums"),
      ],
    });
    act(testInfo, `Baseline admin-overview.png match dalam tolerance`);
  });

  test("Reseller wallet page @visual", async ({ page, context }, testInfo) => {
    req(
      testInfo,
      "Login reseller, GET /reseller/wallet → screenshot match baseline. Mask balance angka Rp (berubah tiap purchase/topup) supaya baseline stabil.",
    );
    await loginAs(context, "reseller");
    await page.goto("/reseller/wallet");
    await expect(page.locator("main")).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot("reseller-wallet.png", {
      ...shotOpts,
      mask: [
        // Rp balance + ledger row (values change)
        page.locator("text=/Rp\\s?[\\d.,]+/"),
        page.locator("[class*='balance']"),
      ],
    });
    act(testInfo, `Baseline reseller-wallet.png match dalam tolerance`);
  });
});
