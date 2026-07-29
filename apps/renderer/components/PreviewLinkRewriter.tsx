"use client";

// Rewrite internal absolute-path links inside template preview. Blok
// Navbar/CTA di template pakai href absolute (`/profil`, `/kontak`, `/`)
// yang di production di-resolve oleh renderer catch-all (Host lookup).
// Di mode preview, path itu jatuh ke catch-all → Host tidak dikenal → 404.
//
// Trik: intercept click di capture phase + rewrite ke
// `/template-preview/<slug><originalPath>` sebelum navigasi terjadi.
// Aman untuk external / anchor / mailto: — skip explicit.

import { useEffect } from "react";

export function PreviewLinkRewriter({ templateSlug }: { templateSlug: string }) {
  useEffect(() => {
    const prefix = `/template-preview/${templateSlug}`;

    function handler(ev: MouseEvent) {
      // Biarkan modifier click (new tab dsb) default browser behavior.
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

      const target = ev.target as Element | null;
      if (!target) return;
      const a = target.closest("a") as HTMLAnchorElement | null;
      if (!a) return;

      const raw = a.getAttribute("href");
      if (!raw) return;

      // Hanya rewrite internal absolute-path yang belum ke-prefix.
      if (!raw.startsWith("/")) return; // relative / protocol / anchor
      if (raw.startsWith("//")) return; // protocol-relative external
      if (raw.startsWith(prefix)) return; // already prefixed
      if (raw.startsWith("/template-preview/")) return; // ke template lain

      // `/` = home page dari template ini.
      const rewritten = raw === "/" ? prefix : `${prefix}${raw}`;

      ev.preventDefault();
      window.location.assign(rewritten);
    }

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [templateSlug]);

  return null;
}
