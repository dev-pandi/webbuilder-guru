import { formatPrice, listBlogPosts, listProducts, type Block } from "@/lib/api";

export async function RenderBlocks({
  blocks,
  siteId,
}: {
  blocks: Block[];
  siteId: string;
}) {
  // Render each block; dynamic blocks resolve async server components.
  return (
    <>
      {await Promise.all(
        blocks.map(async (b, i) => {
          if (b.type === "ProductGridDynamic") {
            return <ProductGridDynamic key={i} block={b} siteId={siteId} />;
          }
          if (b.type === "BlogListDynamic") {
            return <BlogListDynamicAsync key={i} block={b} siteId={siteId} />;
          }
          return <BlockView key={i} block={b} />;
        }),
      )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  const p = block.props ?? {};
  switch (block.type) {
    case "Navbar":
      return (
        <header className="border-b">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <strong className="text-lg">{String(p.brand ?? "")}</strong>
            <nav className="flex gap-6 text-sm">
              {(p.links as Array<{ label: string; href: string }> | undefined)?.map((l, i) => (
                <a key={i} href={l.href} className="hover:underline">
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
        </header>
      );
    case "Hero":
      return (
        <section className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-5xl font-bold tracking-tight">{String(p.title ?? "")}</h1>
          {p.subtitle ? <p className="mx-auto mt-4 max-w-2xl text-lg opacity-80">{String(p.subtitle)}</p> : null}
          {p.ctaLabel ? (
            <a
              href={String(p.ctaHref ?? "#")}
              className="btn-primary mt-8 inline-block px-6 py-3 font-medium"
            >
              {String(p.ctaLabel)}
            </a>
          ) : null}
        </section>
      );
    case "Heading":
      return (
        <h2 className="mx-auto max-w-5xl px-6 py-6 text-3xl font-bold">
          {String(p.text ?? "")}
        </h2>
      );
    case "Text":
      return (
        <p className="mx-auto max-w-3xl whitespace-pre-line px-6 py-2">
          {String(p.body ?? "")}
        </p>
      );
    case "Section":
      return (
        <section className="mx-auto max-w-5xl px-6 py-10">
          {p.title ? <h3 className="text-2xl font-semibold">{String(p.title)}</h3> : null}
          <p className="mt-3 whitespace-pre-line opacity-80">{String(p.body ?? "")}</p>
        </section>
      );
    case "FeatureList":
      return (
        <section className="mx-auto max-w-5xl px-6 py-10">
          {p.title ? <h3 className="mb-6 text-2xl font-semibold">{String(p.title)}</h3> : null}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(p.items as Array<{ title: string; desc: string }> | undefined)?.map((it, i) => (
              <div key={i} className="rounded-xl border p-5">
                <div className="font-semibold">{it.title}</div>
                <div className="mt-1 text-sm opacity-80">{it.desc}</div>
              </div>
            ))}
          </div>
        </section>
      );
    case "ProductGrid":
      return (
        <section className="mx-auto max-w-5xl px-6 py-10">
          {p.title ? <h3 className="mb-6 text-2xl font-semibold">{String(p.title)}</h3> : null}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(p.items as Array<{ name: string; price: string; image?: string }> | undefined)?.map((it, i) => (
              <div key={i} className="overflow-hidden rounded-xl border">
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt={it.name} className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square bg-slate-100" />
                )}
                <div className="p-4">
                  <div className="font-medium">{it.name}</div>
                  <div className="mt-1 text-sm opacity-80">{it.price}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    case "ProjectGrid":
      return (
        <section className="mx-auto max-w-5xl px-6 py-10">
          {p.title ? <h3 className="mb-6 text-2xl font-semibold">{String(p.title)}</h3> : null}
          <div className="grid gap-6 sm:grid-cols-2">
            {(p.items as Array<{ name: string; desc: string; href: string }> | undefined)?.map((it, i) => (
              <a key={i} href={it.href} className="rounded-xl border p-5 transition hover:shadow-md">
                <div className="font-semibold">{it.name}</div>
                <div className="mt-1 text-sm opacity-80">{it.desc}</div>
              </a>
            ))}
          </div>
        </section>
      );
    case "BlogList":
      return (
        <section className="mx-auto max-w-3xl px-6 py-10">
          {(p.items as Array<{ title: string; excerpt: string; href: string }> | undefined)?.map((it, i) => (
            <a key={i} href={it.href} className="mb-6 block border-b pb-6 last:border-0">
              <h3 className="text-xl font-semibold">{it.title}</h3>
              <p className="mt-1 opacity-80">{it.excerpt}</p>
            </a>
          ))}
        </section>
      );
    case "Testimonial":
      return (
        <section className="mx-auto max-w-3xl px-6 py-10">
          {(p.items as Array<{ name: string; text: string }> | undefined)?.map((t, i) => (
            <blockquote key={i} className="my-4 border-l-4 pl-5 italic" style={{ borderColor: "var(--color-primary)" }}>
              “{t.text}” — <span className="not-italic font-medium">{t.name}</span>
            </blockquote>
          ))}
        </section>
      );
    case "Footer":
      return (
        <footer className="mt-16 border-t">
          <div className="mx-auto max-w-5xl px-6 py-6 text-center text-sm opacity-70">
            {String(p.copyright ?? "")}
          </div>
        </footer>
      );
    default:
      return null;
  }
}

// --- Dynamic blocks: fetch live data from API ---

async function ProductGridDynamic({ block, siteId }: { block: Block; siteId: string }) {
  const p = block.props ?? {};
  const limit = Number(p.limit ?? 12);
  const products = await listProducts(siteId, limit);
  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      {p.title ? <h3 className="mb-6 text-2xl font-semibold">{String(p.title)}</h3> : null}
      {products.length === 0 ? (
        <p className="opacity-70">Belum ada produk.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((pr) => (
            <a
              key={pr.id}
              href={`/produk/${pr.slug}`}
              className="overflow-hidden rounded-xl border transition hover:shadow-md"
            >
              {pr.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pr.image_url}
                  alt={pr.name}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="aspect-square bg-slate-100" />
              )}
              <div className="p-4">
                <div className="font-medium">{pr.name}</div>
                <div className="mt-1 text-sm opacity-80">{formatPrice(pr.price, pr.currency)}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

async function BlogListDynamicAsync({ block, siteId }: { block: Block; siteId: string }) {
  const p = block.props ?? {};
  const limit = Number(p.limit ?? 10);
  const posts = await listBlogPosts(siteId, limit);
  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      {p.title ? <h3 className="mb-6 text-2xl font-semibold">{String(p.title)}</h3> : null}
      {posts.length === 0 ? (
        <p className="opacity-70">Belum ada artikel.</p>
      ) : (
        posts.map((post) => (
          <a
            key={post.id}
            href={`/blog/${post.slug}`}
            className="mb-6 block border-b pb-6 last:border-0"
          >
            {post.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="mb-3 aspect-[3/1] w-full rounded-lg object-cover"
                loading="lazy"
              />
            ) : null}
            <h3 className="text-xl font-semibold">{post.title}</h3>
            <p className="mt-1 opacity-80">{post.excerpt}</p>
            {post.published_at && (
              <p className="mt-1 text-xs opacity-60">
                {new Date(post.published_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
          </a>
        ))
      )}
    </section>
  );
}
