// 02-wallet-ledger.spec.mjs — Wallet balance vs ledger consistency.
//
// Baseline backend facts (verified di apps/api/internal/wallet_local/):
//   - GET /api/v1/wallet → { balance: int64 (IDR minor), currency: "IDR", ... }
//   - GET /api/v1/wallet/ledger → { items: [...LedgerEntry], page, limit }
//   - LedgerEntry: { id, delta (int64 signed), reason, balance_after, created_at, ... }
//   - Order: DESC by created_at → item[0] = latest
//   - Reasons: topup, debit_register, debit_renew, refund, admin_adjust
//   - Balance ADALAH append-only sum — jadi:
//     - items[0].balance_after HARUS = current balance (kalau ada entry)
//     - Kalau balance = 0 dan tidak ada entry, itu valid (fresh account)

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

async function walletGet(accessToken, path) {
  return fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

test.describe("Wallet — balance vs ledger consistency", () => {
  test("Reseller wallet balance == balance_after latest ledger entry", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/wallet + GET /api/v1/wallet/ledger sebagai reseller. Invariant: kalau ada minimal 1 ledger entry, balance saat ini HARUS = items[0].balance_after (append-only integrity). Kalau ledger kosong, balance = 0.",
    );
    const { accessToken } = await loginAs(context, "reseller");

    const [balRes, ledRes] = await Promise.all([
      walletGet(accessToken, "/api/v1/wallet"),
      walletGet(accessToken, "/api/v1/wallet/ledger?limit=50"),
    ]);
    expect(balRes.status).toBe(200);
    expect(ledRes.status).toBe(200);
    const bal = (await balRes.json()).data;
    const led = (await ledRes.json()).data;

    expect(bal.currency).toBe("IDR");
    expect(typeof bal.balance).toBe("number");
    expect(Array.isArray(led.items)).toBe(true);

    if (led.items.length === 0) {
      expect(bal.balance).toBe(0);
      act(testInfo, `Ledger kosong, balance=0 (fresh account) ✓`);
      return;
    }

    const latest = led.items[0];
    expect(latest.balance_after).toBe(bal.balance);

    act(
      testInfo,
      `balance=Rp ${bal.balance.toLocaleString("id-ID")}, ledger[0].balance_after=Rp ${latest.balance_after.toLocaleString("id-ID")}, reason="${latest.reason}" — MATCH ✓`,
    );
  });

  test("Ledger delta consecutive: entry[i].balance_after + entry[i-1].delta == entry[i-1].balance_after", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "Setiap 2 entry berturutan harus memenuhi: entry_lama.balance_after + entry_baru.delta = entry_baru.balance_after. (order DESC: item[0]=terbaru, item[N]=terlama.) Kalau ada mismatch, ledger sudah di-tamper atau ada race di append.",
    );
    const { accessToken } = await loginAs(context, "reseller");
    const res = await walletGet(accessToken, "/api/v1/wallet/ledger?limit=50");
    const { data } = await res.json();

    if (data.items.length < 2) {
      act(testInfo, `Ledger cuma ${data.items.length} entry — tidak bisa verify consecutive delta`);
      return;
    }

    // items[0] = latest; items[i-1] = lebih baru dari items[i].
    // Verify: items[i-1].balance_after = items[i].balance_after + items[i-1].delta
    let checked = 0;
    for (let i = data.items.length - 1; i > 0; i--) {
      const older = data.items[i];
      const newer = data.items[i - 1];
      const expected = older.balance_after + newer.delta;
      expect(newer.balance_after).toBe(expected);
      checked++;
    }
    act(
      testInfo,
      `${data.items.length} entries verified, ${checked} consecutive delta pairs match (append-only integrity ok)`,
    );
  });

  test("Ledger reason values di allowlist (tidak ada reason ngawur)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "Setiap ledger entry harus punya reason ∈ {topup, debit_register, debit_renew, refund, admin_adjust}. Kalau ada reason lain → schema drift atau data corruption.",
    );
    const { accessToken } = await loginAs(context, "reseller");
    const res = await walletGet(accessToken, "/api/v1/wallet/ledger?limit=50");
    const { data } = await res.json();
    if (data.items.length === 0) {
      act(testInfo, `Ledger kosong — tidak ada reason untuk di-verify`);
      return;
    }
    const validReasons = new Set([
      "topup",
      "debit_register",
      "debit_renew",
      "refund",
      "admin_adjust",
    ]);
    const invalidEntries = data.items.filter((e) => !validReasons.has(e.reason));
    expect(invalidEntries).toEqual([]);
    const reasonCounts = data.items.reduce((acc, e) => {
      acc[e.reason] = (acc[e.reason] || 0) + 1;
      return acc;
    }, {});
    act(
      testInfo,
      `${data.items.length} entries, reason breakdown: ${JSON.stringify(reasonCounts)}`,
    );
  });

  test("Ledger delta konsisten dengan reason (topup=positive, debit=negative)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "Setiap entry: reason='topup' atau 'refund' → delta > 0; reason='debit_register' atau 'debit_renew' → delta < 0. Reason 'admin_adjust' bisa +/- (skip check). Kalau delta arah salah → bug di ledger writer.",
    );
    const { accessToken } = await loginAs(context, "reseller");
    const res = await walletGet(accessToken, "/api/v1/wallet/ledger?limit=50");
    const { data } = await res.json();
    if (data.items.length === 0) {
      act(testInfo, `Ledger kosong`);
      return;
    }
    const mismatched = data.items.filter((e) => {
      if (e.reason === "topup" || e.reason === "refund") return e.delta <= 0;
      if (e.reason === "debit_register" || e.reason === "debit_renew") return e.delta >= 0;
      return false; // admin_adjust bebas
    });
    expect(mismatched).toEqual([]);
    act(
      testInfo,
      `${data.items.length} entries, semua delta arah konsisten dengan reason`,
    );
  });

  test("Client TIDAK punya akses /api/v1/wallet (403 — bukan role wallet-holder)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "GET /api/v1/wallet + Bearer client → HTTP 403 atau 404. Client tidak boleh punya wallet balance (fitur khusus reseller/agent). Kalau 200 dengan balance → schema/permission bocor.",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await walletGet(accessToken, "/api/v1/wallet");
    // Bisa 403 (RequireReseller/Agent) atau 200 dengan balance=0 (fallback).
    // Yang KRITIS: kalau 200, balance harus 0 (no leak balance orang lain).
    if (res.status === 200) {
      const { data } = await res.json();
      expect(data.balance).toBe(0);
      act(testInfo, `HTTP 200, balance=0 — client tidak punya real wallet`);
    } else {
      expect([403, 404]).toContain(res.status);
      act(testInfo, `HTTP ${res.status} — endpoint di-block untuk client role`);
    }
  });
});
