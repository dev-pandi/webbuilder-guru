// SiteLayout — shared header/footer render helper. Dipakai detail pages
// (article/pembelajaran/blog) yang tidak render via RenderBlocks langsung.
// Layout kosong `{}` → tidak render apa-apa (backward compat sites lama).
//
// Catch-all page (app/[...slug]) tidak pakai helper ini — di sana header +
// page + footer sudah di-concat ke satu blocks array untuk RenderBlocks.

import { RenderBlocks } from "@/components/Blocks";
import type { Site } from "@/lib/api";

// isEnabled: default true kalau field tidak ada (backward compat site lama).
// Konsumer opt out dengan set eksplisit `false`.
function isEnabled(flag: boolean | undefined): boolean {
  return flag !== false;
}

export function SiteHeaderBlocks({ site }: { site: Site }) {
  const blocks = site.layout?.header ?? [];
  if (blocks.length === 0 || !isEnabled(site.layout?.header_enabled)) return null;
  return <RenderBlocks blocks={blocks} siteId={site.id} />;
}

export function SiteFooterBlocks({ site }: { site: Site }) {
  const blocks = site.layout?.footer ?? [];
  if (blocks.length === 0 || !isEnabled(site.layout?.footer_enabled)) return null;
  return <RenderBlocks blocks={blocks} siteId={site.id} />;
}
