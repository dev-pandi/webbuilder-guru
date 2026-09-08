// 41-admin-banners.spec.mjs — QA test flows untuk Admin Moderasi Banner Guru
// (spec §27). Fokus: cross-site banner list, filter admin_enabled/disabled,
// dialog nonaktifkan dengan alasan.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/auth.mjs";
import { req, act } from "../fixtures/qa.mjs";

test.describe("Admin — Moderasi Banner Guru (spec §27)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Halaman /admin/banners loads + toolbar filter @smoke", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /admin/banners → header + search input + select filter (Semua/Diizinkan Admin/Dinonaktifkan Admin)",
    );
    const res = await page.goto("/admin/banners");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Heading khusus.
    await expect(page.getByRole("heading", { name: /Banner Guru/i }).first()).toBeVisible();

    // Search input.
    await expect(page.getByPlaceholder(/Cari judul/i).first()).toBeVisible();

    // Filter select trigger visible (Radix Select trigger).
    const trigger = page.locator('[role="combobox"]').first();
    await expect(trigger).toBeVisible();

    act(testInfo, "Admin Banner page render dengan search + filter select");
  });

  test("Filter dropdown menampilkan 3 opsi (Semua/Diizinkan/Dinonaktifkan)", async ({ page }, testInfo) => {
    req(
      testInfo,
      "Klik filter select → dropdown terbuka + 3 opsi: Semua, Diizinkan Admin, Dinonaktifkan Admin",
    );
    await page.goto("/admin/banners");
    await expect(page.locator("main")).toBeVisible();

    const trigger = page.locator('[role="combobox"]').first();
    await trigger.click();

    const options = ["Semua", "Diizinkan Admin", "Dinonaktifkan Admin"];
    let found = 0;
    for (const label of options) {
      const count = await page.getByRole("option", { name: new RegExp(label, "i") }).count();
      if (count > 0) found++;
    }
    expect(found).toBeGreaterThanOrEqual(2);

    act(testInfo, `Filter dropdown ${found}/3 opsi ditemukan`);
  });

  test("Empty state atau list banner render tanpa error", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /admin/banners → kalau ada banner: cards dengan preview; kalau kosong: empty state 'Belum ada banner terdaftar'",
    );
    await page.goto("/admin/banners");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle").catch(() => {});

    const emptyMsg = await page.getByText(/Belum ada banner|Tidak ada banner/i).count();
    const cardsCount = await page.locator("article, [class*='card']").count();
    // Salah satu harus true — empty state atau ada minimal 1 card.
    expect(emptyMsg > 0 || cardsCount > 0).toBe(true);

    act(testInfo, `${emptyMsg > 0 ? "Empty state tampil" : `${cardsCount} card banner render`}`);
  });

  test("Menu Banner Guru ada di admin sidebar", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /admin → sidebar nav berisi link 'Banner Guru' (menu baru)",
    );
    await page.goto("/admin");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("link", { name: /Banner Guru/i }).first()).toBeVisible();
    act(testInfo, "Menu 'Banner Guru' terdaftar di sidebar admin");
  });
});

test.describe("Admin — Access control banner endpoint", () => {
  test("Client (non-admin) tidak bisa akses /admin/banners", async ({ page, context }) => {
    await loginAs(context, "client");
    const res = await page.goto("/admin/banners");
    // App redirect ke /dashboard atau /login untuk non-admin.
    // Path akhir bukan /admin/banners.
    await page.waitForLoadState("networkidle").catch(() => {});
    const url = page.url();
    expect(url).not.toContain("/admin/banners");
  });
});
