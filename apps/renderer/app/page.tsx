import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { getPage, getSiteByHost } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function HomeRender() {
  const host = sanitizeHost(headers().get("host") ?? "");
  const site = await getSiteByHost(host);
  if (!site) return <FallbackLanding host={host} />;
  const page = await getPage(site.id, "_home");
  if (!page) notFound();
  const blocks = page.tree?.blocks ?? [];
  const fontHref = googleFontsUrl(site.theme);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <RenderBlocks blocks={blocks} />
    </>
  );
}

function sanitizeHost(h: string) {
  return h.toLowerCase().split(":")[0];
}

function FallbackLanding({ host }: { host: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl font-bold">Web Builder Renderer</h1>
        <p className="mt-3 opacity-70">
          Host <code className="rounded bg-slate-100 px-1.5 py-0.5">{host || "(none)"}</code> belum
          terhubung ke situs publikasi mana pun.
        </p>
        <p className="mt-3 text-sm opacity-60">
          Daftar dan publikasikan situs di dashboard untuk melihat halaman di sini.
        </p>
      </div>
    </main>
  );
}
