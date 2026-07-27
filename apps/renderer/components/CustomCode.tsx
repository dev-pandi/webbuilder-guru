// SiteHeadCode + SiteBodyEndCode — inject raw HTML/JS yang user set di
// dashboard Custom Code page. Sengaja pakai dangerouslySetInnerHTML tanpa
// sanitize: use case (GTM, Meta Pixel, chat widget, verifikasi search
// console) butuh raw script tags. Risk XSS ditanggung pemilik situs, bukan
// visitor lain (single-tenant per site — hanya owner yang bisa isi).
//
// Kalau kosong (undefined atau ""), return null → tidak render markup apa
// pun (no noise di HTML output).

import type { Site } from "@/lib/api";

// Inject dekat top of page — Next.js RSC otomatis hoist <link>/<meta> ke
// head. <script> stays in place tapi tetap execute normal.
export function SiteHeadCode({ site }: { site: Site }) {
  const code = site.custom_head_code?.trim();
  if (!code) return null;
  return (
    <div
      data-wb-slot="head-code"
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}

// Inject di paling bawah page — cocok untuk deferred scripts (chat widget,
// heatmap) yang tidak boleh block first paint.
export function SiteBodyEndCode({ site }: { site: Site }) {
  const code = site.custom_body_end_code?.trim();
  if (!code) return null;
  return (
    <div
      data-wb-slot="body-end-code"
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
