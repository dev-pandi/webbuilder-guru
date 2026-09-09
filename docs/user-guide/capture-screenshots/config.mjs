// config.mjs — konfigurasi capture screenshot.
//
// Isi kredensial + URL sesuai environment Anda (staging atau production).
// PENTING: JANGAN commit file ini ke git kalau isi credential production.
// Sudah include di .gitignore folder ini.
//
// Recommended: pakai environment STAGING (bukan production live) supaya:
//   - Tidak polute data user real
//   - Bisa isi dummy data yang representatif
//   - Aman kalau ada bug script

export const config = {
  // Base URL platform Anda. Ganti sesuai deployment:
  //   Dev:  http://localhost:3000
  //   Prod: https://bikinweb.pandi.id
  baseUrl: process.env.BASE_URL || "http://localhost:3000",

  // Akun test per role. Wajib pre-existing di DB dengan role yang benar.
  // Buat 4 akun ini di admin panel dulu sebelum jalanin script.
  accounts: {
    client: {
      email: process.env.CLIENT_EMAIL || "client@example.com",
      password: process.env.CLIENT_PASSWORD || "changeme123",
    },
    agent: {
      email: process.env.AGENT_EMAIL || "agent@example.com",
      password: process.env.AGENT_PASSWORD || "changeme123",
    },
    reseller: {
      email: process.env.RESELLER_EMAIL || "reseller@example.com",
      password: process.env.RESELLER_PASSWORD || "changeme123",
    },
    admin: {
      email: process.env.ADMIN_EMAIL || "admin@example.com",
      password: process.env.ADMIN_PASSWORD || "changeme123",
    },
  },

  // Sample IDs — hardcode ID dari data test Anda supaya konsisten setiap run.
  // Kalau kosong, script akan cari dari list otomatis (pilih row pertama).
  sampleIds: {
    siteId: process.env.SAMPLE_SITE_ID || "",
    domain: process.env.SAMPLE_DOMAIN || "",
    clientId: process.env.SAMPLE_CLIENT_ID || "",
    resellerId: process.env.SAMPLE_RESELLER_ID || "",
  },

  // Viewport untuk screenshot. 1440x900 = MacBook standard, cover >90% users.
  viewport: {
    width: 1440,
    height: 900,
  },

  // Output folder — screenshot di-save di sini. Relative ke script.
  outputDir: "../screenshots",

  // Delay antar action (ms) — biar loading state + animation sempet render.
  delays: {
    afterNavigate: 2000, // wait network idle + hydration
    afterClick: 800,     // wait animation / dialog open
    beforeScreenshot: 500,
  },

  // Screenshot options
  screenshot: {
    type: "png",
    fullPage: false, // false = viewport only, true = seluruh scroll
    omitBackground: false,
  },
};

