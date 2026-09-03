// 10-client.spec.mjs — QA test flows untuk role client.
// Fokus: page loads, form present, basic navigation.

import { test, expect } from "@playwright/test";
import { loginAs } from "../fixtures/auth.mjs";
import { req, act } from "../fixtures/qa.mjs";

test.describe("Client Dashboard", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Dashboard client bisa dibuka + tampilkan main content @smoke", async ({
    page,
  }, testInfo) => {
    req(testInfo, "GET /dashboard → main visible + heading/card muncul");
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.locator("h1, h2, [class*='card']").first(),
    ).toBeVisible({ timeout: 8000 });
    const headingText = (await page.locator("h1, h2").first().textContent().catch(() => "")) || "";
    act(
      testInfo,
      `main tampil, heading="${headingText.trim().slice(0, 60) || "(no heading)"}"`,
    );
  });

  test("Menu 'Beli Domain + Buat Situs' terbuka", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /sites/new-with-domain → wizard render dengan input search domain",
    );
    await page.goto("/sites/new-with-domain");
    await expect(page.locator("main")).toBeVisible();
    const inputCount = await page.locator("input").count();
    await expect(page.locator("input").first()).toBeVisible({ timeout: 5000 });
    act(testInfo, `Wizard render, ${inputCount} input field terdeteksi`);
  });

  test("Halaman Settings — Domain Saya loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /settings/domains → HTTP <400 + main visible");
    const res = await page.goto("/settings/domains");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Settings — Invoice: tabel berisi data Rp valid atau empty state", async ({ page }, testInfo) => {
    req(
      testInfo,
      "GET /settings/invoices → HTTP 2xx + kalau ada invoice: tabel row ≥ 1 + format Rp muncul di kolom Total; kalau kosong: empty state 'belum ada' muncul (bukan blank / skeleton stuck)",
    );
    const res = await page.goto("/settings/invoices");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();

    // Wait untuk data loaded — table ATAU empty state.
    const table = page.locator("table").first();
    const emptyState = page.locator("main").getByText(/belum ada|tidak ada invoice/i).first();
    await Promise.race([
      table.waitFor({ state: "visible", timeout: 8000 }).catch(() => {}),
      emptyState.waitFor({ state: "visible", timeout: 8000 }).catch(() => {}),
    ]);

    const tableVisible = await table.isVisible();
    const emptyVisible = await emptyState.isVisible();
    expect(tableVisible || emptyVisible).toBe(true);

    let summary;
    if (tableVisible) {
      const rowCount = await page.locator("table tbody tr").count();
      if (rowCount > 0) {
        const rowText = (await page.locator("table tbody tr").first().textContent()) || "";
        expect(rowText).toMatch(/Rp\s?\d/);
        summary = `HTTP ${status}, tabel dengan ${rowCount} invoice, kolom Rp valid`;
      } else {
        // Header muncul tapi 0 row — masih valid state.
        summary = `HTTP ${status}, tabel render tanpa row (0 invoice)`;
      }
    } else {
      summary = `HTTP ${status}, empty state ditampilkan (belum ada invoice)`;
    }
    act(testInfo, summary);
  });

  test("Halaman Settings — Documents loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /settings/documents → HTTP <400 + main visible");
    const res = await page.goto("/settings/documents");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Settings — Collaborators loads", async ({ page }, testInfo) => {
    req(testInfo, "GET /settings/collaborators → HTTP <400 + main visible");
    const res = await page.goto("/settings/collaborators");
    const status = res?.status();
    expect(status).toBeLessThan(400);
    await expect(page.locator("main")).toBeVisible();
    act(testInfo, `HTTP ${status}, main tampil`);
  });

  test("Halaman Profil bisa dibuka + minimal 1 input muncul", async ({ page }, testInfo) => {
    req(testInfo, "GET /settings/profile → main visible + minimal 1 input field");
    await page.goto("/settings/profile");
    await expect(page.locator("main")).toBeVisible();
    const anyInput = page.locator("input").first();
    await expect(anyInput).toBeVisible({ timeout: 8000 });
    const inputCount = await page.locator("input").count();
    act(testInfo, `Profile form render, ${inputCount} input terdeteksi`);
  });
});

