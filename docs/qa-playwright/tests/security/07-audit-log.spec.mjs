// 07-audit-log.spec.mjs — OWASP A09 (Logging & Monitoring Failures).
//
// Baseline backend facts (verified di apps/api/internal/audit/):
//   - Endpoint: GET /api/v1/admin/audit-log (RequireAdmin)
//   - Envelope: Paginated<Entry>
//   - Entry fields: id, actor_id, event, target_type, target_id, metadata, created_at,
//                   actor_email, actor_name (joined dari users)
//   - Filter query: event, actor_id, target_type, target_id, since, until (RFC3339)
//   - Pagination: page, page_size (max 200)
//   - Events yang di-log: purchase.created, purchase.retried, purchase.on_behalf_of,
//     admin.user_promoted, admin.user_demoted, admin.user_deleted, admin.site_deleted,
//     reseller.applied/approved/suspended, agent.invited, client.invited,
//     invitation.accepted, promo.applied, wallet.topup_initiated, wallet.proof_uploaded,
//     site_member.added/removed/left, dll.

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

async function api(method, accessToken, path, body) {
  return fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test.describe("A09 — Audit log integrity + contract", () => {
  test("GET /admin/audit-log envelope shape + entry fields lengkap", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/admin/audit-log?page_size=5 → HTTP 200 + Paginated<Entry> envelope. Entry field WAJIB: id (UUID), event (non-empty string), target_type, target_id, created_at (RFC3339), actor_email (join valid dari users, atau NULL untuk system action). Kalau field missing → schema drift.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await api("GET", accessToken, "/api/v1/admin/audit-log?page_size=5");
    expect(res.status).toBe(200);
    const { data } = await res.json();

    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.page).toBe(1);
    expect(data.page_size).toBe(5);

    if (data.items.length === 0) {
      act(testInfo, `HTTP 200, envelope valid, tapi audit log kosong — tidak bisa verify entry shape`);
      return;
    }

    // Verify entry shape
    const entry = data.items[0];
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof entry.event).toBe("string");
    expect(entry.event.length).toBeGreaterThan(0);
    expect(entry).toHaveProperty("target_type");
    expect(entry).toHaveProperty("target_id");
    expect(entry).toHaveProperty("created_at");
    expect(entry).toHaveProperty("actor_email");
    // created_at valid ISO
    expect(new Date(entry.created_at).toString()).not.toBe("Invalid Date");

    act(
      testInfo,
      `HTTP 200, total=${data.total}, first entry event="${entry.event}", actor="${entry.actor_email || "(system)"}", target=${entry.target_type}, created_at=${entry.created_at.slice(0, 19)}`,
    );
  });

  test("Filter ?event=<name> → semua entries.event = <name>", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/audit-log?event=purchase.created → semua items[i].event === 'purchase.created'. Kalau ada 1 entry event beda → filter bocor / SQL LIKE salah.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const targetEvent = "purchase.created";
    const res = await api("GET", accessToken, `/api/v1/admin/audit-log?event=${targetEvent}&page_size=50`);
    const { data } = await res.json();

    if (data.items.length === 0) {
      act(testInfo, `event="${targetEvent}" returned 0 entries — no purchase yet di test env`);
      return;
    }
    const nonMatching = data.items.filter((e) => e.event !== targetEvent);
    expect(nonMatching).toEqual([]);
    act(
      testInfo,
      `HTTP 200, ${data.items.length} entries semua event="${targetEvent}" (0 non-matching)`,
    );
  });

  test("Filter ?since=<future date> → items kosong (semua audit sebelum future)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/audit-log?since=2099-01-01T00:00:00Z → items=[]. Verify since filter enforces created_at >= since. Kalau ada entry lolos → date parsing gagal atau filter lupa apply.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await api("GET", accessToken, "/api/v1/admin/audit-log?since=2099-01-01T00:00:00Z&page_size=5");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.items).toEqual([]);
    act(testInfo, `HTTP 200, items=[] (since=2099 filter bekerja)`);
  });

  test("Filter ?since=<past> ?until=<past> → semua entries dalam range", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/audit-log?since=2000-01-01T00:00:00Z&until=2099-01-01T00:00:00Z → range super luas → banyak items. Verify semua entries.created_at within [since, until] (inklusif).",
    );
    const { accessToken } = await loginAs(context, "admin");
    const since = "2000-01-01T00:00:00Z";
    const until = "2099-01-01T00:00:00Z";
    const res = await api(
      "GET",
      accessToken,
      `/api/v1/admin/audit-log?since=${since}&until=${until}&page_size=20`,
    );
    const { data } = await res.json();
    if (data.items.length === 0) {
      act(testInfo, `Range super luas returned 0 items — audit log kosong`);
      return;
    }
    const sinceMs = new Date(since).getTime();
    const untilMs = new Date(until).getTime();
    for (const e of data.items) {
      const ts = new Date(e.created_at).getTime();
      expect(ts).toBeGreaterThanOrEqual(sinceMs);
      expect(ts).toBeLessThanOrEqual(untilMs);
    }
    act(
      testInfo,
      `${data.items.length} entries semua dalam range [${since.slice(0, 10)} .. ${until.slice(0, 10)}]`,
    );
  });

  test("Non-admin TIDAK boleh baca /admin/audit-log → 403", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/audit-log + Bearer client role → HTTP 403. Audit log = kritis (bisa expose PII actor + business events). RequireAdmin middleware WAJIB block.",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await api("GET", accessToken, "/api/v1/admin/audit-log");
    expect(res.status).toBe(403);
    act(testInfo, `HTTP ${res.status} — non-admin ditolak dari audit log`);
  });

  test("Filter injection ?actor_id=<not-uuid> → 400 atau silent empty (bukan SQL error 500)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/audit-log?actor_id=not-a-uuid → HTTP 400 (validation) atau HTTP 200 items=[]. NEVER 500 dengan SQL error message.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await api("GET", accessToken, "/api/v1/admin/audit-log?actor_id=not-a-uuid-payload");
    expect(res.status).not.toBe(500);
    expect([200, 400]).toContain(res.status);
    if (res.status === 500) {
      const body = await res.text();
      expect(body.toLowerCase()).not.toMatch(/pgx|sql|panic/);
    }
    act(testInfo, `HTTP ${res.status} — invalid UUID di actor_id tidak trigger 500`);
  });

  test("Pagination page_size cap = 200 (higher dari default 100)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /admin/audit-log?page_size=500 → response.page_size di-clamp. Audit log allow max 200 (per handler line 33) — di atas 200 → 200.",
    );
    const { accessToken } = await loginAs(context, "admin");
    const res = await api("GET", accessToken, "/api/v1/admin/audit-log?page_size=500");
    expect(res.status).toBe(200);
    const { data } = await res.json();
    // page_size cap 200 di audit log (bukan 100 seperti endpoint lain).
    expect(data.page_size).toBeLessThanOrEqual(200);
    expect(data.items.length).toBeLessThanOrEqual(200);
    act(
      testInfo,
      `HTTP 200, requested 500 → clamped page_size=${data.page_size}, items=${data.items.length}`,
    );
  });
});
