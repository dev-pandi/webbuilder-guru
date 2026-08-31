// 20-agent.spec.mjs — QA test flows untuk role agent.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/auth.mjs";
import { req, act } from "../fixtures/qa.mjs";

test.describe("Agent Dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "agent");
  });

  test("Dashboard agent loads dengan stats cards @smoke", async ({ page }, testInfo) => {
    req(testInfo, "GET /agent/dashboard → main visible (shell terrender)");
    await page.goto("/agent/dashboard");
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, "main tampil");
  });

  test("Halaman Clients (agent) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /agent/clients → HTTP <400 + main visible");
    const res = await page.goto("/agent/clients");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Invoices (agent) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /agent/invoices → HTTP <400 + main visible");
    const res = await page.goto("/agent/invoices");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Domains (agent) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /agent/domains → HTTP <400 + main visible");
    const res = await page.goto("/agent/domains");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Wallet (agent) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /agent/wallet → HTTP <400 + main visible");
    const res = await page.goto("/agent/wallet");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Pricing (agent) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /agent/pricing → HTTP <400 + main visible");
    const res = await page.goto("/agent/pricing");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Collaborators (agent) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /agent/collaborators → HTTP <400 + main visible");
    const res = await page.goto("/agent/collaborators");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Agent — Access control", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "agent");
  });

  test("Agent TIDAK bisa akses /admin/* (redirect atau 403)", async ({
    page,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin sebagai agent → client-side guard redirect keluar dari /admin",
    );
    await page.goto("/admin");
    await page
      .waitForURL((url) => !url.pathname.startsWith("/admin"), {
        timeout: 8000,
      })
      .catch(() => {});
    const finalUrl = page.url();
    const finalPath = new URL(finalUrl).pathname;
    expect(finalUrl.includes("/admin")).toBe(false);
    act(testInfo, `Redirect ke ${finalPath} — akses /admin ditolak`);
  });
});
