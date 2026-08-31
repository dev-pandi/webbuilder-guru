// playwright.config.mjs — Playwright config untuk QA test suite.
// Custom reporter: Excel + HTML + JSON supaya bisa share hasil ke stakeholder
// non-teknis (Excel) sekaligus keep detail buat developer (HTML/JSON).

import { defineConfig, devices } from "@playwright/test";

// Multi-browser opt-in via env:
//   PLAYWRIGHT_BROWSERS=all  → chromium + firefox + webkit
//   PLAYWRIGHT_BROWSERS=firefox → chromium + firefox
//   (default)                → chromium only (fast local iteration)
const browserMode = process.env.PLAYWRIGHT_BROWSERS || "chromium";

const projects = [
  {
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1440, height: 900 },
    },
  },
];

if (browserMode === "all" || browserMode === "firefox") {
  projects.push({
    name: "firefox",
    // Grep filter: hanya UI critical + visual regression di firefox
    // supaya total runtime tidak balloon 3x.
    grep: /@cross-browser|@visual/,
    use: {
      ...devices["Desktop Firefox"],
      viewport: { width: 1440, height: 900 },
    },
  });
}
if (browserMode === "all" || browserMode === "webkit") {
  projects.push({
    name: "webkit",
    grep: /@cross-browser|@visual/,
    use: {
      ...devices["Desktop Safari"],
      viewport: { width: 1440, height: 900 },
    },
  });
}

export default defineConfig({
  testDir: "./tests",

  // Test parallel per file — role berbeda tidak share state, aman parallel.
  fullyParallel: false, // set false biar Excel output berurutan per test
  workers: 1, // single worker — cache token file-based, hindari race

  // Global timeout per test — cukup untuk network + hydration + publish cache wait.
  timeout: 60_000,

  // Retry — di local dev tidak retry supaya login endpoint tidak double-hit
  // (rate limit trigger). CI boleh retry karena network flake lebih common
  // dan biasanya IP CI beda dari local dev.
  retries: process.env.CI ? 1 : 0,

  // Reporters:
  //   - Excel custom (untuk stakeholder)
  //   - HTML (untuk debug developer)
  //   - list (untuk console output)
  reporter: [
    ["./reporters/excel-reporter.mjs"],
    ["html", { outputFolder: "results/html-report", open: "never" }],
    ["json", { outputFile: "results/report.json" }],
    ["list"],
  ],

  // Failed test screenshot + trace untuk debug.
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    ignoreHTTPSErrors: true,
    locale: "id-ID",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects,

  // Output folder untuk artifacts (screenshots + traces + video)
  outputDir: "./results/artifacts",

  // Visual regression tolerance — akomodasi anti-alias + font hinting yang beda
  // antar OS. Kalau CI Linux vs local macOS, small diff wajar.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02, // ≤ 2% pixel berbeda = pass
      threshold: 0.2, // 20% color threshold per pixel (anti-alias tolerance)
    },
  },
});
