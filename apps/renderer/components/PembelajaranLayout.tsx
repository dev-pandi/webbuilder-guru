// PembelajaranLayout — layout Fumadocs-style untuk halaman detail materi
// pembelajaran. Adaptif: chrome (sidebar/TOC/breadcrumb/prev-next) muncul
// hanya kalau punya alasan ada (lihat rules di PembelajaranLayoutServer).
//
// Komponen ini pakai "use client" hanya untuk scroll-spy TOC + mobile drawer.
// Konten + sidebar + breadcrumb + prev/next semua di-render server-side
// (dipass sebagai props) supaya SEO + first paint cepat.

"use client";

import { useEffect, useRef, useState } from "react";
import type { LearningTreeNode } from "@/lib/api";

export type PembelajaranNavItem = {
  id: string;
  title: string;
  level: 2 | 3;
};

export type PembelajaranNavCurrent = {
  id: string;
  slug: string;
  parentId: string | null;
};

export function PembelajaranLayout(props: {
  tree: LearningTreeNode[];
  current: PembelajaranNavCurrent;
  tocItems: PembelajaranNavItem[];
  showSidebar: boolean;
  showTOC: boolean;
  children: React.ReactNode;
}) {
  const { tree, current, tocItems, showSidebar, showTOC, children } = props;
  const [activeId, setActiveId] = useState<string>("");

  // Scroll-spy: track H2/H3 yang sedang di viewport untuk highlight TOC.
  useEffect(() => {
    if (!showTOC || tocItems.length === 0) return;
    const headings = tocItems
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        // Pilih heading yang paling atas yang sedang intersecting.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: [0, 1] },
    );
    headings.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [tocItems, showTOC]);

  return (
    <div
      className="pembelajaran-grid"
      data-sidebar={showSidebar || undefined}
      data-toc={showTOC || undefined}
    >
      {showSidebar && (
        <>
          {/* Mobile drawer: <details> native, no JS */}
          <details className="pembelajaran-sidebar-mobile">
            <summary>
              <span>Daftar Materi</span>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M6 8l4 4 4-4z" />
              </svg>
            </summary>
            <SidebarNav tree={tree} currentId={current.id} />
          </details>
          <aside className="pembelajaran-sidebar">
            <SidebarNav tree={tree} currentId={current.id} />
          </aside>
        </>
      )}

      <main className="pembelajaran-main">{children}</main>

      {showTOC && tocItems.length > 0 && (
        <aside className="pembelajaran-toc">
          <div className="pembelajaran-toc__sticky">
            <div className="pembelajaran-toc__title">Di halaman ini</div>
            <ul>
              {tocItems.map((item) => (
                <li
                  key={item.id}
                  className={
                    `pembelajaran-toc__item pembelajaran-toc__item--${item.level}` +
                    (activeId === item.id ? " is-active" : "")
                  }
                >
                  <a href={`#${item.id}`}>{item.title}</a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}

function SidebarNav({
  tree,
  currentId,
}: {
  tree: LearningTreeNode[];
  currentId: string;
}) {
  return (
    <nav>
      <div className="pembelajaran-sidebar__home">
        <a href="/pembelajaran">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M4 10l6-6 6 6v6a1 1 0 01-1 1h-3v-5H8v5H5a1 1 0 01-1-1v-6z" />
          </svg>
          Semua Materi
        </a>
      </div>
      <ul className="pembelajaran-sidebar__tree">
        {tree.map((node) => (
          <li key={node.id}>
            {node.children && node.children.length > 0 ? (
              <>
                {/* Parent dengan children: tampil sebagai section header + link */}
                <div className="pembelajaran-sidebar__section">
                  <a
                    href={`/pembelajaran/${node.slug}`}
                    className={
                      "pembelajaran-sidebar__parent" +
                      (currentId === node.id ? " is-active" : "")
                    }
                  >
                    {node.emoji ? (
                      <span className="pembelajaran-sidebar__emoji" aria-hidden>
                        {node.emoji}
                      </span>
                    ) : null}
                    {node.title}
                  </a>
                </div>
                <ul className="pembelajaran-sidebar__children">
                  {node.children.map((c) => (
                    <li key={c.id}>
                      <a
                        href={`/pembelajaran/${c.slug}`}
                        className={
                          "pembelajaran-sidebar__link" +
                          (currentId === c.id ? " is-active" : "")
                        }
                      >
                        {c.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              // Flat parent (no children): link biasa.
              <a
                href={`/pembelajaran/${node.slug}`}
                className={
                  "pembelajaran-sidebar__link pembelajaran-sidebar__link--flat" +
                  (currentId === node.id ? " is-active" : "")
                }
              >
                {node.emoji ? (
                  <span className="pembelajaran-sidebar__emoji" aria-hidden>
                    {node.emoji}
                  </span>
                ) : null}
                {node.title}
              </a>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
