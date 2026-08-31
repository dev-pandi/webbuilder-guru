// 03-site-publish-e2e.spec.mjs — End-to-end: create site → create page →
// publish page → GET public renderer endpoint → verify tree content match.
//
// Baseline backend facts:
//   - POST /api/v1/sites {name, theme} → 201 dengan {id, slug, status='draft'}
//   - POST /api/v1/sites/:id/pages {slug, title, tree, seo, is_home} → 201
//   - PATCH /api/v1/pages/:id → update draft tree_json
//   - POST /api/v1/pages/:id/publish → copy tree_json → published_tree_json
//   - GET /public/sites/:id/pages/:slug → return published_tree_json sebagai 'tree'
//     - slug='_home' → cari is_home=true
//     - 404 kalau published_tree_json IS NULL (belum di-publish)
//   - DELETE /api/v1/sites/:id → cleanup owned site

import { test, expect } from "@playwright/test";
import { loginAs } from "../../fixtures/auth.mjs";
import { deriveApiBase } from "../../fixtures/accounts.mjs";
import { req, act } from "../../fixtures/qa.mjs";

const apiBase = deriveApiBase();

// Backend `/public/*` cache 5 detik (Fiber cache middleware di router/global.go:116).
// Untuk verify publish reflect ke public endpoint, tunggu cache expire.
const PUBLIC_CACHE_MS = 5_500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

