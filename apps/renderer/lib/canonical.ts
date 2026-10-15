// canonical — build URL kanonis artikel. WAJIB byte-persis sama dengan backend
// Go helper (apps/api/internal/litera/canonical.go) karena Litera API compare
// URL string exact match. Beda satu slash atau prefix "www." = tidak cocok.
//
// Format: https://{host}/{rubric}/{slug}
//   - host: lowercase, strip www., strip trailing slash
//   - rubric: trim slash + lowercase
//   - slug: trim slash

export function canonicalArticleURL(
  host: string,
  rubric: string,
  slug: string,
): string {
  let h = (host || "").trim().toLowerCase();
  if (h.startsWith("https://")) h = h.slice("https://".length);
  if (h.startsWith("http://")) h = h.slice("http://".length);
  if (h.startsWith("www.")) h = h.slice("www.".length);
  while (h.endsWith("/")) h = h.slice(0, -1);

  const r = (rubric || "").trim().replace(/^\/+|\/+$/g, "");
  const s = (slug || "").trim().replace(/^\/+|\/+$/g, "");
  return `https://${h}/${r}/${s}`;
}
