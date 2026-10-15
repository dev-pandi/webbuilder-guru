// pembelajaran-callouts — convert GitHub-style callout syntax ke HTML blocks
// yang di-style sebagai info/tip/warning/danger/note/success.
//
// Syntax yang didukung (compat GitHub):
//   > [!NOTE]
//   > Body text here.
//
//   > [!TIP] Judul opsional
//   > Multi-line body
//   > works too.
//
// Approach: post-process HTML output marked.parse (bukan pre-process MD).
// Alasan: marked sudah expand blockquote jadi <blockquote><p>...</p></blockquote>
// — kita cuma rewrite yang pertama <p>-nya cocok pattern [!TYPE].

type CalloutType = "info" | "tip" | "warning" | "danger" | "note" | "success";

const META: Record<CalloutType, { title: string; icon: string }> = {
  info: {
    title: "Info",
    icon: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-4h2v4zm0-6H9V5h2v2z"/></svg>',
  },
  tip: {
    title: "Tips",
    icon: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 2a6 6 0 00-4 10.5V15a1 1 0 001 1h6a1 1 0 001-1v-2.5A6 6 0 0010 2zM8 18h4a1 1 0 010 2H8a1 1 0 010-2z"/></svg>',
  },
  warning: {
    title: "Perhatikan",
    icon: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 1l10 18H0L10 1zm0 7v4h.01V8H10zm0 6v2h.01v-2H10z"/></svg>',
  },
  danger: {
    title: "Berbahaya",
    icon: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm3.5 11l-1.5 1.5L10 11.5 7.5 14 6 12.5 8.5 10 6 7.5 7.5 6 10 8.5 12.5 6 14 7.5 11.5 10 14 12.5z"/></svg>',
  },
  note: {
    title: "Catatan",
    icon: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M4 2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zm2 5h8V5H6v2zm0 4h8V9H6v2zm0 4h5v-2H6v2z"/></svg>',
  },
  success: {
    title: "Berhasil",
    icon: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm-1 11.5l-3.5-3.5L6.5 8.5 9 11l4.5-4.5L15 8l-6 5.5z"/></svg>',
  },
};

function normalize(type: string): CalloutType {
  const t = type.toLowerCase();
  if (t === "warning" || t === "caution") return "warning";
  if (t === "danger" || t === "important") return "danger";
  if (t === "tip") return "tip";
  if (t === "note") return "note";
  if (t === "success") return "success";
  return "info";
}

export function processCallouts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\s*\[!(\w+)\]([^<\n]*)<\/p>([\s\S]*?)<\/blockquote>/gi,
    (_match, typeRaw: string, titleRaw: string, body: string) => {
      const type = normalize(typeRaw);
      const customTitle = titleRaw.trim();
      const meta = META[type];
      const title = customTitle || meta.title;
      return `<div class="pembelajaran-callout pembelajaran-callout--${type}">
<div class="pembelajaran-callout__head">
<span class="pembelajaran-callout__icon">${meta.icon}</span>
<span class="pembelajaran-callout__title">${escapeHTML(title)}</span>
</div>
<div class="pembelajaran-callout__body">${body}</div>
</div>`;
    },
  );
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
