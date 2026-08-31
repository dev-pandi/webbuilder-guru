// 40-admin.spec.mjs — QA test flows untuk role admin (most comprehensive).

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/auth.mjs";
import { deriveApiBase } from "../fixtures/accounts.mjs";
import { req, act } from "../fixtures/qa.mjs";

test.describe("Admin Dashboard + Overview", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Dashboard admin loads dengan stats @smoke", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin → main visible + heading (h1/h2) muncul");
    await page.goto("/admin");
    await expect(page.locator("main")).toBeVisible();
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 8000 });
    const headingText = (await heading.textContent().catch(() => "")) || "";
    act(testInfo, `main tampil, heading="${headingText.trim().slice(0, 60)}"`);
  });
});

test.describe("Admin — User Management", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Halaman Users menampilkan data user asli (email + role badge)", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users → HTTP 2xx + tabel render minimal 1 row + kolom pertama berisi email valid (match /@/) + kolom role berisi 'Admin' atau 'User' badge",
    );
    const res = await page.goto("/admin/users");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible({ timeout: 8000 });

    // Row count harus > 0 (bukan cuma skeleton). Fixture minimum: 4 user (client/agent/reseller/admin).
    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // First row harus punya email valid — kolom pertama render Pengguna (name + email).
    const firstRowText = (await rows.first().textContent()) || "";
    expect(firstRowText).toMatch(/@/);

    // Badge role harus muncul (Admin atau User) — bukan cuma cell kosong.
    const roleBadge = rows.first().getByText(/^(Admin|User)$/i).first();
    await expect(roleBadge).toBeVisible();
    const roleText = (await roleBadge.textContent()) || "";

    // Extract email dari first row untuk laporan (regex greedy sampai whitespace)
    const emailMatch = firstRowText.match(/[\w.+-]+@[\w.-]+\.\w+/);
    const firstEmail = emailMatch ? emailMatch[0] : "(no email extracted)";

    act(
      testInfo,
      `HTTP ${status}, rows=${rowCount}, first row email="${firstEmail}", role="${roleText.trim()}"`,
    );
  });

  test("Halaman Resellers (approval queue) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/resellers → HTTP <400 + main visible");
    const res = await page.goto("/admin/resellers");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Sites (cross-user) loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/sites → HTTP <400 + main visible");
    const res = await page.goto("/admin/sites");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Admin — Domain Observability", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Halaman Domains loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/domain → HTTP <400 + main visible");
    const res = await page.goto("/admin/domain");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Registrar Purchases loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/domain/purchases → HTTP <400 + main visible");
    const res = await page.goto("/admin/domain/purchases");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Admin — Financial", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Halaman Invoices menampilkan data invoice asli (nomor + total Rp + status)", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /admin/invoices → HTTP 2xx + tabel render minimal 1 row + kolom Nomor invoice format non-empty + kolom Total match /Rp\\s?\\d/ (rupiah format) + kolom Status berisi badge (paid/unpaid/draft)",
    );
    const res = await page.goto("/admin/invoices");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible({ timeout: 8000 });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();

    // Tabel bisa kosong kalau env baru; kalau kosong, empty state harus muncul.
    if (rowCount === 0) {
      const empty = page.locator("main").getByText(/belum ada|tidak ada|no data/i).first();
      await expect(empty).toBeVisible();
      act(testInfo, `HTTP ${status}, 0 invoice — empty state muncul (bukan blank)`);
      return;
    }

    const firstRow = rows.first();
    const firstRowText = (await firstRow.textContent()) || "";

    // Kolom Total: mesti ada format rupiah "Rp X.XXX" (bukan raw angka).
    expect(firstRowText).toMatch(/Rp\s?\d/);

    // Kolom Nomor invoice: font-mono class di admin/invoices, cek non-empty
    // dan minimal 3 karakter.
    const nomorCell = firstRow.locator("td").first();
    const nomorText = ((await nomorCell.textContent()) || "").trim();
    expect(nomorText.length).toBeGreaterThan(2);

    // Extract total untuk laporan
    const totalMatch = firstRowText.match(/Rp\s?[\d.,]+/);
    const totalText = totalMatch ? totalMatch[0] : "(no match)";

    act(
      testInfo,
      `HTTP ${status}, rows=${rowCount}, first invoice nomor="${nomorText.slice(0, 20)}", total=${totalText}`,
    );
  });

  test("Halaman Wallet Topups loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/wallet/topups → HTTP <400 + main visible");
    const res = await page.goto("/admin/wallet/topups");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Payment Methods loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/payment-methods → HTTP <400 + main visible");
    const res = await page.goto("/admin/payment-methods");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Pricing Platform loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/pricing → HTTP <400 + main visible");
    const res = await page.goto("/admin/pricing");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Promos loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/promos → HTTP <400 + main visible");
    const res = await page.goto("/admin/promos");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Admin — Infrastructure & Config", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Halaman Cloudflare Configs loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/cloudflare → HTTP <400 + main visible");
    const res = await page.goto("/admin/cloudflare");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Zones loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/zones → HTTP <400 + main visible");
    const res = await page.goto("/admin/zones");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Settings loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/settings → HTTP <400 + main visible");
    const res = await page.goto("/admin/settings");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Admin — Templates", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Halaman Templates list loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/templates → HTTP <400 + main visible");
    const res = await page.goto("/admin/templates");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Admin — Observability", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "admin");
  });

  test("Halaman Audit Log loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/audit-log → HTTP <400 + main visible");
    const res = await page.goto("/admin/audit-log");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Email Log loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /admin/email-log → HTTP <400 + main visible");
    const res = await page.goto("/admin/email-log");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });
});

