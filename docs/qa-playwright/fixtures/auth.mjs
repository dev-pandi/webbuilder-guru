// auth.mjs — login helper per role. Pakai API token approach untuk speed.
// Token disimpan ke localStorage `wb_access_token` + `wb_refresh_token`
// (sesuai apps/web/lib/api.ts).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { config, deriveApiBase } from "./accounts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache token per role — cegah hit rate limit `/auth/login` (5 req/menit
// per IP di Fiber limiter). QA suite bikin 4 role × banyak spec — tanpa
// cache, run kedua langsung 429 karena process baru = memory kosong.
//
// Persist ke file supaya cache survive antar process (run beruntun aman).
// TTL 10 menit — di bawah JWT expiry 15m, tapi cukup untuk re-run cepat.
const CACHE_FILE = resolve(__dirname, "..", ".token-cache.json");
const CACHE_TTL_MS = 10 * 60 * 1000;

function loadCache() {
  try {
    if (!existsSync(CACHE_FILE)) return new Map();
    const raw = readFileSync(CACHE_FILE, "utf8");
    const entries = JSON.parse(raw);
    return new Map(Object.entries(entries));
  } catch {
    return new Map();
  }
}

function saveCache(cache) {
  try {
    const dir = dirname(CACHE_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(cache);
    writeFileSync(CACHE_FILE, JSON.stringify(obj), "utf8");
  } catch {
    // File cache gagal — fall back ke in-memory only. Test tetap jalan
    // tapi run beruntun bisa kena rate limit lebih cepat.
  }
}

const tokenCache = loadCache();

/**
 * Login via POST /api/v1/auth/login → inject token ke localStorage via
 * addInitScript. Wajib dipanggil SEBELUM page.goto() supaya request pertama
 * sudah terauth. Token di-cache module-level supaya login endpoint tidak
 * di-hit berulang.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {'client'|'agent'|'reseller'|'admin'} role
 * @returns {Promise<{accessToken: string, refreshToken?: string}>}
 */
export async function loginAs(context, role) {
  const account = config.accounts[role];
  if (!account) throw new Error(`Unknown role: ${role}`);

  let tokens = tokenCache.get(role);
  const stale = tokens && Date.now() - tokens.cachedAt > CACHE_TTL_MS;

  if (!tokens || stale) {
    const apiBase = deriveApiBase();

    // Retry-on-429: Fiber login limiter 5 req/menit per IP; kalau QA suite
    // freshly-started dan token cache miss untuk multiple role, first 4-5
    // login sukses, sisanya 429. Retry sampai clear supaya spec tidak fail
    // karena infrastructure limit, bukan bug real.
    let res;
    const start = Date.now();
    while (Date.now() - start < 90_000) {
      res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
        }),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Login ${role} failed (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = await res.json();
    const data = json.data || json;
    if (!data.access_token) {
      throw new Error(`Login ${role} response tanpa access_token`);
    }
    tokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      cachedAt: Date.now(),
    };
    tokenCache.set(role, tokens);
    saveCache(tokenCache);
  }

  await context.addInitScript(
    ({ access, refresh }) => {
      try {
        localStorage.setItem("wb_access_token", access);
        if (refresh) localStorage.setItem("wb_refresh_token", refresh);
      } catch {
        /* localStorage tidak accessible di file:// */
      }
    },
    { access: tokens.accessToken, refresh: tokens.refreshToken },
  );

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

// clearTokenCache — force fresh login (test logout scenarios).
export function clearTokenCache(role) {
  if (role) tokenCache.delete(role);
  else tokenCache.clear();
  saveCache(tokenCache);
}

/**
 * Waitroute — helper untuk wait sampai URL match pattern setelah login redirect.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'client'|'agent'|'reseller'|'admin'} role
 */
export async function expectRoleDashboard(page, role) {
  const patterns = {
    admin: /\/admin/,
    reseller: /\/reseller/,
    agent: /\/agent/,
    client: /\/dashboard/,
  };
  await page.waitForURL(patterns[role], { timeout: 10_000 });
}
