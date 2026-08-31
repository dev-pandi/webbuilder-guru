// 03-payment-integrity.spec.mjs — OWASP A08 (Software & Data Integrity Failures).
// Fokus: payment webhook endpoint — cegah unauthorized "mark paid" event yang
// bisa berikan produk (domain register) gratis.
//
// Baseline backend facts (verified di apps/api/internal/paymentwh/handler.go):
//   - POST /webhooks/payment/:code — no auth (public), TAPI signature verify per-gateway
//   - Unknown gateway code → 404
//   - Manual gateway (bank transfer) — tidak dukung webhook → 404
//   - Invalid signature → 401 "signature tidak valid"
//   - Empty code segment → 400 "code kosong"
//   - Rate limit 600 req/60s per source IP (CLAUDE.md)

import { test, expect } from "@playwright/test";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();
// Webhook endpoint di-mount di /webhooks/payment/:code (bukan /api/v1/...).
const WEBHOOK_BASE = `${apiBase}/webhooks/payment`;

test.describe("A08 — Payment webhook integrity", () => {
  test("Unknown gateway code → 404 (bukan 500 leak / 200 accept) @smoke", async ({}, testInfo) => {
    req(
      testInfo,
      "POST /webhooks/payment/nonexistent-gateway-xyz + body dummy → HTTP 404 'gateway tidak dikenal atau disabled'. Kalau backend 200 → CRITICAL: attacker bisa hit endpoint tanpa gateway config dan lolos verify.",
    );
    const res = await fetch(`${WEBHOOK_BASE}/nonexistent-gateway-xyz-${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: "INV-FAKE-001",
        status_code: "200",
        transaction_status: "settlement",
        gross_amount: "1000000.00",
      }),
    });
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body.toLowerCase()).not.toMatch(/panic|goroutine|sql|pgx/);
    act(
      testInfo,
      `HTTP ${res.status}, body length=${body.length}, no stack leak`,
    );
  });

  test("Method GET pada webhook endpoint → 405 method not allowed", async ({}, testInfo) => {
    req(
      testInfo,
      "GET /webhooks/payment/midtrans → HTTP 405. Webhook wajib POST supaya attacker tidak bisa trigger via URL click (email/link). Kalau backend accept GET → CSRF-like risk.",
    );
    const res = await fetch(`${WEBHOOK_BASE}/midtrans`, { method: "GET" });
    // 405 = ideal. Fiber juga mungkin 404 kalau route strict-per-method. Yang penting BUKAN 200.
    expect([405, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
    act(testInfo, `HTTP ${res.status} — GET tidak diterima sebagai webhook trigger`);
  });

  test("POST webhook dengan body kosong ke gateway configured → 400/401/404 (bukan 200 mark-paid)", async ({}, testInfo) => {
    req(
      testInfo,
      "POST /webhooks/payment/midtrans dengan body '{}' TANPA signature → HTTP 4xx (parse error / signature invalid / unknown code). NEVER 200 karena itu artinya invoice bisa di-mark paid tanpa signature verify.",
    );
    const res = await fetch(`${WEBHOOK_BASE}/midtrans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    // Boleh 400/401/404/500 tergantung gateway registered atau tidak.
    // Yang KRITIKAL: bukan 200 (yang berarti webhook diterima sebagai valid).
    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
    act(
      testInfo,
      `HTTP ${res.status} — empty body ditolak (verified integrity gate aktif)`,
    );
  });

  test("Webhook dengan crafted 'settlement' payload tanpa HMAC → 401/404 (tidak lolos)", async ({}, testInfo) => {
    req(
      testInfo,
      "POST /webhooks/payment/midtrans dengan payload menyerupai real Midtrans settlement event (order_id + status settlement) TAPI tanpa signature_key valid → HTTP 4xx. Attack surface real: attacker tebak invoice_id user lain lalu spoof webhook.",
    );
    const fakePayload = {
      order_id: "INV-2026-08-000001",
      status_code: "200",
      transaction_status: "settlement",
      gross_amount: "150000.00",
      // signature_key sengaja missing atau garbage
      signature_key: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const res = await fetch(`${WEBHOOK_BASE}/midtrans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fakePayload),
    });
    expect(res.status).not.toBe(200);
    expect(res.status).toBeGreaterThanOrEqual(400);
    act(
      testInfo,
      `HTTP ${res.status} — fake settlement payload dengan HMAC sampah ditolak`,
    );
  });

  test("Webhook path traversal — code segment dengan '..' → 400/404 (tidak leak)", async ({}, testInfo) => {
    req(
      testInfo,
      "POST /webhooks/payment/..%2Fadmin%2Fusers → HTTP 4xx. Backend TIDAK boleh interpret code sebagai path segment yang bisa reach endpoint lain. Fiber router pattern harus reject.",
    );
    // Double-encoded ../ untuk cek router normalization
    const res = await fetch(`${WEBHOOK_BASE}/..%2Fadmin%2Fusers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).not.toBe(200);
    // 400 (kode invalid) / 404 (unknown gateway) / 405 (method di endpoint tujuan)
    expect(res.status).toBeGreaterThanOrEqual(400);
    act(
      testInfo,
      `HTTP ${res.status} — path traversal di :code segment tidak lolos`,
    );
  });
});
