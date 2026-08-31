// 30-reseller.spec.mjs — QA test flows untuk role reseller.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/auth.mjs";
import { req, act } from "../fixtures/qa.mjs";

test.describe("Reseller Dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "reseller");
  });

  test("Dashboard reseller loads dengan stat tiles @smoke", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /reseller/dashboard → main visible + minimal 1 stat tile (kata klien/wallet/domain/agent/saldo muncul)",
    );
    await page.goto("/reseller/dashboard");
    await expect(page.locator("main")).toBeVisible();
    const tile = page
      .locator("main")
      .getByText(/klien|wallet|domain|agent|saldo/i)
      .first();
    await expect(tile).toBeVisible({ timeout: 8000 });
    const tileText = (await tile.textContent().catch(() => "")) || "";
    act(testInfo, `main tampil, stat tile terdeteksi: "${tileText.trim().slice(0, 50)}"`);
  });

  test("Halaman Clients (reseller) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /reseller/clients → HTTP <400 + main visible");
    const res = await page.goto("/reseller/clients");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Team (reseller) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /reseller/team → HTTP <400 + main visible");
    const res = await page.goto("/reseller/team");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Wallet (reseller) loads dengan saldo", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /reseller/wallet → HTTP <400 + main visible + text 'Saldo/Rp/Top up' muncul",
    );
    const res = await page.goto("/reseller/wallet");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    const saldo = page.locator("main").getByText(/saldo|rp|top.?up/i).first();
    await expect(saldo).toBeVisible({ timeout: 5000 });
    const saldoText = (await saldo.textContent().catch(() => "")) || "";
    act(testInfo, `HTTP ${status}, teks saldo: "${saldoText.trim().slice(0, 50)}"`);
  });

  test("Halaman Pricing (reseller) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /reseller/pricing → HTTP <400 + main visible");
    const res = await page.goto("/reseller/pricing");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Invoices (reseller) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /reseller/invoices → HTTP <400 + main visible");
    const res = await page.goto("/reseller/invoices");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Documents (reseller) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /reseller/documents → HTTP <400 + main visible");
    const res = await page.goto("/reseller/documents");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Collaborators (reseller) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /reseller/collaborators → HTTP <400 + main visible");
    const res = await page.goto("/reseller/collaborators");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Domains (reseller) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /reseller/domains → HTTP <400 + main visible");
    const res = await page.goto("/reseller/domains");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Reseller — Wallet top-up flow", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "reseller");
  });

  test("Klik Top-up navigate ke wizard + form nominal muncul", async ({ page }, testInfo) => {
    req(
      testInfo,
      "Klik link 'Top-up' di /reseller/wallet → navigate ke /reseller/wallet/topup + input nominal (type=number, min 250k default) + tombol lanjut muncul",
    );
    await page.goto("/reseller/wallet");
    await expect(page.locator("main")).toBeVisible();

    // Link Top-up WAJIB ada — kalau tidak, itu regression (core feature reseller).
    const topupLink = page.getByRole("link", { name: /top.?up/i }).first();
    await expect(topupLink).toBeVisible({ timeout: 5000 });
    await topupLink.click();

    // Wait for navigation ke topup wizard
    await page.waitForURL(/\/reseller\/wallet\/topup/, { timeout: 5000 });

    // Wizard render dengan form nominal
    const nominalInput = page.locator('input[type="number"]').first();
    await expect(nominalInput).toBeVisible({ timeout: 5000 });
    const placeholder = await nominalInput.getAttribute("placeholder");

    // Ada CTA lanjut (Bayar / Lanjut / Konfirmasi)
    const cta = page
      .getByRole("button", { name: /bayar|lanjut|konfirmasi|proses/i })
      .first();
    await expect(cta).toBeVisible();

    act(
      testInfo,
      `Navigate → ${new URL(page.url()).pathname}, input nominal placeholder="${placeholder}", tombol CTA ditemukan`,
    );
  });
});

test.describe("Reseller — Access control", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "reseller");
  });

  test("Reseller TIDAK bisa akses /admin/*", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /admin sebagai reseller → client-side guard redirect keluar dari /admin",
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