// Daftar capture per role. Setiap entry:
//   name: nama file output (tanpa .png)
//   path: URL path relative dari baseUrl (bisa function untuk dinamis)
//   waitFor: selector CSS yang harus muncul sebelum screenshot (biar tidak
//            capture skeleton loading)
//   action: (opsional) function async untuk interact dulu sebelum screenshot
//           (mis. buka dialog, click tab)
//   fullPage: (opsional) override screenshot.fullPage
export const captures = {
  // ==================== CLIENT ====================
  client: [
    {
      name: "client-dashboard",
      path: "/dashboard",
      waitFor: 'h1, [data-testid="dashboard"], main',
    },
    {
      name: "client-wizard-search",
      path: "/sites/new-with-domain",
      waitFor: 'input[placeholder*="domain" i], input[type="search"], main',
    },
    {
      name: "client-wizard-confirm",
      path: "/sites/new-with-domain",
      waitFor: 'input',
      // Fill domain search + trigger check untuk capture step 2
      action: async (page) => {
        const input = page.locator('input').first();
        await input.fill("mytoko-demo");
        await page.keyboard.press("Enter");
        // Wait for results
        await page.waitForTimeout(3000);
      },
    },
    {
      name: "client-theme-page",
      path: (ids) => `/sites/${ids.siteId}/theme`,
      requiresSiteId: true,
      waitFor: 'main, input[type="color"], [class*="theme"]',
    },
    {
      name: "client-editor-overview",
      path: (ids) => `/sites/${ids.siteId}/editor`,
      requiresSiteId: true,
      waitFor: 'main',
      // Editor punya banyak animation — extra wait
      preScreenshotDelay: 3000,
    },
    {
      name: "client-domain-detail",
      path: (ids) => `/settings/domains/${ids.domain}`,
      requiresDomain: true,
      waitFor: 'main, h1',
    },
    {
      name: "client-settings-wallet",
      path: "/settings/wallet",
      waitFor: 'main',
    },
    {
      name: "client-settings-invoices",
      path: "/settings/invoices",
      waitFor: 'main, table',
    },
  ],

  // ==================== AGENT ====================
  agent: [
    {
      name: "agent-dashboard",
      path: "/agent/dashboard",
      waitFor: 'main, h1',
    },
    {
      name: "agent-clients-list",
      path: "/agent/clients",
      waitFor: 'main, table',
    },
    {
      name: "agent-stats",
      path: "/agent/stats",
      waitFor: 'main',
    },
    {
      name: "agent-buy-domain-obo",
      path: (ids) => `/sites/new-with-domain?for_client=${ids.clientId}`,
      requiresClientId: true,
      waitFor: 'main, input',
    },
  ],

  // ==================== RESELLER ====================
  reseller: [
    {
      name: "reseller-dashboard",
      path: "/reseller/dashboard",
      waitFor: 'main, h1',
    },
    {
      name: "reseller-clients",
      path: "/reseller/clients",
      waitFor: 'main, table',
    },
    {
      name: "reseller-team",
      path: "/reseller/team",
      waitFor: 'main',
    },
    {
      name: "reseller-invite-agent",
      path: "/reseller/team",
      waitFor: 'main',
      action: async (page) => {
        // Try click "Undang Agent" / "Invite" button
        const btn = page.locator('button:has-text("Undang"), button:has-text("Invite"), button:has-text("Agent")').first();
        if (await btn.count() > 0) {
          await btn.click();
          await page.waitForTimeout(1000);
        }
      },
    },
    {
      name: "reseller-wallet",
      path: "/reseller/wallet",
      waitFor: 'main',
    },
    {
      name: "reseller-pricing",
      path: "/reseller/pricing",
      waitFor: 'main',
    },
    {
      name: "reseller-purchases",
      path: "/reseller/purchases",
      waitFor: 'main, table',
    },
  ],

  // ==================== ADMIN ====================
  admin: [
    {
      name: "admin-stats",
      path: "/admin",
      waitFor: 'main, h1',
    },
    {
      name: "admin-users",
      path: "/admin/users",
      waitFor: 'main, table',
    },
    {
      name: "admin-resellers-pending",
      path: "/admin/resellers?status=pending",
      waitFor: 'main',
    },
    {
      name: "admin-sites",
      path: "/admin/sites",
      waitFor: 'main, table',
    },
    {
      name: "admin-domain",
      path: "/admin/domain",
      waitFor: 'main, table',
    },
    {
      name: "admin-domain-purchases",
      path: "/admin/domain/purchases",
      waitFor: 'main, table',
    },
    {
      name: "admin-invoices",
      path: "/admin/invoices",
      waitFor: 'main, table',
    },
    {
      name: "admin-wallet-topups",
      path: "/admin/wallet/topups",
      waitFor: 'main',
    },
    {
      name: "admin-cf-configs",
      path: "/admin/cloudflare",
      waitFor: 'main',
    },
    {
      name: "admin-pricing-platform",
      path: "/admin/pricing",
      waitFor: 'main',
    },
    {
      name: "admin-promos",
      path: "/admin/promos",
      waitFor: 'main',
    },
    {
      name: "admin-zones",
      path: "/admin/zones",
      waitFor: 'main',
    },
    {
      name: "admin-payment-methods",
      path: "/admin/payment-methods",
      waitFor: 'main',
    },
    {
      name: "admin-settings",
      path: "/admin/settings",
      waitFor: 'main',
    },
    {
      name: "admin-templates",
      path: "/admin/templates",
      waitFor: 'main',
    },
    {
      name: "admin-audit-log",
      path: "/admin/audit-log",
      waitFor: 'main',
    },
    {
      name: "admin-email-log",
      path: "/admin/email-log",
      waitFor: 'main',
    },
    // Rumah Digital Guru — moderasi banner cross-site (spec §27)
    {
      name: "admin-banners",
      path: "/admin/banners",
      waitFor: 'main',
    },
  ],

  // ==================== GURU (Rumah Digital Guru) ====================
  // Semua screenshot guru pakai role `client` — di produksi setiap guru =
  // 1 user client dengan template guru-pandi-upi. Butuh sample data:
  //   - Minimal 1 site published dengan template guru
  //   - Beberapa articles/materials/banners (auto-seeded oleh template)
  guru: [
    {
      name: "guru-dashboard-ringkasan",
      path: (ids) => `/sites/${ids.siteId}`,
      requiresSiteId: true,
      waitFor: 'main, h1',
      preScreenshotDelay: 1500,
    },
    {
      name: "guru-sidebar-dropdown",
      path: (ids) => `/sites/${ids.siteId}/editor`,
      requiresSiteId: true,
      waitFor: 'main',
      action: async (page) => {
        // Klik trigger dropdown "Guru" di sidebar supaya menu terbuka
        // saat capture (menunjukkan 5 item: Tulisan/Forum/Tanggapan/
        // Pembelajaran/Ruang Promosi).
        const btn = page.getByRole("button", { name: /Guru/i }).first();
        if (await btn.count() > 0) {
          await btn.click();
          await page.waitForTimeout(600);
        }
      },
    },
    {
      name: "guru-tulisan-list",
      path: (ids) => `/sites/${ids.siteId}/tulisan`,
      requiresSiteId: true,
      waitFor: 'main, table',
    },
    {
      name: "guru-tulisan-form",
      path: (ids) => `/sites/${ids.siteId}/tulisan/new`,
      requiresSiteId: true,
      waitFor: 'main, input',
      preScreenshotDelay: 1200,
    },
    {
      name: "guru-forum-list",
      path: (ids) => `/sites/${ids.siteId}/forum`,
      requiresSiteId: true,
      waitFor: 'main, table',
    },
    {
      name: "guru-tanggapan-moderasi",
      path: (ids) => `/sites/${ids.siteId}/tanggapan`,
      requiresSiteId: true,
      waitFor: 'main',
    },
    {
      name: "guru-pembelajaran-list",
      path: (ids) => `/sites/${ids.siteId}/pembelajaran`,
      requiresSiteId: true,
      waitFor: 'main, table',
    },
    {
      name: "guru-promosi-list",
      path: (ids) => `/sites/${ids.siteId}/promosi`,
      requiresSiteId: true,
      waitFor: 'main',
    },
    {
      name: "guru-profile-settings",
      // Profil guru dipindah dari /settings/profile-guru ke /sites/[id]/profil
      // (per-site context sesuai spec §13, §25).
      path: (ids) => `/sites/${ids.siteId}/profil`,
      requiresSiteId: true,
      waitFor: 'main, h1',
    },
    {
      name: "guru-portal-directory",
      path: "/guru",
      waitFor: 'main, h1',
      // Public page — no auth required, tapi kita tetap capture via role
      // client karena browser session sudah loaded (no re-login overhead).
    },
  ],
};
