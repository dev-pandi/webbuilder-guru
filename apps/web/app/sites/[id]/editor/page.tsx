"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { blockSchemas, schemaFor } from "@/lib/blocks";
import { PropEditor, type BlockData } from "./PropEditor";

type Page = {
  id: string;
  site_id: string;
  slug: string;
  title: string;
  tree: { blocks?: BlockData[] } | null;
  is_home: boolean;
};

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const [pages, setPages] = useState<Page[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api<Page[]>(`/api/v1/sites/${params.id}/pages`)
      .then((list) => {
        setPages(list);
        const home = list.find((p) => p.is_home) ?? list[0] ?? null;
        if (home) {
          setCurrentId(home.id);
          setBlocks(home.tree?.blocks ?? []);
          setSelectedIdx(home.tree?.blocks?.length ? 0 : -1);
        }
      })
      .catch((e) => setStatus((e as Error).message));
  }, [params.id]);

  const current = useMemo(() => pages.find((p) => p.id === currentId) ?? null, [pages, currentId]);

  function selectPage(p: Page) {
    setCurrentId(p.id);
    const bs = p.tree?.blocks ?? [];
    setBlocks(bs);
    setSelectedIdx(bs.length ? 0 : -1);
  }

  function addBlock(type: string) {
    const schema = schemaFor(type);
    if (!schema) return;
    const next = [...blocks, { type, props: structuredClone(schema.defaults) }];
    setBlocks(next);
    setSelectedIdx(next.length - 1);
    setShowAdd(false);
  }

  function updateBlock(i: number, next: BlockData) {
    const arr = [...blocks];
    arr[i] = next;
    setBlocks(arr);
  }

  function removeBlock(i: number) {
    const arr = blocks.filter((_, idx) => idx !== i);
    setBlocks(arr);
    if (selectedIdx >= arr.length) setSelectedIdx(arr.length - 1);
  }

  function moveBlock(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const arr = [...blocks];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setBlocks(arr);
    if (selectedIdx === i) setSelectedIdx(j);
    else if (selectedIdx === j) setSelectedIdx(i);
  }

  async function save() {
    if (!current) return;
    setSaving(true);
    try {
      const updated = await api<Page>(`/api/v1/pages/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ tree: { blocks } }),
      });
      setPages((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
      setStatus("Tersimpan ✓");
      setTimeout(() => setStatus(null), 2000);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const previewWidth = device === "mobile" ? 375 : device === "tablet" ? 768 : "100%";

  return (
    <div className="grid h-[calc(100vh-140px)] gap-3 lg:grid-cols-[220px_1fr_320px]">
      {/* Left: pages + blocks */}
      <aside className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-2">
          <h3 className="px-2 py-1 text-xs font-semibold uppercase text-slate-500">Halaman</h3>
          <ul className="mt-1 space-y-0.5">
            {pages.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => selectPage(p)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                    currentId === p.id ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="truncate">{p.title || p.slug}</span>
                  {p.is_home && <span className="ml-2 text-xs text-slate-400">home</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Block</h3>
            <button
              onClick={() => setShowAdd((s) => !s)}
              className="rounded bg-brand-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-brand-700"
            >
              + Tambah
            </button>
          </div>
          {showAdd && (
            <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="grid grid-cols-2 gap-1">
                {blockSchemas.map((s) => (
                  <button
                    key={s.type}
                    onClick={() => addBlock(s.type)}
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-left text-xs hover:border-brand-500 hover:text-brand-600"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="space-y-0.5">
            {blocks.map((b, i) => (
              <li
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                  selectedIdx === i ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50"
                }`}
              >
                <span className="truncate">
                  <span className="text-slate-400">#{i + 1}</span> {b.type}
                </span>
                <span className="flex gap-0.5 text-xs">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlock(i, -1);
                    }}
                    className="rounded px-1 hover:bg-slate-200"
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveBlock(i, 1);
                    }}
                    className="rounded px-1 hover:bg-slate-200"
                  >
                    ↓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Hapus block?")) removeBlock(i);
                    }}
                    className="rounded px-1 text-red-600 hover:bg-red-50"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
            {blocks.length === 0 && (
              <li className="px-2 py-3 text-xs text-slate-400">Belum ada block.</li>
            )}
          </ul>
        </div>
      </aside>

      {/* Center: preview */}
      <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <div className="flex gap-1">
            {(["desktop", "tablet", "mobile"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`rounded px-2 py-1 text-xs ${
                  device === d ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {d}
              </button>
            ))}
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
        <div className="flex-1 overflow-auto bg-slate-100 p-4">
          <div
            className="mx-auto overflow-hidden rounded-lg bg-white shadow"
            style={{ width: previewWidth, maxWidth: "100%" }}
          >
            <Preview blocks={blocks} onSelect={setSelectedIdx} selectedIdx={selectedIdx} />
          </div>
        </div>
      </section>

      {/* Right: property editor */}
      <aside className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
        {selectedIdx >= 0 && blocks[selectedIdx] ? (
          <>
            <h3 className="text-sm font-semibold">Edit Block: {blocks[selectedIdx].type}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Posisi #{selectedIdx + 1}</p>
            <div className="mt-4">
              <PropEditor
                block={blocks[selectedIdx]}
                onChange={(next) => updateBlock(selectedIdx, next)}
              />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">Pilih block untuk mengedit.</p>
        )}
      </aside>
    </div>
  );
}

function Preview({
  blocks,
  onSelect,
  selectedIdx,
}: {
  blocks: BlockData[];
  onSelect: (i: number) => void;
  selectedIdx: number;
}) {
  if (blocks.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-slate-400">
        Belum ada block. Klik <span className="font-medium">+ Tambah</span> di sidebar.
      </div>
    );
  }
  return (
    <>
      {blocks.map((b, i) => (
        <div
          key={i}
          onClick={() => onSelect(i)}
          className={`cursor-pointer transition ${
            selectedIdx === i ? "outline outline-2 outline-brand-500" : "hover:outline hover:outline-1 hover:outline-slate-300"
          }`}
        >
          <BlockView block={b} />
        </div>
      ))}
    </>
  );
}

function BlockView({ block }: { block: BlockData }) {
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
    case "Section":
      return (
        <div className="px-6 py-6">
          {p.title ? <h3 className="text-lg font-semibold">{String(p.title)}</h3> : null}
          <p className="mt-1 whitespace-pre-line text-slate-700">{String(p.body ?? "")}</p>
        </div>
      );
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
    case "Footer":
      return <div className="border-t px-6 py-4 text-center text-sm text-slate-500">{String(p.copyright ?? "")}</div>;
    default:
      return <div className="px-6 py-2 text-xs text-slate-400">[block: {block.type}]</div>;
  }
}
