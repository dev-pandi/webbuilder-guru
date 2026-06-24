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

    case "HeroSpotlight":
      return (
        <section className="relative isolate overflow-hidden">
          {/* animated gradient spotlight */}
          <div className="absolute inset-0 -z-10">
            <div
              className="absolute left-1/2 top-0 -z-10 h-[600px] w-[1000px] -translate-x-1/2 opacity-40 blur-3xl wb-spotlight-anim"
              style={{
                background:
                  "radial-gradient(closest-side, var(--color-primary), transparent 70%)",
              }}
            />
            <div className="absolute inset-0 wb-grid-pattern opacity-20" />
          </div>
          <div className="mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
            {p.eyebrow ? (
              <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wider opacity-80">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {String(p.eyebrow)}
              </div>
            ) : null}
            <h1 className="text-balance text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
              {String(p.title ?? "")}
            </h1>
            {p.subtitle ? (
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg opacity-80 sm:text-xl">
                {String(p.subtitle)}
              </p>
            ) : null}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {p.ctaLabel ? (
                <a
                  href={String(p.ctaHref ?? "#")}
                  className="btn-primary inline-flex items-center gap-2 px-6 py-3 font-medium shadow-lg shadow-primary/20 transition-all hover:scale-105"
                >
                  {String(p.ctaLabel)} →
                </a>
              ) : null}
              {p.ctaSecondaryLabel ? (
                <a
                  href={String(p.ctaSecondaryHref ?? "#")}
                  className="inline-flex items-center gap-2 rounded-[var(--radius)] border px-6 py-3 font-medium transition-colors hover:bg-foreground/5"
                >
                  {String(p.ctaSecondaryLabel)}
                </a>
              ) : null}
            </div>
          </div>
        </section>
      );

    case "BentoGrid": {
      const items =
        (p.items as Array<{ title: string; desc: string; size?: string }> | undefined) ?? [];
      return (
        <section className="mx-auto max-w-5xl px-6 py-16">
          {p.title ? (
            <h3 className="mb-10 text-center text-3xl font-bold tracking-tight">
              {String(p.title)}
            </h3>
          ) : null}
          <div className="grid auto-rows-[10rem] grid-cols-1 gap-4 sm:grid-cols-3">
            {items.map((it, i) => {
              const span =
                it.size === "large"
                  ? "sm:col-span-2 sm:row-span-2"
                  : it.size === "wide"
                    ? "sm:col-span-2"
                    : it.size === "tall"
                      ? "sm:row-span-2"
                      : "";
              return (
                <div
                  key={i}
                  className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br from-foreground/[0.02] to-foreground/[0.06] p-6 transition-all hover:border-primary/40 hover:shadow-lg ${span}`}
                >
                  <div
                    className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-30"
                    style={{ background: "var(--color-primary)" }}
                  />
                  <h4 className="text-lg font-semibold">{it.title}</h4>
                  <p className="mt-2 text-sm opacity-80">{it.desc}</p>
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    case "StatsBar": {
      const items =
        (p.items as Array<{ value: string; label: string }> | undefined) ?? [];
      return (
        <section className="mx-auto max-w-5xl px-6 py-12">
          <div className="grid grid-cols-2 gap-y-8 rounded-2xl border bg-gradient-to-br from-foreground/[0.02] to-transparent p-8 sm:grid-cols-4">
            {items.map((it, i) => (
              <div key={i} className="text-center">
                <div
                  className="text-4xl font-bold tracking-tight sm:text-5xl"
                  style={{ color: "var(--color-primary)" }}
                >
                  {it.value}
                </div>
                <div className="mt-1 text-sm uppercase tracking-wider opacity-70">
                  {it.label}
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "LogoCloud": {
      const items =
        (p.items as Array<{ name: string; image?: string }> | undefined) ?? [];
      return (
        <section className="mx-auto max-w-5xl px-6 py-12">
          {p.title ? (
            <p className="mb-8 text-center text-sm font-medium uppercase tracking-widest opacity-70">
              {String(p.title)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {items.map((it, i) =>
              it.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={it.image}
                  alt={it.name}
                  className="h-8 opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0"
                />
              ) : (
                <span
                  key={i}
                  className="text-lg font-semibold tracking-tight opacity-50 transition-opacity hover:opacity-100"
                >
                  {it.name}
                </span>
              ),
            )}
          </div>
        </section>
      );
    }

    case "CTABanner":
      return (
        <section className="px-6 py-12">
          <div
            className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl px-8 py-16 text-center text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-primary), var(--color-secondary))",
            }}
          >
            <div className="pointer-events-none absolute inset-0 wb-grid-pattern opacity-10" />
            <h2 className="relative text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              {String(p.title ?? "")}
            </h2>
            {p.subtitle ? (
              <p className="relative mx-auto mt-3 max-w-2xl text-balance opacity-90">
                {String(p.subtitle)}
              </p>
            ) : null}
            {p.ctaLabel ? (
              <a
                href={String(p.ctaHref ?? "#")}
                className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3 font-medium text-foreground shadow-xl transition-all hover:scale-105"
              >
                {String(p.ctaLabel)} →
              </a>
            ) : null}
          </div>
        </section>
      );

    case "PricingTable": {
      const items =
        (p.items as Array<{
          title: string;
          price: string;
          period?: string;
          desc?: string;
          features?: string;
          ctaLabel?: string;
          ctaHref?: string;
          featured?: string;
        }> | undefined) ?? [];
      return (
        <section className="mx-auto max-w-5xl px-6 py-16">
          {p.title ? (
            <h3 className="text-center text-3xl font-bold tracking-tight">
              {String(p.title)}
            </h3>
          ) : null}
          {p.subtitle ? (
            <p className="mx-auto mt-3 max-w-2xl text-center opacity-70">
              {String(p.subtitle)}
            </p>
          ) : null}
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {items.map((it, i) => {
              const featured = it.featured === "yes" || it.featured === "true";
              const features = (it.features ?? "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
              return (
                <div
                  key={i}
                  className={`relative flex flex-col rounded-2xl border p-7 transition-all hover:shadow-xl ${
                    featured
                      ? "scale-[1.02] border-2 shadow-lg"
                      : "border-foreground/10"
                  }`}
                  style={featured ? { borderColor: "var(--color-primary)" } : undefined}
                >
                  {featured && (
                    <div
                      className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-white shadow-md"
                      style={{ background: "var(--color-primary)" }}
                    >
                      Populer
                    </div>
                  )}
                  <h4 className="text-lg font-semibold">{it.title}</h4>
                  {it.desc && (
                    <p className="mt-1 text-sm opacity-70">{it.desc}</p>
                  )}
                  <div className="mt-5 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{it.price}</span>
                    {it.period && (
                      <span className="text-sm opacity-60">{it.period}</span>
                    )}
                  </div>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span
                          className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                          style={{
                            background: "var(--color-primary)",
                            color: "white",
                          }}
                        >
                          ✓
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {it.ctaLabel && (
                    <a
                      href={it.ctaHref ?? "#"}
                      className={`mt-7 inline-flex items-center justify-center rounded-[var(--radius)] px-5 py-2.5 font-medium transition-all ${
                        featured
                          ? "btn-primary shadow-md hover:scale-[1.02]"
                          : "border hover:bg-foreground/5"
                      }`}
                    >
                      {it.ctaLabel}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    case "FAQ": {
      const items =
        (p.items as Array<{ question: string; answer: string }> | undefined) ?? [];
      return (
        <section className="mx-auto max-w-3xl px-6 py-16">
          {p.title ? (
            <h3 className="text-center text-3xl font-bold tracking-tight">
              {String(p.title)}
            </h3>
          ) : null}
          <div className="mt-10 divide-y rounded-2xl border bg-foreground/[0.01]">
            {items.map((it, i) => (
              <details
                key={i}
                className="group [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-base font-medium transition-colors hover:bg-foreground/[0.02]">
                  <span>{it.question}</span>
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground/5 transition-transform group-open:rotate-180">
                    <svg
                      className="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </summary>
                <div className="px-6 pb-5 text-sm opacity-80">{it.answer}</div>
              </details>
            ))}
          </div>
        </section>
      );
    }

    case "TestimonialMarquee": {
      const items =
        (p.items as Array<{ name: string; text: string }> | undefined) ?? [];
      // Duplicate for seamless loop
      const loop = [...items, ...items];
      return (
        <section className="mx-auto max-w-6xl py-16">
          {p.title ? (
            <h3 className="px-6 text-center text-3xl font-bold tracking-tight">
              {String(p.title)}
            </h3>
          ) : null}
          <div className="wb-marquee-mask mt-10 overflow-hidden">
            <div className="wb-marquee flex w-max gap-4">
              {loop.map((t, i) => (
                <div
                  key={i}
                  className="w-[320px] shrink-0 rounded-2xl border bg-foreground/[0.02] p-6"
                >
                  <p className="text-sm leading-relaxed opacity-90">
                    &ldquo;{t.text}&rdquo;
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <div
                      className="grid size-9 place-items-center rounded-full text-sm font-bold text-white"
                      style={{ background: "var(--color-primary)" }}
                    >
                      {t.name.charAt(0)}
                    </div>
                    <div className="text-sm font-semibold">{t.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    }

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