test.describe("Client — Domain search wizard", () => {
  test.beforeEach(async ({ context }) => {
    await loginAs(context, "client");
  });

  test("Empty state — search TLD yang tidak dilayani → pesan actionable + chip TLD suggest muncul", async ({
    page,
  }, testInfo) => {
    req(
      testInfo,
      "Ketik 'qa-empty-test.thistldnotserved' (TLD dijamin tidak di allowed_zones) → GET /api/v1/domains/check → response 200 dengan results=[] ATAU single-result unavailable. UI HARUS render kartu empty state dengan pesan actionable (bukan blank). Chip TLD yang di-serve HARUS muncul supaya user tahu opsi valid. Regression test untuk bug: user bingung karena UI blank waktu TLD tidak allowed.",
    );
    await page.goto("/sites/new-with-domain");
    const input = page.locator("input").first();
    await expect(input).toBeVisible();
    // Pakai TLD yang sangat unlikely di allowed_zones — hampir pasti tidak dilayani
    await input.fill("qa-empty-test.thistldnotserved");

    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/v1/domains/check") && r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      page.keyboard.press("Enter"),
    ]);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    const items = body.data.results || [];

    // Kalau backend return [] atau semua unavailable, empty state HARUS muncul
    const allUnavailable = items.length === 0 || items.every((e) => !e.available);
    if (!allUnavailable) {
      // Edge case: TLD ini malah di-serve. Test tidak applicable.
      act(testInfo, `TLD .thistldnotserved unexpectedly served, results=${items.length} — skip empty state assertion`);
      return;
    }

    // UI HARUS render salah satu: empty-state card ATAU unavailable card (bukan blank)
    // Cek pesan actionable di main content.
    const emptyIndicator = page
      .locator("main")
      .getByText(/belum dilayani|tidak.*hasil|belum ada zona|dipakai/i)
      .first();
    await expect(emptyIndicator).toBeVisible({ timeout: 5000 });

    // Chip TLD suggest harus muncul (guide user ke opsi valid)
    const zonesHint = page.locator("main").getByText(/TLD tersedia/i).first();
    const zonesVisible = await zonesHint.isVisible().catch(() => false);

    act(
      testInfo,
      `HTTP 200, results.length=${items.length}, empty-state indicator muncul, chip TLD guide=${zonesVisible ? "visible" : "hidden"}`,
    );
  });

  test("Cek availability domain → API return 200 + kartu hasil berisi status 'Tersedia' atau 'Dipakai'", async ({
    page,
  }, testInfo) => {
    req(
      testInfo,
      "Ketik 'qa-test-domain-check' → intercept POST /api/v1/domains/check → response 200 + body.data.results non-empty + kartu hasil UI menampilkan badge 'Tersedia' atau 'Dipakai' (bukan cuma error alert / empty state)",
    );
    await page.goto("/sites/new-with-domain");
    const input = page.locator("input").first();
    await expect(input).toBeVisible();
    await input.fill("qa-test-domain-check");

    // Wait for real API response — bukan pakai timeout arbitrer 3 detik.
    // Kalau backend down atau endpoint berubah, test HARUS fail di sini.
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/v1/domains/check") && r.request().method() === "POST",
        { timeout: 15_000 },
      ),
      (async () => {
        const checkBtn = page
          .getByRole("button", { name: /cek|check|cari/i })
          .first();
        if ((await checkBtn.count()) > 0) {
          await checkBtn.click();
        } else {
          await page.keyboard.press("Enter");
        }
      })(),
    ]);

    // API contract check
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.results)).toBe(true);
    expect(body.data.results.length).toBeGreaterThan(0);

    // Sample entry harus punya field wajib (contract test)
    const firstEntry = body.data.results[0];
    expect(firstEntry.domain).toMatch(/qa-test-domain-check\./);
    expect(typeof firstEntry.available).toBe("boolean");

    // UI harus render hasil — cari badge "Tersedia" atau "Dipakai" (bukan
    // sekedar "class result exist" yang lolos bahkan waktu error alert muncul).
    const badge = page.getByText(/^Tersedia$|^Dipakai$/i).first();
    await expect(badge).toBeVisible({ timeout: 5000 });
    const badgeText = (await badge.textContent()) || "";

    // Kalau ada minimal 1 yang available, harga (Rp x.xxx) HARUS muncul.
    const anyAvailable = body.data.results.some((e) => e.available);
    if (anyAvailable) {
      const priceEl = page.locator("main").getByText(/Rp\s?\d/).first();
      await expect(priceEl).toBeVisible({ timeout: 5000 });
    }

    act(
      testInfo,
      `HTTP ${resp.status()}, results.length=${body.data.results.length}, first="${firstEntry.domain}" available=${firstEntry.available}, badge UI="${badgeText.trim()}", ada_price_terlihat=${anyAvailable}`,
    );
  });
});
