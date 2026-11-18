import type { Metadata } from "next";
import type { Page, Site } from "./api";

// pageMetadata — SEO tags for a builder page. Shared by the home route
// (app/page.tsx) and the catch-all so the homepage, which never goes through
// [...slug], still gets its title, description and Open Graph tags.
export function pageMetadata(site: Site, page: Page): Metadata {
  const seo = page.seo ?? {};
  const title = seo.title || page.title || site.name;
  const description = seo.description || "";
  const og = seo.ogImage || undefined;
  return {
    title,
    description,
    robots: seo.noindex ? { index: false, follow: false } : undefined,
    alternates: seo.canonical ? { canonical: seo.canonical } : undefined,
    openGraph: {
      title,
      description,
      type: "website",
      images: og ? [{ url: og }] : undefined,
      siteName: site.name,
    },
    twitter: {
      card: og ? "summary_large_image" : "summary",
      title,
      description,
      images: og ? [og] : undefined,
    },
  };
}
