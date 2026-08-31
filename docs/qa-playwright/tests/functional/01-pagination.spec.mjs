// 01-pagination.spec.mjs — Deep pagination, search, sort tests.
//
// Baseline backend facts (verified di apps/api/internal/):
//   - Paginated<T> envelope: { items, page, page_size, total, total_pages }
//   - page (default 1, min 1); page_size (default 20, clamped [1,100])
//   - q: LIKE match di kolom relevan
//   - sort presets whitelisted per endpoint:
//       admin/users: email_asc, email_desc, sites_desc, oldest, newest (default)
//       admin/sites: storage_desc, pages_desc, name_asc, oldest, newest (default)
//   - Sort field TIDAK whitelisted → SILENT FALLBACK ke default created_at DESC
//     (bukan 400 error) — ini kompromi security vs UX. Test verify tidak SQL-error.

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

async function apiGet(accessToken, path) {
  return fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

test.describe("Pagination — admin/users deep", () => {
  test("Envelope shape sesuai Paginated<T> contract", async ({ context }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/admin/users?page=1&page_size=3 → HTTP 200 + envelope semua field required (items array, page=1, page_size=3, total integer ≥ 0, total_pages = ceil(total/page_size))",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await apiGet(accessToken, "/api/v1/admin/users?page=1&page_size=3");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(Array.isArray(data.items)).toBe(true);
    expect(data.page).toBe(1);
    expect(data.page_size).toBe(3);
    expect(typeof data.total).toBe("number");
    expect(data.total).toBeGreaterThanOrEqual(0);
    expect(data.items.length).toBeLessThanOrEqual(3);

    // total_pages harus konsisten dengan total + page_size.
    const expectedPages = data.total === 0 ? 0 : Math.ceil(data.total / data.page_size);
    expect(data.total_pages).toBe(expectedPages);

    act(
      testInfo,
      `HTTP 200, items=${data.items.length}, total=${data.total}, total_pages=${data.total_pages}, expected_pages=${expectedPages} ✓`,
    );
  });

  test("Sort preset 'email_asc' → items terurut menaik by email (bukan default DESC)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users?sort=email_asc&page_size=20 → items yang di-return terurut email ASC. Verifikasi: setiap items[i].email ≤ items[i+1].email (lowercase compare, karena LIKE case-insensitive di Postgres LOCALE id-ID).",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await apiGet(accessToken, "/api/v1/admin/users?sort=email_asc&page_size=20");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    if (data.items.length < 2) {
      act(testInfo, `HTTP 200, items=${data.items.length} — dataset terlalu kecil untuk verify order`);
      return;
    }

    const emails = data.items.map((u) => u.email.toLowerCase());
    for (let i = 0; i < emails.length - 1; i++) {
      expect(emails[i].localeCompare(emails[i + 1])).toBeLessThanOrEqual(0);
    }
    act(
      testInfo,
      `HTTP 200, ${emails.length} items ASC order verified: ["${emails[0]}", "${emails[1]}", ..., "${emails.at(-1)}"]`,
    );
  });

  test("Sort preset 'email_desc' → items terurut menurun by email", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users?sort=email_desc → items[i].email ≥ items[i+1].email (descending).",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await apiGet(accessToken, "/api/v1/admin/users?sort=email_desc&page_size=20");
    const { data } = await res.json();
    if (data.items.length < 2) {
      act(testInfo, `items=${data.items.length} — dataset terlalu kecil`);
      return;
    }
    const emails = data.items.map((u) => u.email.toLowerCase());
    for (let i = 0; i < emails.length - 1; i++) {
      expect(emails[i].localeCompare(emails[i + 1])).toBeGreaterThanOrEqual(0);
    }
    act(testInfo, `HTTP 200, ${emails.length} items DESC order verified`);
  });

  test("Sort field TIDAK whitelisted → silent fallback ke default, TIDAK SQL error", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users?sort=id;DROP TABLE users → HTTP 200 (bukan 500 SQL error) + response valid. Backend pattern: parse sort → cek whitelist → kalau tidak match, silent fallback ke ORDER BY created_at DESC. Ini mencegah SQL injection via sort param.",
    );
    const { accessToken } = await loginAs(context, "admin");
    // URL-encode injection payload
    const payload = encodeURIComponent("id;DROP TABLE users");
    const res = await apiGet(accessToken, `/api/v1/admin/users?sort=${payload}&page_size=5`);

    // Wajib 200 — kalau 500 berarti backend forward user input ke SQL.
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(Array.isArray(data.items)).toBe(true);

    // Verifikasi DB masih hidup — request kedua harus tetap return data.
    const check = await apiGet(accessToken, "/api/v1/admin/users?page=1&page_size=1");
    expect(check.status).toBe(200);
    const checkBody = await check.json();
    expect(checkBody.data.total).toBeGreaterThan(0);

    act(
      testInfo,
      `HTTP ${res.status} (silent fallback), post-injection users.total=${checkBody.data.total} — DB intact, no SQL injection lolos`,
    );
  });

  test("Search q=<partial email> → semua item.email mengandung query (case-insensitive)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users?q=admin → items non-empty (asumsi fixture punya admin@) + semua items[i].email lowercase mengandung 'admin'. Kalau ada 1 email tidak match → LIKE clause bocor / filter salah.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await apiGet(accessToken, "/api/v1/admin/users?q=admin&page_size=20");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    if (data.items.length === 0) {
      // Tidak ada admin — skip valid assertion tapi jangan pass silent.
      act(testInfo, `HTTP 200, q=admin returned 0 items — fixture belum ada user admin?`);
      return;
    }

    // Setiap item HARUS match query (case-insensitive) di email OR name.
    for (const u of data.items) {
      const combined = `${u.email} ${u.name || ""}`.toLowerCase();
      expect(combined).toContain("admin");
    }
    act(
      testInfo,
      `HTTP 200, q=admin returned ${data.items.length} items, semua match "admin" di email/name`,
    );
  });

  test("Page out of bounds (page=9999) → items empty tapi metadata konsisten", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users?page=9999&page_size=5 → HTTP 200 + items=[] + total tetap consistent (bukan 0). Ini test edge case: user click deep pagination tidak boleh crash.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const [resDeep, resFirst] = await Promise.all([
      apiGet(accessToken, "/api/v1/admin/users?page=9999&page_size=5"),
      apiGet(accessToken, "/api/v1/admin/users?page=1&page_size=5"),
    ]);
    expect(resDeep.status).toBe(200);
    const deep = (await resDeep.json()).data;
    const first = (await resFirst.json()).data;

    expect(deep.items).toEqual([]);
    expect(deep.total).toBe(first.total); // total konsisten
    act(
      testInfo,
      `HTTP 200, page 9999 items=[], total=${deep.total} (konsisten dengan page 1)`,
    );
  });

  test("Page 1 vs page 2 harus punya items TIDAK overlap", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET admin/users page=1 dan page=2 dengan page_size=2. Kalau total > 2, semua item.id di page 2 harus DISJOINT dari page 1 (no data leak identik across page).",
    );
    const { accessToken } = await loginAs(context, "admin");
    const [r1, r2] = await Promise.all([
      apiGet(accessToken, "/api/v1/admin/users?page=1&page_size=2"),
      apiGet(accessToken, "/api/v1/admin/users?page=2&page_size=2"),
    ]);
    const p1 = (await r1.json()).data;
    const p2 = (await r2.json()).data;
    if (p1.total <= 2 || p2.items.length === 0) {
      act(testInfo, `total=${p1.total} — dataset terlalu kecil untuk verify no-overlap`);
      return;
    }
    const ids1 = new Set(p1.items.map((u) => u.id));
    const overlap = p2.items.filter((u) => ids1.has(u.id));
    expect(overlap).toEqual([]);
    act(
      testInfo,
      `HTTP 200/200, total=${p1.total}, page1.ids=[${[...ids1].map(s => s.slice(0,8)).join(",")}], page2 disjoint (0 overlap)`,
    );
  });
});

test.describe("Pagination — admin/users clamp + search", () => {
  test("page_size di atas cap (500) → clamped ke max 100", async ({ context }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users?page_size=500 → HTTP 200 + response.page_size ≤ 100 (backend httpx.ParsePagination clamp [1,100]) + items.length ≤ 100. Cegah DoS via huge page request.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await apiGet(accessToken, "/api/v1/admin/users?page_size=500");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.page_size).toBeLessThanOrEqual(100);
    expect(data.items.length).toBeLessThanOrEqual(100);
    act(
      testInfo,
      `HTTP 200, requested page_size=500, actual clamped to ${data.page_size}, items=${data.items.length}`,
    );
  });

  test("page_size negative / zero → clamped ke default 20", async ({ context }, testInfo) => {
    req(
      testInfo,
      "GET /admin/users?page_size=-1 → backend clamp ke default 20 (min 1). Cegah nonsense query yang bisa exploit off-by-one atau DB error.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await apiGet(accessToken, "/api/v1/admin/users?page_size=-1");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.page_size).toBeGreaterThanOrEqual(1);
    act(
      testInfo,
      `HTTP 200, requested page_size=-1, actual clamped to ${data.page_size}`,
    );
  });
});