test.describe("E2E — Site create → edit → publish → renderer", () => {
  test("Full lifecycle: create site + page draft, publish, public GET returns published tree", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      [
        "1) POST /sites {name: 'QA E2E ...'} → 201 site.id, status='draft'",
        "2) POST /sites/:id/pages {slug: 'home', title, tree, is_home: true} → 201 page.id",
        "3) GET /public/sites/:id/pages/_home BEFORE publish → 404 (published_tree_json NULL)",
        "4) POST /pages/:id/publish → 200",
        "5) GET /public/sites/:id/pages/_home AFTER publish → 200 + tree.blocks[0].props.text = 'QA E2E marker <timestamp>'",
        "6) DELETE /sites/:id → cleanup (idempotent kalau gagal)",
      ].join(" | "),
    );

    const { accessToken } = await loginAs(context, "client");
    const marker = `QA E2E marker ${Date.now()}`;
    let siteId = null;

    try {
      // === Step 1: Create site ===
      const createRes = await api("POST", accessToken, "/api/v1/sites", {
        name: `QA E2E Test ${Date.now()}`,
        theme: {
          colors: { primary: "#3b82f6", bg: "#ffffff", fg: "#111111" },
        },
      });
      expect(createRes.status).toBe(201);
      const site = (await createRes.json()).data;
      siteId = site.id;
      expect(site.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(site.status).toBe("draft");
      expect(site.slug.length).toBeGreaterThan(0);

      // === Step 2: Create home page dengan tree berisi marker unik ===
      const pageBody = {
        slug: "home",
        title: "QA E2E Home",
        tree: {
          blocks: [
            {
              type: "Heading",
              props: { text: marker, level: "h1" },
            },
          ],
        },
        seo: { title: "QA E2E Home SEO" },
        is_home: true,
      };
      const pageRes = await api("POST", accessToken, `/api/v1/sites/${siteId}/pages`, pageBody);
      expect(pageRes.status).toBe(201);
      const page = (await pageRes.json()).data;
      const pageId = page.id;
      expect(page.is_home).toBe(true);
      expect(page.tree.blocks[0].props.text).toBe(marker);

      // === Step 3: Public GET SEBELUM publish → 404 ===
      // published_tree_json masih NULL, endpoint public reject.
      const preRes = await fetch(
        `${apiBase}/public/sites/${siteId}/pages/_home`,
      );
      expect(preRes.status).toBe(404);

      // === Step 4: Publish page ===
      const pubRes = await api("POST", accessToken, `/api/v1/pages/${pageId}/publish`);
      expect(pubRes.status).toBe(200);

      // Tunggu cache /public/* (5s) expire supaya fetch berikutnya
      // baca fresh state (bukan cached 404 dari step 3).
      await sleep(PUBLIC_CACHE_MS);

      // === Step 5: Public GET SETELAH publish → 200 + tree berisi marker ===
      const postRes = await fetch(
        `${apiBase}/public/sites/${siteId}/pages/_home`,
      );
      expect(postRes.status).toBe(200);
      const pubData = (await postRes.json()).data;
      expect(pubData.tree.blocks[0].props.text).toBe(marker);
      expect(pubData.is_home).toBe(true);

      act(
        testInfo,
        `Site created (id=${siteId.slice(0, 8)}, slug="${site.slug}"), page id=${pageId.slice(0, 8)}, pre-publish=404, post-publish=200, tree marker match="${marker.slice(0, 30)}..."`,
      );
    } finally {
      // === Step 6: Cleanup — hapus site (idempotent) ===
      if (siteId) {
        await api("DELETE", accessToken, `/api/v1/sites/${siteId}`).catch(() => {});
      }
    }
  });

  test("PATCH page tree → GET page (draft) reflects update, tapi /public (published) TIDAK berubah sampai republish", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "Verify draft/published separation: edit draft tree_json, /api/v1/pages/:id (draft view) berubah, tapi /public/sites/:id/pages/_home (published view) TETAP nilai lama sampai POST /pages/:id/publish. Ini invariant kritis — user preview draft tanpa expose ke publik.",
    );
    const { accessToken } = await loginAs(context, "client");
    const original = `original ${Date.now()}`;
    const edited = `edited ${Date.now()}`;
    let siteId = null;
    try {
      // Setup: site + page published
      const createRes = await api("POST", accessToken, "/api/v1/sites", {
        name: `QA Draft Test ${Date.now()}`,
        theme: {},
      });
      expect(createRes.status).toBe(201);
      const site = (await createRes.json()).data;
      siteId = site.id;

      const pageRes = await api("POST", accessToken, `/api/v1/sites/${siteId}/pages`, {
        slug: "home",
        title: "Draft Test",
        tree: { blocks: [{ type: "Heading", props: { text: original } }] },
        seo: {},
        is_home: true,
      });
      const page = (await pageRes.json()).data;
      const pageId = page.id;

      // Publish original + wait cache expire supaya fetch berikutnya fresh
      await api("POST", accessToken, `/api/v1/pages/${pageId}/publish`);
      await sleep(PUBLIC_CACHE_MS);
      const pub1 = await (await fetch(`${apiBase}/public/sites/${siteId}/pages/_home`)).json();
      expect(pub1.data.tree.blocks[0].props.text).toBe(original);

      // Edit draft (PATCH) — jangan publish
      await api("PATCH", accessToken, `/api/v1/pages/${pageId}`, {
        tree: { blocks: [{ type: "Heading", props: { text: edited } }] },
        seo: {},
      });

      // Fetch draft (owner, non-cached endpoint) — HARUS "edited"
      const draftRes = await api("GET", accessToken, `/api/v1/pages/${pageId}`);
      expect(draftRes.status).toBe(200);
      const draftBody = await draftRes.json();
      expect(draftBody.data.tree.blocks[0].props.text).toBe(edited);

      // Verify PUBLISHED masih "original" — public endpoint cache 5s, tapi
      // published_tree_json di DB memang belum berubah. Kalau kita fetch
      // dari cached response, itu tetap "original" (correct). Kalau kita
      // fetch dari cache-miss, itu juga "original" (correct). Either way pass.
      const pub2 = await (await fetch(`${apiBase}/public/sites/${siteId}/pages/_home`)).json();
      expect(pub2.data.tree.blocks[0].props.text).toBe(original);

      // Publish edited → tunggu cache expire → verify public switch
      await api("POST", accessToken, `/api/v1/pages/${pageId}/publish`);
      await sleep(PUBLIC_CACHE_MS);
      const pub3 = await (await fetch(`${apiBase}/public/sites/${siteId}/pages/_home`)).json();
      expect(pub3.data.tree.blocks[0].props.text).toBe(edited);

      act(
        testInfo,
        `Published pre-edit="${original.slice(-15)}", draft post-edit="${edited.slice(-15)}", public post-edit (belum publish)="${original.slice(-15)}", public post-republish="${edited.slice(-15)}" — draft/published isolation verified`,
      );
    } finally {
      if (siteId) {
        await api("DELETE", accessToken, `/api/v1/sites/${siteId}`).catch(() => {});
      }
    }
  });

  test("Cross-tenant: client A TIDAK bisa PATCH page milik client B → 404", async ({
    context,
  }, testInfo) => {
    req(
      testInfo,
      "Setup: client bikin site + page. Coba PATCH page pakai token role LAIN (agent) → 404 (bukan 403, karena ownership pattern: WHERE user_id = current → not found). Ini memastikan tidak ada cross-tenant page mutation.",
    );
    const { accessToken: clientToken } = await loginAs(context, "client");
    const { accessToken: agentToken } = await loginAs(context, "agent");
    let siteId = null;
    try {
      const createRes = await api("POST", clientToken, "/api/v1/sites", {
        name: `QA CrossTenant ${Date.now()}`,
        theme: {},
      });
      const site = (await createRes.json()).data;
      siteId = site.id;

      const pageRes = await api("POST", clientToken, `/api/v1/sites/${siteId}/pages`, {
        slug: "home",
        title: "Owner-only",
        tree: { blocks: [] },
        seo: {},
        is_home: true,
      });
      const pageId = (await pageRes.json()).data.id;

      // Agent coba PATCH page milik client
      const evilPatch = await api("PATCH", agentToken, `/api/v1/pages/${pageId}`, {
        tree: { blocks: [{ type: "Heading", props: { text: "PWNED" } }] },
        seo: {},
      });
      // Ownership check: agent bukan owner site → 404 not found
      expect([403, 404]).toContain(evilPatch.status);
      expect(evilPatch.status).not.toBe(200);

      // Verify page draft masih untouched
      const verifyRes = await api("GET", clientToken, `/api/v1/pages/${pageId}`);
      const verifyData = (await verifyRes.json()).data;
      const finalText =
        (verifyData.tree.blocks[0] && verifyData.tree.blocks[0].props?.text) || "(empty)";
      expect(finalText).not.toBe("PWNED");

      act(
        testInfo,
        `Cross-tenant PATCH by agent → HTTP ${evilPatch.status}, page tree tidak berubah (blocks.length=${verifyData.tree.blocks.length})`,
      );
    } finally {
      if (siteId) {
        await api("DELETE", clientToken, `/api/v1/sites/${siteId}`).catch(() => {});
      }
    }
  });
});
