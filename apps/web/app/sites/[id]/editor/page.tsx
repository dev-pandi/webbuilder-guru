"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Page = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  tree: unknown;
  is_home: boolean;
};

// Phase 1 editor: structured JSON tree editor with live preview (iframe to renderer).
// Phase 2 will replace this with Craft.js drag-and-drop using the same `tree` schema.
export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const [pages, setPages] = useState<Page[]>([]);
  const [current, setCurrent] = useState<Page | null>(null);
  const [draft, setDraft] = useState("");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api<Page[]>(`/api/v1/sites/${params.id}/pages`)
      .then((list) => {
        setPages(list);
        const home = list.find((p) => p.is_home) ?? list[0] ?? null;
        if (home) {
          setCurrent(home);
          setDraft(JSON.stringify(home.tree, null, 2));
        }
      })
      .catch((e) => setStatus((e as Error).message));
  }, [params.id]);

  function selectPage(p: Page) {
    setCurrent(p);
    setDraft(JSON.stringify(p.tree, null, 2));
    setParseErr(null);
  }

  async function save() {
    if (!current) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch (e) {
      setParseErr("JSON tidak valid: " + (e as Error).message);
      return;
    }
    setParseErr(null);
    setSaving(true);
    try {
      const updated = await api<Page>(`/api/v1/pages/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tree: parsed }),
      });
      setCurrent(updated);
      setStatus("Tersimpan ✓");
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_1fr]">
      <aside className="rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">Halaman</h3>
        <ul className="mt-1 space-y-0.5">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => selectPage(p)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                  current?.id === p.id ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{p.title || p.slug}</span>
                {p.is_home && <span className="ml-2 text-xs text-slate-400">home</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex flex-col rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <div className="text-sm">
            <span className="text-slate-500">Tree JSON:</span>{" "}
            <span className="font-mono text-slate-900">/{current?.slug ?? "-"}</span>
          </div>
          <div className="flex items-center gap-3">
            {status && <span className="text-xs text-slate-500">{status}</span>}
            <button
              onClick={save}
              disabled={saving || !current}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="h-[70vh] w-full resize-none rounded-b-xl p-3 font-mono text-xs outline-none"
          placeholder="{ }"
        />
        {parseErr && (
          <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{parseErr}</div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <span className="text-sm font-medium">Preview</span>
        </div>
        <Preview tree={safeParse(draft)} />
      </section>
    </div>
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Minimal in-app preview that renders the same block shapes as the renderer.
function Preview({ tree }: { tree: unknown }) {
  if (!tree || typeof tree !== "object") {
    return <div className="p-6 text-sm text-slate-500">JSON tidak valid — tidak bisa preview.</div>;
  }
  const blocks = ((tree as { blocks?: Block[] }).blocks) ?? [];
  return (
    <div className="h-[70vh] overflow-auto">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

type Block = { type: string; props?: Record<string, unknown> };

function BlockView({ block }: { block: Block }) {
  const p = block.props ?? {};
  switch (block.type) {
    case "Navbar":
      return (
        <div className="flex items-center justify-between border-b px-6 py-4">
          <strong>{String(p.brand ?? "")}</strong>
          <div className="flex gap-4 text-sm">
            {(p.links as Array<{ label: string; href: string }> | undefined)?.map((l, i) => (
              <span key={i} className="text-slate-600">{l.label}</span>
            ))}
          </div>
        </div>
      );
    case "Hero":
      return (
        <div className="px-6 py-16 text-center">
          <h1 className="text-3xl font-bold">{String(p.title ?? "")}</h1>
          <p className="mt-2 text-slate-600">{String(p.subtitle ?? "")}</p>
          {p.ctaLabel ? (
            <button className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-white">
              {String(p.ctaLabel)}
            </button>
          ) : null}
        </div>
      );
    case "Heading":
      return <h2 className="px-6 py-4 text-2xl font-bold">{String(p.text ?? "")}</h2>;
    case "Text":
      return <p className="whitespace-pre-line px-6 py-2 text-slate-700">{String(p.body ?? "")}</p>;
    case "FeatureList":
    case "ProductGrid":
    case "ProjectGrid":
    case "BlogList":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="mb-3 text-lg font-semibold">{String(p.title)}</h3> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {(p.items as Array<Record<string, unknown>> | undefined)?.map((it, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium">{String(it.title ?? it.name ?? "")}</div>
                <div className="text-sm text-slate-600">
                  {String(it.desc ?? it.excerpt ?? it.price ?? "")}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "Footer":
      return <div className="border-t px-6 py-4 text-center text-sm text-slate-500">{String(p.copyright ?? "")}</div>;
    case "Section":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="text-lg font-semibold">{String(p.title)}</h3> : null}
          <p className="mt-1 text-slate-700">{String(p.body ?? "")}</p>
        </div>
      );
    case "Testimonial":
      return (
        <div className="bg-slate-50 px-6 py-6">
          {(p.items as Array<{ name: string; text: string }> | undefined)?.map((t, i) => (
            <blockquote key={i} className="border-l-4 border-brand-500 pl-4 italic text-slate-700">
              “{t.text}” — <span className="not-italic font-medium">{t.name}</span>
            </blockquote>
          ))}
        </div>
      );
    default:
      return <div className="px-6 py-2 text-xs text-slate-400">[block: {block.type}]</div>;
  }
}