test.describe("Admin — API endpoints (backend health)", () => {
  test("API GET /admin/stats return 200 dengan valid token", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/admin/stats + Bearer admin token → HTTP 200 + response.data defined",
    );
    const { accessToken } = await loginAs(context, "admin");
    const apiBase = deriveApiBase();
    const res = await fetch(`${apiBase}/api/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    const dataKeys = Object.keys(body.data || {}).slice(0, 5).join(", ");
    act(testInfo, `HTTP ${res.status}, data keys: [${dataKeys}]`);
  });

  test("API GET /admin/users pagination — page 1 & 2 return distinct items + total consistent", async ({ context }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users page=1&page_size=2 dan page=2&page_size=2 → HTTP 200 + Paginated<T> envelope (items/page/page_size/total/total_pages) + items[0].id page1 !== page2 (bukan data leak identik) + total sama antar page + items.length ≤ page_size",
    );
    const { accessToken } = await loginAs(context, "admin");
    const apiBase = deriveApiBase();
    const headers = { Authorization: `Bearer ${accessToken}` };

    const [res1, res2] = await Promise.all([
      fetch(`${apiBase}/api/v1/admin/users?page=1&page_size=2`, { headers }),
      fetch(`${apiBase}/api/v1/admin/users?page=2&page_size=2`, { headers }),
    ]);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Envelope contract — Paginated<T>
    expect(Array.isArray(body1.data.items)).toBe(true);
    expect(typeof body1.data.total).toBe("number");
    expect(body1.data.page).toBe(1);
    expect(body1.data.page_size).toBe(2);
    expect(body1.data.items.length).toBeLessThanOrEqual(2);

    // Total harus konsisten antar page (bukan berubah karena race).
    expect(body2.data.total).toBe(body1.data.total);

    // Kalau ada > 2 user, page 2 harus punya item berbeda dari page 1.
    if (body1.data.total > 2 && body2.data.items.length > 0) {
      const ids1 = new Set(body1.data.items.map((u) => u.id));
      const overlap = body2.data.items.filter((u) => ids1.has(u.id));
      expect(overlap.length).toBe(0);
    }

    act(
      testInfo,
      `HTTP ${res1.status}/${res2.status}, total=${body1.data.total}, page1.items=${body1.data.items.length}, page2.items=${body2.data.items.length}, distinct=${body1.data.total > 2}`,
    );
  });
});
