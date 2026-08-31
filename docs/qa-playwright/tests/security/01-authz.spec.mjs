// 01-authz.spec.mjs — OWASP A01 (Broken Access Control).
// Baseline backend facts (verified di apps/api/internal/):
//   - auth.RequireAdmin/RequireReseller/RequireAgent → 403 (envelope error.code=forbidden)
//   - No JWT → 401 (envelope error.code=unauthorized)
//   - Sites/invoices cross-tenant → 404 (bukan 403, cegah enumeration)

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

test.describe("A01 — Broken Access Control (RBAC)", () => {
  test("Client TIDAK bisa akses admin endpoint (GET /admin/stats → 403 forbidden) @smoke", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/admin/stats + Bearer token role=client → HTTP 403 + envelope error.code='forbidden' (BUKAN 401 karena JWT valid, BUKAN 200 leak)",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await fetch(`${apiBase}/api/v1/admin/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.code).toBeTruthy();
    // Body tidak boleh berisi data stats (bukti tidak leak).
    expect(body.data).toBeUndefined();
    act(
      testInfo,
      `HTTP ${res.status}, error.code="${body.error?.code}", error.message="${(body.error?.message || "").slice(0, 40)}"`,
    );
  });

  test("Agent TIDAK bisa PATCH quota site (admin-only) → 403", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "PATCH /api/v1/admin/sites/<any-uuid>/quota + Bearer token role=agent → HTTP 403 forbidden (RequireAdmin middleware kick sebelum handler dieksekusi, jadi walau UUID tidak exist tetap 403)",
    );
    const { accessToken } = await loginAs(context, "agent");
    const dummyUuid = "00000000-0000-4000-8000-000000000001";
    const res = await fetch(
      `${apiBase}/api/v1/admin/sites/${dummyUuid}/quota`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quota_max_pages: 999 }),
      },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeDefined();
    act(testInfo, `HTTP ${res.status}, error.code="${body.error?.code}"`);
  });

  test("Reseller TIDAK bisa akses agent-only endpoint → 403", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/admin/users + Bearer token role=reseller → HTTP 403 (admin_only), meski reseller manage users mereka, tidak boleh akses cross-tenant admin list",
    );
    const { accessToken } = await loginAs(context, "reseller");
    const res = await fetch(`${apiBase}/api/v1/admin/users?page=1&page_size=5`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(403);
    act(testInfo, `HTTP ${res.status} — reseller ditolak dari /admin/users`);
  });

  test("Request tanpa Authorization header → 401 (bukan 403)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/admin/stats TANPA Authorization header → HTTP 401 unauthorized. Distinguisher penting: 401=perlu login, 403=role kurang. Client/tools bergantung ke perbedaan ini.",
    );
    const res = await fetch(`${apiBase}/api/v1/admin/stats`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeDefined();
    act(
      testInfo,
      `HTTP ${res.status}, error.code="${body.error?.code}" — proper 401 (bukan 403)`,
    );
  });

  test("Malformed Bearer token → 401 (tidak crash 500)", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/auth/me + Authorization 'Bearer garbage-not-a-jwt' → HTTP 401 (bukan 500 stack leak)",
    );
    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      headers: { Authorization: "Bearer garbage-not-a-jwt" },
    });
    expect(res.status).toBe(401);
    const body = await res.text();
    expect(body.toLowerCase()).not.toMatch(/panic|goroutine|stack/);
    act(testInfo, `HTTP ${res.status}, body length=${body.length}, no stack leak`);
  });

  test("Client TIDAK bisa lihat invoice user lain via URL guess → 404 @smoke", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/invoices/<random-uuid-tidak-milik-caller> sebagai client → HTTP 404 (BUKAN 403 — cegah enumeration attacker tahu resource exist tapi ditolak). Backend pattern: ownership check → sentinel ErrNotFound → 404.",
    );
    const { accessToken } = await loginAs(context, "client");
    // UUID acak yang HAMPIR pasti bukan milik client (bahkan kalau exist di DB).
    const randomUuid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const res = await fetch(`${apiBase}/api/v1/invoices/${randomUuid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 404 = expected. 403 = enumeration leak (harusnya fail). 200 = kritis (data leak).
    expect(res.status).toBe(404);
    act(
      testInfo,
      `HTTP ${res.status} — proper 404 (tidak leak resource existence)`,
    );
  });

  test("Client TIDAK bisa lihat site user lain via URL guess → 404", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/sites/<random-uuid> sebagai client → HTTP 404. Pattern GetOwned: WHERE user_id = $current filter di repo query.",
    );
    const { accessToken } = await loginAs(context, "client");
    const randomUuid = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
    const res = await fetch(`${apiBase}/api/v1/sites/${randomUuid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(404);
    act(testInfo, `HTTP ${res.status} — ownership isolation enforced`);
  });

  test("Client TIDAK bisa call /reseller/* endpoints → 403", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/reseller/clients + Bearer client role → HTTP 403 (RequireReseller kick)",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await fetch(`${apiBase}/api/v1/reseller/clients`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Bisa 403 (RequireReseller) atau 404 (endpoint tidak ada) — kritis: TIDAK 200.
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
    act(testInfo, `HTTP ${res.status} — client tidak bisa masuk endpoint reseller`);
  });
});
