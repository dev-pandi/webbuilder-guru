"use client";

// PageViewBeacon — client component yang POST 1 hit ke API tiap page mount.
// Fire-and-forget: fail silent supaya render tidak block.
//
// Session dedup 30-menit: sessionStorage key `pv:<siteId>:<slug>` mencegah
// counter over-inflate saat user refresh page berkali-kali dalam short session.
// Data loss saat close tab OK — analytics MVP, bukan billing counter.

import { useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_BASE ?? "";
const DEDUP_TTL_MS = 30 * 60 * 1000; // 30 menit

export function PageViewBeacon({ siteId, pageSlug }: { siteId: string; pageSlug: string }) {
  useEffect(() => {
    if (!siteId) return;
    if (!API) return; // no public API endpoint configured — skip diam-diam

    // Dedup per session per page.
    const key = `pv:${siteId}:${pageSlug}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts < DEDUP_TTL_MS) return;
      }
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // sessionStorage unavailable (private mode, iframe sandbox) — skip dedup, tetap kirim.
    }

    const body = JSON.stringify({ site_id: siteId, page_slug: pageSlug });
    const url = `${API}/public/analytics/pageview`;

    try {
      // Bukan sendBeacon: spec-nya memaksa credentials mode "include", dan
      // publicCORS tidak pernah balas `Access-Control-Allow-Credentials: true`
      // (endpoint publik, tidak butuh session). Akibatnya preflight ditolak,
      // POST tidak pernah terkirim, dan sendBeacon tetap balas true sehingga
      // gagalnya tidak terdeteksi — seluruh page view hilang diam-diam.
      //
      // no-cors + text/plain = simple request: tanpa preflight dan tanpa
      // pengecekan CORS pada respons, jadi konsol pengunjung bersih. Respons
      // jadi opaque, tapi ini fire-and-forget. keepalive bikin request tetap
      // jalan kalau user langsung pindah halaman.
      void fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        mode: "no-cors",
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Total fail — silent.
    }
  }, [siteId, pageSlug]);

  return null;
}
