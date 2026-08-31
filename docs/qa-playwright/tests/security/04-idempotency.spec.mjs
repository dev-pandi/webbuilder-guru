// 04-idempotency.spec.mjs — OWASP A04 (Insecure Design) — Idempotency-Key enforcement.
// Fokus: cegah double-charge saat browser retry / user double-click "Bayar".
//
// Baseline backend facts (verified di apps/api/internal/domain_purchase/purchase.go:108-113):
//   - POST /api/v1/domains/purchase TANPA header Idempotency-Key → 400 dengan
//     error.code="idempotency_key_required"
//   - Purchase validation: domain, tld, years 1-10, payment_method required
//   - Ownership check: on_behalf_of_user_id butuh reseller/agent role
//
// Kita TIDAK test double-charge dengan real purchase (butuh valid TLD + wallet balance).
// Yang di-test: gate Idempotency-Key aktif SEBELUM apapun DB mutation.

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

test.describe("A04 — Idempotency-Key enforcement", () => {
  test("POST /domains/purchase TANPA Idempotency-Key → 400 code=idempotency_key_required (atau 429 rate limit) @smoke", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /api/v1/domains/purchase + Bearer token client, body minimal valid, TANPA header 'Idempotency-Key' → HTTP 400 dengan envelope error.code='idempotency_key_required' (gate ideal). Kalau QA run beruntun kena purchase rate limit (20/jam per user), 429 tetap ACCEPTABLE karena itu juga gate. KRITIS: bukan 200.",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await fetch(`${apiBase}/api/v1/domains/purchase`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Idempotency-Key sengaja missing
      },
      body: JSON.stringify({
        domain: "qa-idem-test.biz.id",
        tld: "biz.id",
        years: 1,
        payment_method: "deposit_wallet",
      }),
    });
    expect([400, 429]).toContain(res.status);
    const body = await res.json().catch(() => ({}));
    if (res.status === 400) {
      expect(body.error?.code).toBe("idempotency_key_required");
    }
    act(
      testInfo,
      `HTTP ${res.status}, error.code="${body.error?.code || "n/a"}" — ${res.status === 429 ? "purchase rate limit gate" : "idem_key_required gate"}`,
    );
  });

  test("POST /domains/purchase dengan Idempotency-Key whitespace → 400 (dianggap missing) atau 429", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /domains/purchase + header 'Idempotency-Key:    ' (whitespace) → HTTP 400 idempotency_key_required. Backend strings.TrimSpace treat whitespace = missing. 429 valid alternative kalau purchase rate limit kick.",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await fetch(`${apiBase}/api/v1/domains/purchase`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "   ",
      },
      body: JSON.stringify({
        domain: "qa-idem-test.biz.id",
        tld: "biz.id",
        years: 1,
        payment_method: "deposit_wallet",
      }),
    });
    expect([400, 429]).toContain(res.status);
    const body = await res.json().catch(() => ({}));
    if (res.status === 400) {
      expect(body.error?.code).toBe("idempotency_key_required");
    }
    act(
      testInfo,
      `HTTP ${res.status} — ${res.status === 429 ? "purchase rate limit" : "whitespace-only Idempotency-Key ditolak sebagai missing"}`,
    );
  });

  test("POST /domains/renew TANPA Idempotency-Key → 400/404/429 (gate aktif)", async ({ context }, testInfo) => {
    req(
      testInfo,
      "POST /api/v1/domains/qa-renew-test.biz.id/renew + Bearer + body payment_method valid, TANPA Idempotency-Key → 400 (idem gate) atau 404 (ownership) atau 429 (purchase rate limit 20/jam per user). Ketiga status ini semua = gate aktif, endpoint TIDAK menerima renew tanpa proper input. Yang KRITIS: bukan 200 (charged).",
    );
    const { accessToken } = await loginAs(context, "client");
    const res = await fetch(
      `${apiBase}/api/v1/domains/qa-renew-nonexistent.biz.id/renew`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          years: 1,
          payment_method: "deposit_wallet",
        }),
      },
    );
    expect([400, 403, 404, 429]).toContain(res.status);
    expect(res.status).not.toBe(200);
    const body = await res.json().catch(() => ({}));
    act(
      testInfo,
      `HTTP ${res.status}, error.code="${body.error?.code || "n/a"}" — gate aktif (${res.status === 429 ? "rate limit 20/jam" : "input validation"})`,
    );
  });

  test("POST /domains/purchase dengan Idempotency-Key valid tapi body invalid → 400 validation (bukan lewat idem gate)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /domains/purchase + Idempotency-Key='qa-test-<random>' + body dengan years=99 (out of range 1-10) → HTTP 400 validation error, bukan idem_key_required. Verifies validation urutan waras: idem passes → validation next.",
    );
    const { accessToken } = await loginAs(context, "client");
    const idemKey = `qa-test-${crypto.randomUUID()}`;
    const res = await fetch(`${apiBase}/api/v1/domains/purchase`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        domain: "qa-idem-test.biz.id",
        tld: "biz.id",
        years: 99, // invalid — max 10
        payment_method: "deposit_wallet",
      }),
    });
    // 400 = idem lolos ke validation (ideal). 429 = purchase rate limit (20/jam per user).
    // Yang KRITIS: bukan 200 (charge lolos).
    expect([400, 429]).toContain(res.status);
    const body = await res.json().catch(() => ({}));
    if (res.status === 400) {
      // Error code BUKAN idempotency_key_required — buktinya idem lolos ke validation.
      expect(body.error?.code).not.toBe("idempotency_key_required");
    }
    act(
      testInfo,
      `HTTP ${res.status}, error.code="${body.error?.code || "n/a"}" — ${res.status === 429 ? "purchase rate limit 20/jam kick" : "validation pipeline waras (idem lolos)"}`,
    );
  });
});
