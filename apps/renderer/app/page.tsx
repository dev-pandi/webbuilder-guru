import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RenderBlocks } from "@/components/Blocks";
import { getPage, lookupSiteByHost, type SiteLookup } from "@/lib/api";
import { googleFontsUrl, themeToCss } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function HomeRender() {
  const host = sanitizeHost(headers().get("host") ?? "");
  const lookup = await lookupSiteByHost(host);
  if (lookup.kind !== "found") return <FallbackLanding host={host} lookup={lookup} />;
  const site = lookup.site;
  const page = await getPage(site.id, "_home");
  if (!page) notFound();
  const blocks = page.tree?.blocks ?? [];
  const fontHref = googleFontsUrl(site.theme);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeToCss(site.theme) }} />
      {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
      <RenderBlocks blocks={blocks} siteId={site.id} />
    </>
  );
}

function sanitizeHost(h: string) {
  return h.toLowerCase().split(":")[0];
}

function FallbackLanding({ host, lookup }: { host: string; lookup: SiteLookup }) {
  const reason = lookup.kind === "not_found" ? lookup.reason : "unknown";

  const config =
    reason === "site_not_published"
      ? {
          title: "Situs belum diterbitkan",
          body: (
            <>
              Domain <code className="rounded bg-slate-100 px-1.5 py-0.5">{host}</code>{" "}
              sudah terhubung ke sebuah situs, tapi situsnya masih dalam status{" "}
              <strong>draft</strong>. Buka dashboard → pilih situs → klik{" "}
              <strong>Terbitkan</strong> supaya bisa diakses publik.
            </>
          ),
          hint: "Perubahan biasanya aktif dalam beberapa detik setelah publish.",
        }
      : {
          title: "Domain belum terhubung",
          body: (
            <>
              Host <code className="rounded bg-slate-100 px-1.5 py-0.5">{host || "(kosong)"}</code>{" "}
              belum terhubung ke situs mana pun. Kalau kamu baru beli domain, tunggu
              beberapa menit setelah pembelian selesai + situs dibuat + diterbitkan.
            </>
          ),
          hint: "Cek /settings/domains di dashboard untuk status domain kamu.",
        };

  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-center">
      <div className="max-w-md">
        <h1 className="text-3xl font-bold">{config.title}</h1>
        <p className="mt-3 opacity-70">{config.body}</p>
        <p className="mt-3 text-sm opacity-60">{config.hint}</p>
      </div>
    </main>
  );
}
