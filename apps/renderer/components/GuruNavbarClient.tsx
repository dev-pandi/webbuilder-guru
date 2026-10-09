"use client";

// GuruNavbarClient — client wrapper for the Guru navbar so active-link state
// reflects the current route. The stored block config's `active` flag is
// ignored because it was baked in at authoring time and would otherwise
// highlight the same link on every page.

import { usePathname } from "next/navigation";

export function GuruNavbarClient(p: {
  brandName?: string;
  brandRole?: string;
  brandMark?: string;
  links?: Array<{ label: string; href: string; active?: boolean }>;
}) {
  const pathname = usePathname() ?? "/";
  const toggleId = "guru-nav-toggle";
  const links = p.links ?? [];

  return (
    <header className="guru-site-header">
      <div className="guru-container guru-nav-shell">
        <a className="guru-brand" href="/" aria-label={`Beranda ${p.brandName ?? ""}`}>
          {p.brandMark ? <span className="guru-brand__mark">{p.brandMark}</span> : null}
          <span className="guru-brand__copy">
            {p.brandName}
            {p.brandRole ? <small>{p.brandRole}</small> : null}
          </span>
        </a>
        <input type="checkbox" id={toggleId} className="guru-nav-toggle-input" />
        <label htmlFor={toggleId} className="guru-nav-toggle" aria-label="Buka navigasi">
          <span />
          <span />
          <span />
        </label>
        <nav className="guru-site-nav" aria-label="Navigasi utama">
          {links.map((l, i) => {
            const active = isLinkActive(pathname, l.href);
            return (
              <a
                key={i}
                href={l.href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

// isLinkActive — root "/" matches only exact root to avoid highlighting Beranda
// on every page. Non-root hrefs match the exact path or any deeper segment,
// so /artikel/foo keeps the Artikel tab lit.
function isLinkActive(pathname: string, href: string): boolean {
  if (!href) return false;
  const normalized = href.split("?")[0].split("#")[0];
  if (normalized === "/" || normalized === "") {
    return pathname === "/" || pathname === "";
  }
  const trimmed = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  return pathname === trimmed || pathname.startsWith(trimmed + "/");
}
