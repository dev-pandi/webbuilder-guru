import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getBlogPost, getSiteByHost } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";
import { buildArticle, wrap } from "@/lib/schema";
import { PageViewBeacon } from "@/components/PageViewBeacon";

export const dynamic = "force-dynamic";

function host() {
  return (headers().get("host") ?? "").toLowerCase().split(":")[0];
}

// XSS hardening:
// - GFM enabled for markdown features (tables, strikethrough, autolinks).
// - Raw HTML in source is DROPPED via renderer override (return ""). This is
//   the cheapest sanitisation that works for our threat model — user markdown
//   never gets to inject <script>, <iframe>, or event handlers. If we later
//   want to allow a safe subset (e.g. <img> with width/height), pipe through
//   sanitize-html or DOMPurify instead.
marked.setOptions({ gfm: true, breaks: false });
marked.use({
  renderer: {
    html: () => "",
  },
});

export default async function BlogPostDetail({ params }: { params: { slug: string } }) {
  const site = await getSiteByHost(host());
  if (!site) notFound();
  const post = await getBlogPost(site.id, params.slug);
  if (!post) notFound();

  const fontHref = googleFontsUrl(site.theme);
  const html = await marked.parse(post.content_md ?? "");
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const baseURL = `https://${host()}`;
  const articleLD = wrap([buildArticle(post, site, baseURL)]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleLD }} />
      <PageViewBeacon siteId={site.id} pageSlug={`/blog/${params.slug}`} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <nav className="mb-6 text-sm opacity-70">
          <a href="/" className="hover:underline">
            ← Beranda
          </a>
        </nav>

        {post.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image_url}
            alt={post.title}
            className="mb-6 aspect-[2/1] w-full rounded-xl object-cover"
          />
        )}

        <h1 className="text-4xl font-bold leading-tight">{post.title}</h1>

        <div className="mt-3 flex items-center gap-3 text-sm opacity-70">
          {post.author_name && <span>{post.author_name}</span>}
          {post.author_name && post.published_at && <span>·</span>}
          {post.published_at && (
            <time dateTime={post.published_at}>
              {new Date(post.published_at).toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          )}
        </div>

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((t, i) => (
              <span key={i} className="rounded-full border px-2.5 py-0.5 text-xs opacity-80">
                {t}
              </span>
            ))}
          </div>
        )}

        <article
          className="wb-prose mt-8"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </>
  );
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const site = await getSiteByHost(host());
  if (!site) return {};
  const post = await getBlogPost(site.id, params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — ${site.name}`,
    description: post.excerpt.slice(0, 160),
  };
}
