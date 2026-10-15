// pembelajaran-toc — server-side helper untuk extract H2/H3 dari HTML output
// marked.parse + inject anchor IDs. Dipakai PembelajaranLayout untuk render
// TOC + scroll-spy (highlight current section).

export type TocHeading = {
  id: string;
  title: string;
  level: 2 | 3;
};

// slugifyHeading — convert judul heading jadi anchor ID stable.
// Lowercase, strip non-alfanumeric, max 60 char. Dedup via counter kalau
// bentrok (rare, tapi mungkin kalau ada 2 H2 "Pendahuluan").
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/<[^>]+>/g, "") // strip inline HTML (bold/em dari markdown)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// extractAndAnnotateTOC — regex pass di HTML output (dari marked.parse) untuk:
//   1. Extract list H2/H3 + judul.
//   2. Inject `id` attribute ke tag H2/H3 (biar anchor-link jalan).
//   3. Append tombol `#` link di belakang (biar user bisa copy-link ke section).
//
// Return: { html: HTML dengan id injected, items: list heading untuk TOC }.
export function extractAndAnnotateTOC(html: string): {
  html: string;
  items: TocHeading[];
} {
  const items: TocHeading[] = [];
  const used = new Set<string>();

  const annotated = html.replace(
    /<h([23])(?:\s[^>]*)?>([\s\S]*?)<\/h\1>/gi,
    (_match, levelStr, inner) => {
      const level = levelStr === "2" ? 2 : 3;
      const text = String(inner).replace(/<[^>]+>/g, "").trim();
      if (!text) return _match;
      let id = slugifyHeading(text);
      if (!id) id = `heading-${items.length + 1}`;
      // Dedup
      let candidate = id;
      let n = 2;
      while (used.has(candidate)) {
        candidate = `${id}-${n++}`;
      }
      used.add(candidate);
      items.push({ id: candidate, title: text, level: level as 2 | 3 });
      return `<h${level} id="${candidate}">${inner}<a href="#${candidate}" class="pembelajaran-anchor" aria-label="Tautan ke bagian ini">#</a></h${level}>`;
    },
  );

  return { html: annotated, items };
}
