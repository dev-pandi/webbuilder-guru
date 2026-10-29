// LiteraWidget — embed Literaa NFT widget di detail artikel yang Litera-enabled.
// Load CDN script + div placeholder yang widget akan hydrate.
//
// Spec: https://literaa.xyz/api/v1/docs section 6. Markup WAJIB persis seperti
// `embedCode` yang dikembalikan API register: id="litera" + data-article.
// Script cari container lewat #litera, jadi id/atribut lain = widget diam.
//
// Widget auto-handle: status "sedang diproses" sebelum mint, kartu NFT setelah
// mint, kuis flow, unlock content, cross-domain fallback ke literaa.xyz/collect.
//
// URL kanonis WAJIB byte-persis sama dengan payload saat register. Pakai
// canonical.ts helper untuk hitung dari site hostname + rubric + slug.

import Script from "next/script";

export function LiteraWidget({
  canonicalURL,
  title,
}: {
  canonicalURL: string;
  title?: string;
}) {
  return (
    <section className="litera-widget-wrap" aria-label="Koleksi Digital Litera">
      <div id="litera" data-article={canonicalURL} data-title={title} />
      {/* Script async — load widget JS saat idle. Widget sendiri render konten
          ke dalam div di atas. Pakai next/script dengan strategy afterInteractive
          supaya tidak block FCP tapi div sudah ada saat script jalan. */}
      <Script
        src="https://cdn.literaa.xyz/litera-embed.js"
        strategy="afterInteractive"
      />
    </section>
  );
}
