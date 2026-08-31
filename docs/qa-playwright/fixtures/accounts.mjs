// accounts.mjs — akun test per role + URL config.
// Sama pattern dengan capture-screenshots/config.mjs supaya konsisten.

export const config = {
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
  apiBase: process.env.API_BASE, // auto-derive kalau kosong (lihat auth.mjs)

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
      password: process.env.ADMIN_PASSWORD || "changeme1234",
    },
  },

  sampleIds: {
    siteId: process.env.SAMPLE_SITE_ID || "",
    domain: process.env.SAMPLE_DOMAIN || "",
    clientId: process.env.SAMPLE_CLIENT_ID || "",
    resellerId: process.env.SAMPLE_RESELLER_ID || "",
  },
};

// deriveApiBase — heuristic kalau API_BASE tidak di-set.
export function deriveApiBase() {
  if (config.apiBase) return config.apiBase;
  try {
    const url = new URL(config.baseUrl);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `${url.protocol}//${url.hostname}:8080`;
    }
    return `${url.protocol}//api.${url.hostname}`;
  } catch {
    return config.baseUrl;
  }
}
