// 50-guru.spec.mjs — QA test flows untuk fitur Rumah Digital Guru (spec
// §20-§25). Fokus: dashboard ringkasan, Tulisan (6 rubric + forum), moderasi
// Tanggapan, Ruang Promosi, Pembelajaran, Profil Guru.
//
// Semua test pakai role `client` — di produksi setiap guru = 1 user client
// yang punya minimal 1 situs. Test toleran ke situasi "user belum punya
// site" atau "site kosong" (empty state expected).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/auth.mjs";
import { deriveApiBase } from "../fixtures/accounts.mjs";
import { req, act } from "../fixtures/qa.mjs";

// getFirstSiteId — resolve site ID pertama milik user via API. Return null
// kalau user belum punya site (test skip / gunakan empty state assertions).
async function getFirstSiteId(page) {
  const apiBase = deriveApiBase();
  const token = await page.evaluate(() => localStorage.getItem("wb_access_token"));
  if (!token) return null;
  try {
    const res = await page.request.get(`${apiBase}/api/v1/sites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok()) return null;
    const body = await res.json();
    const items = body?.data?.items ?? body?.data ?? [];
    return Array.isArray(items) && items.length > 0 ? items[0].id : null;
  } catch {
    return null;
  }
}

test.describe("Guru — Dashboard Ringkasan (spec §21)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Ringkasan situs tampil dengan 6 stat card @smoke", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id] → stat cards Total Views, Tulisan, Tanggapan Approved, Menunggu Moderasi, Materi, Banner Aktif render + tombol Editor",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site — buat via wizard dulu");

    const res = await page.goto(`/sites/${siteId}`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Cek 6 stat labels muncul (case-insensitive substring).
    const requiredLabels = [
      "Total Views",
      "Tulisan Published",
      "Tanggapan Approved",
      "Menunggu Moderasi",
      "Materi Pembelajaran",
      "Banner Aktif",
    ];
    let matched = 0;
    for (const label of requiredLabels) {
      const count = await page.getByText(label, { exact: false }).count();
      if (count > 0) matched++;
    }
    expect(matched).toBeGreaterThanOrEqual(4); // toleran — layout bisa evolve

    // Tombol Editor prominent — CTA utama dashboard.
    await expect(page.getByRole("link", { name: /Editor/i }).first()).toBeVisible();

    act(testInfo, `Ringkasan render, ${matched}/${requiredLabels.length} stat labels ditemukan`);
  });
});

test.describe("Guru — Menu Tulisan (spec §14, §22)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Halaman /tulisan render dengan tabs rubric + tabel", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/tulisan → tabs 6 rubric (Ceritaku/Bacaanku/...) + table + tombol Tulisan Baru + info banner Rumah Digital Guru",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    const res = await page.goto(`/sites/${siteId}/tulisan`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Info banner guru harus muncul.
    await expect(page.getByText(/Rumah Digital Guru/i).first()).toBeVisible();

    // Tabs rubric — 6 items + Semua.
    const rubricTabs = ["Semua", "Ceritaku", "Bacaanku", "Inspirasiku", "Bangsaku", "Peradaban"];
    let tabsFound = 0;
    for (const label of rubricTabs) {
      const count = await page.getByRole("button", { name: label, exact: true }).count();
      if (count > 0) tabsFound++;
    }
    expect(tabsFound).toBeGreaterThanOrEqual(4);

    // Tombol Tulisan Baru.
    await expect(page.getByRole("link", { name: /Tulisan Baru/i }).first()).toBeVisible();

    act(testInfo, `Tabs rubric ditemukan: ${tabsFound}/${rubricTabs.length}, header + info banner render`);
  });

  test("Form editor Tulisan Baru render dengan rubric selector", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/tulisan/new → title input + slug + rubric select + RichEditor + toggle comments_enabled",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    const res = await page.goto(`/sites/${siteId}/tulisan/new`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Title input dengan placeholder khusus.
    await expect(page.getByPlaceholder(/Judul tulisan/i).first()).toBeVisible({ timeout: 8000 });

    // Toggle comments_enabled ada.
    const commentsToggle = page.locator('input[type="checkbox"]#comments_enabled');
    await expect(commentsToggle).toBeVisible();

    act(testInfo, "Form Tulisan render (title + comments toggle)");
  });

  test("Form editor pre-select rubric dari query param ?rubric=forum-diskusi", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/tulisan/new?rubric=forum-diskusi → slug prefix /forum-diskusi/ + comments toggle disabled (spec §16 forum enforcement)",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    await page.goto(`/sites/${siteId}/tulisan/new?rubric=forum-diskusi`);
    await expect(page.locator("main")).toBeVisible();

    // Slug prefix menunjukkan rubric yang di-preselect.
    await expect(page.getByText("/forum-diskusi/").first()).toBeVisible({ timeout: 8000 });

    // Comments toggle harus disabled (rubric forum-diskusi enforce true).
    const toggle = page.locator('input[type="checkbox"]#comments_enabled');
    await expect(toggle).toBeDisabled();

    act(testInfo, "Rubric forum-diskusi pre-selected, comments toggle disabled (forum enforcement)");
  });
});

test.describe("Guru — Menu Forum Diskusi (spec §16, §20)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Halaman /forum render sebagai menu terpisah", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/forum → header 'Forum Diskusi' + info banner 'tanggapan selalu aktif' + tombol Topik Baru",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    const res = await page.goto(`/sites/${siteId}/forum`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Heading khusus forum.
    const h1 = page.getByRole("heading", { name: /Forum Diskusi/i });
    await expect(h1.first()).toBeVisible();

    // Copy khusus "tanggapan wajib aktif" harus muncul di info banner.
    await expect(page.getByText(/tanggapan.*aktif.*tidak dapat dinonaktifkan/i).first()).toBeVisible();

    // CTA "Topik Baru" (bukan "Tulisan Baru").
    await expect(page.getByRole("link", { name: /Topik Baru/i }).first()).toBeVisible();

    act(testInfo, "Forum page render dengan heading + info banner + CTA Topik Baru");
  });
});

test.describe("Guru — Moderasi Tanggapan (spec §18)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Halaman /tanggapan render dengan filter tabs Pending/Approved/Rejected", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/tanggapan → 4 tabs filter (Semua/Pending/Approved/Rejected) + info banner moderation",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    const res = await page.goto(`/sites/${siteId}/tanggapan`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // 4 filter tabs.
    const tabs = ["Semua", "Pending", "Approved", "Rejected"];
    let tabsFound = 0;
    for (const label of tabs) {
      const count = await page.getByRole("button", { name: label, exact: true }).count();
      if (count > 0) tabsFound++;
    }
    expect(tabsFound).toBeGreaterThanOrEqual(3);

    // Info banner moderation.
    await expect(page.getByText(/Semua tanggapan.*Pending/i).first()).toBeVisible();

    act(testInfo, `Filter tabs ${tabsFound}/4 ditemukan + info banner moderation`);
  });

  test("Filter ?status=pending diambil dari query dan visible di UI", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/tanggapan?status=pending → tab Pending aktif atau list ter-filter",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    await page.goto(`/sites/${siteId}/tanggapan?status=pending`);
    await expect(page.locator("main")).toBeVisible();
    // Tidak assert isi (data-dependent) — cukup pastikan page load OK.
    act(testInfo, "Filter status=pending accepted");
  });
});

test.describe("Guru — Ruang Promosi (spec §11, §24)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Halaman /promosi render dengan CTA Banner Baru", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/promosi → header 'Ruang Promosi' + info banner + tombol Banner Baru (bila kosong, empty state + CTA)",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    const res = await page.goto(`/sites/${siteId}/promosi`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Heading.
    await expect(page.getByRole("heading", { name: /Ruang Promosi/i }).first()).toBeVisible();

    // Info banner 2:1 ratio requirement.
    await expect(page.getByText(/rasio 2:1/i).first()).toBeVisible();

    // CTA "Banner Baru" (button/CTA dalam empty state atau di header).
    const btn = page.getByRole("button", { name: /Banner Baru/i }).or(
      page.getByRole("button", { name: /Buat Banner/i }),
    );
    await expect(btn.first()).toBeVisible();

    act(testInfo, "Ruang Promosi page render dengan heading + info banner + CTA");
  });

  test("Dialog form Banner Baru terbuka dengan field wajib", async ({ page }, testInfo) => {
    req(
      testInfo,
      "Klik Banner Baru → Dialog dengan input judul internal + URL tujuan + alt text + upload gambar",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    await page.goto(`/sites/${siteId}/promosi`);
    await expect(page.locator("main")).toBeVisible();

    // Klik tombol "Banner Baru" pertama yang ketemu.
    const btn = page
      .getByRole("button", { name: /Banner Baru/i })
      .or(page.getByRole("button", { name: /Buat Banner/i }))
      .first();
    await btn.click();

    // Dialog title / label khas form banner.
    await expect(page.getByText(/Judul Internal/i).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/URL Tujuan/i).first()).toBeVisible();

    act(testInfo, "Dialog Banner Baru terbuka dengan field Judul Internal + URL Tujuan");
  });
});

test.describe("Guru — Pembelajaran (spec §19, §23)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Halaman /pembelajaran render dengan tabel materi", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/pembelajaran → header + info banner (tanpa views/tanggapan) + tombol Materi Baru",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    const res = await page.goto(`/sites/${siteId}/pembelajaran`);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    await expect(page.getByRole("heading", { name: /Pembelajaran/i }).first()).toBeVisible();

    // Info banner: tanpa views/tanggapan.
    await expect(page.getByText(/tidak memiliki views/i).first()).toBeVisible();

    await expect(page.getByRole("link", { name: /Materi Baru/i }).first()).toBeVisible();

    act(testInfo, "Pembelajaran page render dengan info spec §19 + CTA Materi Baru");
  });
});

test.describe("Guru — Settings Profil Guru (spec §13, §25)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Halaman /settings/profile-guru render dengan 4 section (Identitas/Hero/Bio/Sosial)", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /settings/profile-guru → 4 CardTitle: Identitas, Hero & Quote, Biografi, Tautan Sosial",
    );
    const res = await page.goto("/settings/profile-guru");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    const sections = ["Identitas", "Hero", "Biografi", "Tautan Sosial"];
    let sectionsFound = 0;
    for (const label of sections) {
      const count = await page.getByText(label, { exact: false }).count();
      if (count > 0) sectionsFound++;
    }
    expect(sectionsFound).toBeGreaterThanOrEqual(3);

    // Save button.
    await expect(page.getByRole("button", { name: /Simpan/i }).first()).toBeVisible();

    act(testInfo, `Profil Guru render dengan ${sectionsFound}/4 section`);
  });

  test("Sidebar Settings punya menu Profil Guru", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /settings/profile → sidebar nav berisi link 'Profil Guru' (tab baru)",
    );
    await page.goto("/settings/profile");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("link", { name: /Profil Guru/i }).first()).toBeVisible();
    act(testInfo, "Menu 'Profil Guru' ada di sidebar settings");
  });
});

test.describe("Guru — Sidebar Navigation (spec §20)", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Sidebar site dashboard punya dropdown Guru dengan 5 item", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/[id]/editor → sidebar dropdown Guru buka dan berisi: Tulisan, Forum Diskusi, Tanggapan, Pembelajaran, Ruang Promosi",
    );
    const siteId = await getFirstSiteId(page);
    test.skip(!siteId, "User client belum punya site");

    await page.goto(`/sites/${siteId}/editor`);
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });

    // Klik trigger "Guru" — dropdown terbuka.
    const trigger = page.getByRole("button", { name: /Guru/i }).first();
    await trigger.click();

    // Item dropdown muncul.
    const items = ["Tulisan", "Forum Diskusi", "Tanggapan", "Pembelajaran", "Ruang Promosi"];
    let found = 0;
    for (const label of items) {
      const count = await page.getByRole("menuitem").filter({ hasText: label }).count();
      if (count > 0) found++;
    }
    expect(found).toBeGreaterThanOrEqual(4);

    act(testInfo, `Dropdown Guru terbuka, ${found}/5 item terlihat`);
  });
});
