// SiteLayout — shared header/footer render helper. Dipakai detail pages
// (article/pembelajaran/blog) yang tidak render via RenderBlocks langsung.
// Layout kosong `{}` → tidak render apa-apa (backward compat sites lama).
//
// Catch-all page (app/[...slug]) tidak pakai helper ini — di sana header +
// page + footer sudah di-concat ke satu blocks array untuk RenderBlocks.

import { RenderBlocks } from "@/components/Blocks";
import type { Site } from "@/lib/api";

export function SiteHeaderBlocks({ site }: { site: Site }) {
  const blocks = site.layout?.header ?? [];
  if (blocks.length === 0) return null;
  return <RenderBlocks blocks={blocks} siteId={site.id} />;
}

export function SiteFooterBlocks({ site }: { site: Site }) {
  const blocks = site.layout?.footer ?? [];
  if (blocks.length === 0) return null;
  return <RenderBlocks blocks={blocks} siteId={site.id} />;
}
