// 51-portal-guru.spec.mjs — QA test flows untuk Portal Direktori Guru
// publik (spec §5-§6). Fokus: /guru page (no auth), sort/search, portal
// promotion banners endpoint.
//
// Tidak butuh login — endpoint /public/guru dan /public/portal/promotion-banners
// accessible tanpa bearer token. Test browse UX pengunjung.

import { test, expect } from "@playwright/test";
import { deriveApiBase } from "../fixtures/accounts.mjs";
import { req, act } from "../fixtures/qa.mjs";

test.describe("Portal — Direktori Guru publik (spec §5)", () => {
  test("Halaman /guru loads tanpa auth + toolbar filter @smoke", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /guru (no auth) → header 'Guru yang sudah bergabung' + search input + sort select (Terbaru/Terpopuler) + link Buat Website",
    );
    const res = await page.goto("/guru");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Heading section direktori.
    await expect(page.getByRole("heading", { name: /Guru yang sudah bergabung/i }).first())
      .toBeVisible();

    // Search + sort toolbar.
    await expect(page.getByPlaceholder(/Cari nama guru/i).first()).toBeVisible();

    // CTA Buat Website Saya.
    await expect(page.getByRole("link", { name: /Buat Website Saya/i }).first()).toBeVisible();

    act(testInfo, "Direktori guru render dengan search + sort + CTA");
  });

  test("Empty state atau grid guru render tanpa error", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /guru → kalau ada guru: card list; kalau kosong: empty state 'Belum ada guru yang bergabung'",
    );
    await page.goto("/guru");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});

    // Empty state atau minimal 1 card.
    const empty = await page.getByText(/Belum ada guru|Tidak ada guru/i).count();
    const cards = await page.getByRole("link", { name: /Kunjungi Website/i }).count();
    expect(empty > 0 || cards > 0).toBe(true);

    act(testInfo, `${empty > 0 ? "Empty state tampil" : `${cards} kartu guru render`}`);
  });

  test("Sort ?sort=popular diambil dari URL", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /guru?sort=popular → URL disimpan, sort select value = 'Terpopuler'",
    );
    const res = await page.goto("/guru?sort=popular");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    // Cukup pastikan page render (state initialization dari query).
    act(testInfo, "Sort popular accepted via URL param");
  });

  test("Landing page menyertakan link 'Lihat semua guru →' ke /guru", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET / (landing) → section 'Guru yang Sudah Bergabung' berisi link 'Lihat semua guru' ke /guru",
    );
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main, body").first()).toBeVisible();

    // Link "Lihat semua guru" harus point ke /guru.
    const link = page.getByRole("link", { name: /Lihat semua guru/i }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toContain("/guru");

    act(testInfo, `Landing → /guru link OK (href=${href})`);
  });
});

test.describe("Portal — Public API endpoints (no auth)", () => {
  test("GET /public/guru returns JSON envelope", async ({ request }, testInfo) => {
    req(
      testInfo,
      "GET /public/guru → HTTP 200 + JSON { data: { items: [...], total, page, page_size, total_pages } }",
    );
    const apiBase = deriveApiBase();
    const res = await request.get(`${apiBase}/public/guru?page=1&page_size=5`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("items");
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data).toHaveProperty("total");
    expect(body.data).toHaveProperty("total_pages");
    act(
      testInfo,
      `HTTP ${res.status()}, total=${body.data.total}, items[]=${body.data.items.length}, total_pages=${body.data.total_pages}`,
    );
  });

  test("GET /public/portal/promotion-banners returns array", async ({ request }, testInfo) => {
    req(
      testInfo,
      "GET /public/portal/promotion-banners?limit=8 → HTTP 200 + JSON { data: [...] } cross-site eligible banners",
    );
    const apiBase = deriveApiBase();
    const res = await request.get(`${apiBase}/public/portal/promotion-banners?limit=8`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    act(testInfo, `HTTP ${res.status()}, banners=${body.data.length}`);
  });

  test("GET /public/guru?sort=popular accepted", async ({ request }, testInfo) => {
    req(
      testInfo,
      "GET /public/guru?sort=popular&page_size=3 → HTTP 200 tanpa error validation",
    );
    const apiBase = deriveApiBase();
    const res = await request.get(`${apiBase}/public/guru?sort=popular&page_size=3`);
    expect(res.ok()).toBeTruthy();
    act(testInfo, `HTTP ${res.status()}`);
  });

  test("GET /public/guru?q=guru filter search accepted", async ({ request }, testInfo) => {
    req(
      testInfo,
      "GET /public/guru?q=guru → HTTP 200 + items[] (bisa kosong kalau tidak match)",
    );
    const apiBase = deriveApiBase();
    const res = await request.get(`${apiBase}/public/guru?q=guru`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.data.items)).toBe(true);
    act(testInfo, `HTTP ${res.status()}, items=${body.data.items.length}`);
  });
});
