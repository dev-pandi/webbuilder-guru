"use client";

// RichEditor — TipTap-based markdown editor untuk Tulisan + Materi.
//
// Storage tetap markdown (roundtrip via marked + turndown). Extensions
// pilihan yang butuh HTML disimpan sebagai fenced code custom:
//   • YouTube video → ```youtube\n<url>\n```
//   • Audio (asset atau URL eksternal) → ```audio\n<url>\n```
// Custom marked code renderer detect fence itu + convert ke iframe/<audio>
// tag saat load ke editor. Turndown custom rule convert balik saat save.
// Renderer aplikasi juga harus punya rule yang sama (lihat renderer app).

import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExt from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { Placeholder } from "@tiptap/extensions";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { marked, type Tokens } from "marked";
import TurndownService from "turndown";
// @ts-expect-error — turndown-plugin-gfm ships no TS types.
import { gfm as turndownGfm } from "turndown-plugin-gfm";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Youtube as YoutubeIcon,
  Music,
  Table as TableIcon,
  Minus,
  Undo,
  Redo,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
  Type,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { getAccessToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssetPickerDialog } from "@/components/AssetPickerDialog";
import { cn } from "@/lib/utils";

// --- Marked configuration ---
//
// Drop raw HTML (XSS safety). Custom code renderer detect fence bahasa
// `youtube` / `audio` → render iframe/<audio> HTML kita generate sendiri
// (aman, tidak dari user input HTML mentah).
// Size preset yang tersedia. `null` = full width (no override).
// Disimpan di URL fragment `#w=25|50|75` untuk markdown roundtrip.
type SizePreset = 25 | 50 | 75 | 100 | null;
const SIZE_PRESETS: Array<{ value: SizePreset; label: string }> = [
  { value: 25, label: "S" },
  { value: 50, label: "M" },
  { value: 75, label: "L" },
  { value: null, label: "Full" },
];

// Parse `#w=NUMBER` fragment dari URL. Return [urlWithoutFragment, size].
function splitSizeFragment(url: string): [string, SizePreset] {
  const m = url.match(/^(.*?)#w=(\d+)$/);
  if (!m) return [url, null];
  const w = parseInt(m[2], 10);
  if (w === 25 || w === 50 || w === 75 || w === 100) return [m[1], w];
  return [m[1], null];
}
// Reverse: append `#w=SIZE` kalau size di-set (non-null, non-100).
function joinSizeFragment(url: string, size: SizePreset): string {
  const clean = url.replace(/#w=\d+$/, "");
  if (!size || size === 100) return clean;
  return `${clean}#w=${size}`;
}

marked.setOptions({ gfm: true, breaks: false });
marked.use({
  // WAJIB — supaya marked TIDAK auto-convert renderer function kita ke
  // old positional signature (text, lang, escaped) / (href, title, text).
  // Tanpa flag ini, `token.href` / `token.text` / `token.lang` di dalam
  // handler kita jadi undefined → image + fence youtube/audio silent-drop
  // saat mdToHtml, akibatnya media hilang dari editor & renderer.
  useNewRenderer: true,
  renderer: {
    // Preserve inline HTML — dibutuhkan supaya styling (color/font/
    // alignment/size) yang di-emit sebagai <span style="...">text</span>
    // atau <p style="text-align:...">...</p> roundtrip aman via markdown.
    // Risk XSS: kita trust karena content di-edit via TipTap yang punya
    // schema whitelist (hanya mark/node yang didaftarkan diizinkan).
    html: (token: Tokens.HTML | { text?: string } | string) => {
      if (typeof token === "string") return token;
      if ("text" in token) return token.text ?? "";
      return "";
    },
    // Image dengan URL fragment `#w=N` → render dengan style max-width:N%.
    // `data-size` disimpan supaya editor node bisa parseHTML lalu tombol
    // ukuran tetap active (highlight preset yang cocok).
    image(this: unknown, token: Tokens.Image) {
      const [cleanURL, size] = splitSizeFragment(token.href ?? "");
      const alt = escapeHTML(token.text ?? "");
      const title = token.title ? ` title="${escapeHTML(token.title)}"` : "";
      const style = size && size !== 100 ? ` style="max-width:${size}%; height:auto"` : "";
      const dataSize = size ? ` data-size="${size}"` : "";
      // src tetap include fragment supaya turndown roundtrip kembali ke
      // markdown yang identik.
      return `<img src="${escapeHTML(token.href ?? "")}" alt="${alt}"${title}${style}${dataSize} data-clean-src="${escapeHTML(cleanURL)}">`;
    },
    code(this: unknown, token: Tokens.Code) {
      const lang = (token.lang ?? "").trim().toLowerCase();
      const raw = (token.text ?? "").trim();
      if (lang === "youtube") {
        const [cleanURL, size] = splitSizeFragment(raw);
        const embed = youtubeEmbedURL(cleanURL);
        if (!embed) return `<p><em>Video URL tidak dikenali: ${escapeHTML(cleanURL)}</em></p>`;
        // Wrapper div dengan style max-width supaya iframe di dalamnya scale.
        // 16:9 aspect ratio jaga proporsi lewat padding-bottom hack di CSS
        // atau langsung set width/height (fixed ratio 640x360 default).
        const wStyle = size && size !== 100 ? ` style="max-width:${size}%"` : "";
        const dataSize = size ? ` data-size="${size}"` : "";
        const dataURL = ` data-src="${escapeHTML(cleanURL)}"`;
        return `<div class="wb-yt-wrap" data-youtube-video${wStyle}${dataSize}${dataURL}><iframe src="${escapeHTML(embed)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      }
      if (lang === "audio") {
        return `<audio class="wb-audio" data-audio controls preload="none" src="${escapeHTML(raw)}"></audio>`;
      }
      // Default fenced code renderer.
      const escaped = escapeHTML(token.text ?? "");
      return `<pre><code${lang ? ` class="language-${escapeHTML(lang)}"` : ""}>${escaped}</code></pre>`;
    },
  },
});

// --- Turndown configuration ---
//
// Base: headingStyle=atx + fenced code + `-` bullets. GFM plugin adds
// support untuk table (`| col | col |`), strikethrough, task lists.
// Custom rules convert iframe (YouTube) + <audio> → fenced code kita.
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
td.use(turndownGfm);

// Preserve <span style="..."> dari color/font-family/font-size.
// Default turndown drop span. Rule: kalau span punya style, keep as HTML.
td.addRule("styledSpan", {
  filter: (node) => {
    if (node.nodeName !== "SPAN") return false;
    const style = (node as HTMLElement).getAttribute("style");
    return !!style && style.trim().length > 0;
  },
  replacement: (content, node) => {
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    return `<span style="${style}">${content}</span>`;
  },
});

// Preserve <p style="text-align: center|right|justify"> dari TextAlign ext.
// Default turndown convert <p> ke dua newline. Rule: kalau punya text-align
// selain default (left), emit sebagai raw HTML.
td.addRule("alignedParagraph", {
  filter: (node) => {
    if (node.nodeName !== "P") return false;
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    return /text-align:\s*(center|right|justify)/i.test(style);
  },
  replacement: (content, node) => {
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    return `\n\n<p style="${style}">${content}</p>\n\n`;
  },
});

// Heading dengan text-align — mirror pola di atas.
td.addRule("alignedHeading", {
  filter: (node) => {
    if (!/^H[1-6]$/.test(node.nodeName)) return false;
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    return /text-align:\s*(center|right|justify)/i.test(style);
  },
  replacement: (content, node) => {
    const style = (node as HTMLElement).getAttribute("style") ?? "";
    const tag = node.nodeName.toLowerCase();
    return `\n\n<${tag} style="${style}">${content}</${tag}>\n\n`;
  },
});

// YouTube iframe → ```youtube\n<url>[#w=N]\n```
// Match any iframe dengan src YouTube (embed / watch / youtu.be / shorts).
// Size fragment diambil dari wrapper div data-size (kalau ada) — di-set
// oleh YoutubeWithSize renderHTML.
td.addRule("youtube", {
  filter: (node) => {
    if (node.nodeName !== "IFRAME") return false;
    const src = (node as HTMLIFrameElement).getAttribute("src") ?? "";
    // Include semua variant YouTube URL — normalize di replacement.
    return (
      src.includes("youtube.com") ||
      src.includes("youtu.be") ||
      src.includes("youtube-nocookie.com")
    );
  },
  replacement: (_content, node) => {
    const iframe = node as HTMLIFrameElement;
    const src = iframe.getAttribute("src") ?? "";
    const url = normalizeYouTubeURL(src);
    // Check wrapper for data-size.
    const wrapper = iframe.parentElement;
    const sizeAttr = wrapper?.getAttribute("data-size");
    const size = sizeAttr ? Number(sizeAttr) : null;
    const finalURL = size ? joinSizeFragment(url, size as SizePreset) : url;
    return `\n\n\`\`\`youtube\n${finalURL}\n\`\`\`\n\n`;
  },
});
// Kalau iframe di-wrap dengan <div data-youtube-video> (Youtube extension),
// treat wrapper sebagai "skip" supaya iframe di dalamnya yg di-handle.
td.addRule("youtube-wrapper", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      (node as HTMLElement).getAttribute("data-youtube-video") !== null
    );
  },
  replacement: (content) => content, // pass through — iframe inside handled by rule above
});

// <audio> → ```audio\n<url>\n```
td.addRule("audio", {
  filter: "audio" as unknown as (node: HTMLElement) => boolean,
  replacement: (_content, node) => {
    const src = (node as HTMLAudioElement).getAttribute("src") ?? "";
    return src ? `\n\n\`\`\`audio\n${src}\n\`\`\`\n\n` : "";
  },
});

// --- Helpers ---

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Parse berbagai bentuk URL YouTube → embed URL.
// Support:
//   https://www.youtube.com/watch?v=<ID>
//   https://youtu.be/<ID>
//   https://www.youtube.com/embed/<ID>
//   https://www.youtube.com/shorts/<ID>
function youtubeEmbedURL(input: string): string | null {
  const id = extractYouTubeID(input);
  if (!id) return null;
  return `https://www.youtube.com/embed/${id}`;
}
function normalizeYouTubeURL(input: string): string {
  const id = extractYouTubeID(input);
  if (!id) return input;
  return `https://www.youtube.com/watch?v=${id}`;
}
function extractYouTubeID(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      // /embed/<id> or /shorts/<id>
      if ((parts[0] === "embed" || parts[0] === "shorts") && parts[1]) return parts[1];
    }
  } catch {
    // not URL — maybe raw ID
    if (/^[A-Za-z0-9_-]{6,15}$/.test(s)) return s;
  }
  return null;
}

function mdToHtml(md: string): string {
  if (!md) return "";
  const out = marked.parse(md);
  return typeof out === "string" ? out : "";
}

// --- ImageWithSize ---
//
// Extend default Image ext supaya renderHTML membaca URL fragment `#w=N`
// dari src dan apply `style="max-width:N%"` + `data-size=N`. Editor jadi
// visually match markdown (image ter-resize saat load). Toolbar update
// ukuran dengan cara replace src attribute lewat updateAttributes.
const ImageWithSize = ImageExt.extend({
  renderHTML({ HTMLAttributes }) {
    const src = (HTMLAttributes.src as string) ?? "";
    const [, size] = splitSizeFragment(src);
    const extra: Record<string, string> = {};
    if (size && size !== 100) {
      extra.style = `max-width:${size}%; height:auto`;
      extra["data-size"] = String(size);
    }
    return ["img", mergeAttributes(HTMLAttributes, extra)];
  },
});

// --- YoutubeWithSize ---
//
// Extend Youtube ext. Attribute `size` disimpan di node — bukan di URL
// fragment (karena src iframe adalah embed URL, fragment di sana rawan
// hilang saat rebuild). renderHTML tetap render wrapper <div> + iframe,
// tambahkan style + data-size saat size di-set.
const YoutubeWithSize = Youtube.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: null as SizePreset,
        parseHTML: (el) => {
          const ds = el.getAttribute("data-size");
          return ds ? (Number(ds) as SizePreset) : null;
        },
        // Tidak return HTML attribute dari sini — di-inject manual di renderHTML
        // pada wrapper div (bukan iframe root).
        renderHTML: () => ({}),
      },
    };
  },
  // Static renderHTML — dipakai turndown (serializer) untuk read HTML,
  // dan renderer aplikasi. NodeView di bawah handle rendering di editor.
  renderHTML({ HTMLAttributes, node }) {
    const size = (node.attrs.size ?? null) as SizePreset;
    const wrapAttrs: Record<string, string> = {
      "data-youtube-video": "",
      class: "wb-yt-wrap",
    };
    if (size && size !== 100) {
      wrapAttrs.style = `max-width:${size}%`;
      wrapAttrs["data-size"] = String(size);
    }
    const rawSrc = (HTMLAttributes.src as string) ?? "";
    const embedSrc = youtubeEmbedURL(rawSrc) ?? rawSrc;
    return [
      "div",
      wrapAttrs,
      [
        "iframe",
        mergeAttributes(HTMLAttributes, {
          src: embedSrc,
          frameborder: "0",
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
        }),
      ],
    ];
  },
  // NodeView untuk editor — wrap iframe dengan overlay yang capture click
  // supaya node bisa di-select (iframe biasanya menelan click). Selected
  // state → show delete button di corner. Fix issue "YouTube tidak bisa
  // di-delete" karena click ke iframe = focus embed, bukan node.
  addNodeView() {
    return ReactNodeViewRenderer(YoutubeNodeView);
  },
});

// YoutubeNodeView — React component untuk NodeView. Iframe di-render
// normal, tapi overlay div absolute di atasnya capture pointer events →
// klik = select node (deleteable via Backspace/Delete). Tombol × di
// pojok kanan atas visible saat selected.
function YoutubeNodeView({ node, selected, deleteNode, editor }: NodeViewProps) {
  const size = (node.attrs.size ?? null) as SizePreset;
  const src = (node.attrs.src as string) ?? "";
  const embedSrc = youtubeEmbedURL(src) ?? src;
  const wrapStyle: React.CSSProperties = {
    position: "relative",
    display: "block",
    margin: "1em 0",
    ...(size && size !== 100 ? { maxWidth: `${size}%` } : {}),
  };
  return (
    <NodeViewWrapper
      as="div"
      className={cn("wb-yt-wrap", selected && "wb-yt-selected")}
      data-youtube-video=""
      data-size={size ?? undefined}
      style={wrapStyle}
    >
      <div style={{ position: "relative", aspectRatio: "16/9" }}>
        <iframe
          src={embedSrc}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, borderRadius: 8 }}
        />
        {/* Overlay untuk capture click — hanya aktif saat NOT selected
            supaya first-click = select node. Setelah selected, overlay
            hilang → user bisa play video normal. Solve issue "YouTube
            iframe menelan click, node tidak bisa dipilih/di-delete". */}
        {!selected && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              cursor: "pointer",
              background: "transparent",
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Cari posisi node ini di doc → setNodeSelection ke sana.
              // Descendants walk sekali; return false untuk short-circuit.
              let found = -1;
              editor.state.doc.descendants((n, pos) => {
                if (n === node) {
                  found = pos;
                  return false;
                }
                return true;
              });
              if (found >= 0) {
                editor.chain().focus().setNodeSelection(found).run();
              }
            }}
          />
        )}
      </div>
      {selected && (
        <button
          type="button"
          contentEditable={false}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
          title="Hapus video"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 10,
            width: 28,
            height: 28,
            borderRadius: 999,
            border: "none",
            background: "rgba(15, 23, 42, 0.85)",
            color: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            fontSize: 16,
            lineHeight: 1,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
        >
          ×
        </button>
      )}
    </NodeViewWrapper>
  );
}

// --- Custom Audio node ---
//
// TipTap belum ship extension-audio official. Bikin sendiri: block node,
// atomic, dengan attribute src. Render sebagai <audio controls>. Saat
// serialize via turndown, custom rule di atas convert ke fence markdown.
const AudioNode = Node.create({
  name: "audioBlock",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "audio[data-audio]" }, { tag: "audio" }];
  },
  // Static renderHTML — dipakai turndown (serializer) + fallback SSR.
  // NodeView di bawah override untuk render editor dengan overlay + delete.
  renderHTML({ HTMLAttributes }) {
    return [
      "audio",
      mergeAttributes(HTMLAttributes, {
        controls: "true",
        preload: "none",
        class: "wb-audio",
        "data-audio": "",
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView);
  },
});

// AudioNodeView — mirror pattern dari YoutubeNodeView. Wrap <audio>
// dengan container + overlay click-capture (saat not selected) + tombol
// delete (saat selected). Fix issue "audio susah di-delete karena click
// masuk ke controls native player".
function AudioNodeView({ node, selected, deleteNode, editor }: NodeViewProps) {
  const src = (node.attrs.src as string) ?? "";
  return (
    <NodeViewWrapper
      as="div"
      className={cn("wb-audio-wrap", selected && "wb-audio-selected")}
      data-audio=""
      style={{
        position: "relative",
        display: "block",
        margin: "1em 0",
        maxWidth: 520,
        marginLeft: "auto",
        marginRight: "auto",
      }}
    >
      <audio
        src={src}
        controls
        preload="none"
        className="wb-audio"
        style={{ width: "100%", display: "block" }}
      />
      {!selected && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            cursor: "pointer",
            background: "transparent",
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            let found = -1;
            editor.state.doc.descendants((n, pos) => {
              if (n === node) {
                found = pos;
                return false;
              }
              return true;
            });
            if (found >= 0) {
              editor.chain().focus().setNodeSelection(found).run();
            }
          }}
        />
      )}
      {selected && (
        <button
          type="button"
          contentEditable={false}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteNode();
          }}
          title="Hapus audio"
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            zIndex: 10,
            width: 24,
            height: 24,
            borderRadius: 999,
            border: "none",
            background: "rgba(15, 23, 42, 0.9)",
            color: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            fontSize: 14,
            lineHeight: 1,
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          ×
        </button>
      )}
    </NodeViewWrapper>
  );
}

// --- FontSize custom extension ---
//
// TipTap tidak punya official FontSize extension — kita bikin sebagai
// attribute `fontSize` di TextStyle mark. Ekstensi menambah command
// `setFontSize(size)` / `unsetFontSize()` yang bisa dipanggil toolbar.
//
// Simpan di <span style="font-size:14px">text</span>. Markdown roundtrip
// via HTML passthrough (marked allow HTML + turndown preserve span by
// default kalau ada style).
const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null as string | null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      // Pakai `any` di sini — type signature `addCommands` dari @tiptap/core
      // meng-expand ChainedCommands via module augmentation yang kita tidak
      // ikut daftarkan. Casting lebih sederhana daripada custom declaration.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setFontSize: (size: string) => ({ chain }: any) =>
        chain().setMark("textStyle", { fontSize: size }).run(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unsetFontSize: () => ({ chain }: any) =>
        chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    } as never;
  },
});

// Font family presets — font-safe untuk web, sans/serif/mono/display.
// Nama display → actual font stack. User lihat nama pendek di dropdown.
const FONT_FAMILIES: Array<{ label: string; stack: string }> = [
  { label: "Default", stack: "" },
  { label: "Sans Serif", stack: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { label: "Monospace", stack: "ui-monospace, 'SF Mono', Menlo, monospace" },
  { label: "Inter", stack: "'Inter', sans-serif" },
  { label: "Georgia", stack: "Georgia, serif" },
  { label: "Arial", stack: "Arial, sans-serif" },
  { label: "Times New Roman", stack: "'Times New Roman', serif" },
  { label: "Courier New", stack: "'Courier New', monospace" },
];

// Font sizes — document-style preset (10-32px) yang biasa dipakai di Word
// / Google Docs. Ukuran dalam px supaya rendering konsisten antar device.
const FONT_SIZES: string[] = ["10px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];

// Preset warna teks — grid 5x3 dengan warna dasar + beberapa aksen.
// Reset ke default via tombol "Hapus warna".
const TEXT_COLORS: string[] = [
  "#000000", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB",
  "#DC2626", "#EA580C", "#D97706", "#CA8A04", "#65A30D",
  "#16A34A", "#0D9488", "#0891B2", "#2563EB", "#4F46E5",
  "#7C3AED", "#C026D3", "#DB2777", "#E11D48", "#FFFFFF",
];

// --- Component ---

// sanitizePastedHTML — strip inline styles, Word artifacts, dan attribute
// non-standard yang biasa muncul saat paste dari Word/Google Docs/Notion.
// Tag structure (headings, lists, tables, links, images) preserved supaya
// user tetap dapat konten dengan formatting basic, tapi tanpa `mso-*`,
// `<span style="font-family:Calibri">`, dsb.
function sanitizePastedHTML(html: string): string {
  if (typeof window === "undefined" || !html) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Walk semua element, buang atribut yang bahaya / bloat.
  const bad = /^(style|class|lang|xml:.*|mso-.*|face|color|bgcolor|align|valign|width|height|border|cellpadding|cellspacing)$/i;
  const nodes = doc.body.querySelectorAll("*");
  nodes.forEach((el) => {
    // Buang tag Word artifact.
    if (el.tagName === "O:P" || el.tagName === "SPAN" && !el.textContent?.trim()) {
      el.remove();
      return;
    }
    for (const attr of Array.from(el.attributes)) {
      if (bad.test(attr.name)) el.removeAttribute(attr.name);
    }
    // Un-wrap <span> tanpa attribute setelah cleanup — biar tidak bloat.
    if (el.tagName === "SPAN" && el.attributes.length === 0) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    }
  });
  return doc.body.innerHTML;
}

// uploadImageFile — POST file ke assets endpoint site aktif, return URL.
// Dipakai drag-drop image di editor body. Params.id required — kalau
// editor mounted di route non-site (mis. /admin/*), fungsi return null
// dan drop di-toast fallback ke "gunakan tombol asset".
async function uploadImageFile(siteId: string, file: File, apiBase: string, token: string | null): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${apiBase}/api/v1/sites/${siteId}/assets`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    return (body?.data?.url as string) ?? null;
  } catch (e) {
    toast.error("Upload gagal: " + (e as Error).message);
    return null;
  }
}

export function RichEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (md: string) => void;
  placeholder?: string;
}) {
  const lastEmitted = useRef<string>(value);
  const params = useParams<{ id?: string }>();
  const siteId = params?.id;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Link ikut StarterKit sejak v3 — daftar manual bikin duplicate mark.
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow" },
        },
      }),
      ImageWithSize.configure({ inline: false }),
      Placeholder.configure({ placeholder: placeholder ?? "Mulai menulis…" }),
      YoutubeWithSize.configure({
        controls: true,
        nocookie: true,
        HTMLAttributes: { class: "wb-yt" },
      }),
      // GFM tables — starter kit tidak include, jadi register manual.
      Table.configure({ resizable: true, HTMLAttributes: { class: "wb-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      // Task list — checkbox `- [ ]` markdown roundtrip via GFM plugin.
      TaskList,
      TaskItem.configure({ nested: true }),
      // Custom audio block node.
      AudioNode,
      // --- Rich text styling: color, font, alignment, size ---
      // TextStyle wajib — jadi parent mark untuk Color + FontFamily + FontSize.
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
      // TextAlign — apply ke heading + paragraph. Simpan sebagai
      // style="text-align:center" di HTML, roundtrip via markdown inline HTML.
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "left",
      }),
    ],
    content: mdToHtml(value),
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    editorProps: {
      attributes: {
        class:
          "wb-prose prose-tight min-h-[400px] max-w-none p-4 focus:outline-none",
      },
      // Sanitize HTML dari clipboard sebelum di-parse TipTap. Cegah bloat
      // `style="font-family:Calibri;mso-*"` dari Word/Google Docs paste.
      transformPastedHTML(html) {
        return sanitizePastedHTML(html);
      },
      // Drop file image di editor body → upload ke asset library →
      // insert sebagai image node. Kalau bukan file image (mis. text drop),
      // biar TipTap handle default. Kalau siteId tidak available (admin
      // routes), toast fallback ke asset picker.
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const dragEvent = event as DragEvent;
        const files = dragEvent.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const image = Array.from(files).find((f) => f.type.startsWith("image/"));
        if (!image) return false;
        event.preventDefault();
        if (!siteId) {
          toast.info("Drag-drop image tidak tersedia di halaman ini. Pakai tombol Sisipkan gambar.");
          return true;
        }
        const coords = { left: dragEvent.clientX, top: dragEvent.clientY };
        const pos = view.posAtCoords(coords)?.pos ?? view.state.doc.content.size;
        const token = getAccessToken();
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://api.localhost";
        void (async () => {
          const url = await uploadImageFile(siteId, image, apiBase, token);
          if (!url) return;
          const node = view.state.schema.nodes.image?.create({ src: url });
          if (!node) return;
          const tr = view.state.tr.insert(pos, node);
          view.dispatch(tr);
          toast.success("Gambar berhasil di-upload");
        })();
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const md = td.turndown(editor.getHTML());
      lastEmitted.current = md;
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    const html = mdToHtml(value);
    if (editor.getHTML() !== html) {
      // emitUpdate:false — sinkron nilai dari luar tidak boleh memicu onUpdate,
      // nanti balik lagi ke parent sebagai perubahan user (loop).
      editor.commands.setContent(html, { emitUpdate: false });
      lastEmitted.current = value;
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className="min-h-[400px] animate-pulse rounded-lg border bg-muted/40" />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <Toolbar editor={editor} />
      <div className="border-t">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// --- Toolbar ---

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0);
  const [imageOpen, setImageOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [youtubeOpen, setYoutubeOpen] = useState(false);

  useEffect(() => {
    const update = () => force((n) => n + 1);
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur-sm">
        {/* Font family + size — document-style baris pertama */}
        <FontFamilyDropdown editor={editor} />
        <FontSizeDropdown editor={editor} />
        <Sep />

        <Btn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold (Cmd+B)"
          icon={Bold}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic (Cmd+I)"
          icon={Italic}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
          icon={Strikethrough}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          title="Inline code"
          icon={Code}
        />
        <ColorPickerBtn editor={editor} />
        <Sep />

        {/* Text align */}
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Rata kiri"
          icon={AlignLeft}
        />
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Rata tengah"
          icon={AlignCenter}
        />
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Rata kanan"
          icon={AlignRight}
        />
        <Btn
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          active={editor.isActive({ textAlign: "justify" })}
          title="Rata kanan-kiri"
          icon={AlignJustify}
        />
        <Sep />
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
          icon={Heading1}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
          icon={Heading2}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
          icon={Heading3}
        />
        <Sep />
        <Btn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
          icon={List}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered list"
          icon={ListOrdered}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")}
          title="Task list (checkbox)"
          icon={ListChecks}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="Quote"
          icon={Quote}
        />
        <Btn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="Code block"
          icon={Code}
        />
        <Btn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule (---)"
          icon={Minus}
        />
        <Sep />
        <LinkBtn editor={editor} />
        <Btn onClick={() => setImageOpen(true)} title="Sisipkan gambar dari asset" icon={ImageIcon} />
        <Btn onClick={() => setAudioOpen(true)} title="Sisipkan audio dari asset" icon={Music} />
        <Btn onClick={() => setYoutubeOpen(true)} title="Sisipkan video YouTube" icon={YoutubeIcon} />
        <TableMenu editor={editor} />
        <Sep />
        <Btn
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
          icon={Undo}
        />
        <Btn
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
          icon={Redo}
        />
      </div>

      <SizeBar editor={editor} />

      <AssetPickerDialog
        open={imageOpen}
        onOpenChange={setImageOpen}
        kind="image"
        onPick={(url) => {
          editor.chain().focus().setImage({ src: url }).run();
          setImageOpen(false);
          // Defer refocus setelah Radix Dialog close animation + focus
          // restoration ke trigger. Tanpa ini, dialog "restore focus to
          // trigger" override editor.focus() → cursor keluar dari editor.
          setTimeout(() => editor.commands.focus(), 50);
        }}
      />
      <AssetPickerDialog
        open={audioOpen}
        onOpenChange={setAudioOpen}
        kind="audio"
        onPick={(url) => {
          editor
            .chain()
            .focus()
            .insertContent({ type: "audioBlock", attrs: { src: url } })
            .run();
          setAudioOpen(false);
          setTimeout(() => editor.commands.focus(), 50);
        }}
      />
      <YoutubeDialog
        open={youtubeOpen}
        onOpenChange={setYoutubeOpen}
        onPick={(url) => {
          try {
            editor
              .chain()
              .focus()
              .insertContent({ type: "youtube", attrs: { src: url } })
              .run();
          } catch (e) {
            toast.error("Gagal sisipkan video", {
              description: (e as Error).message,
            });
          }
          setYoutubeOpen(false);
          setTimeout(() => editor.commands.focus(), 50);
        }}
      />
    </>
  );
}

// SizeBar — sub-toolbar yang muncul saat image atau youtube ter-selected.
// Tampilkan 4 preset ukuran (S 25%, M 50%, L 75%, Full 100%). Preset yang
// cocok dengan ukuran current di-highlight. Kalau tidak ada yang selected,
// bar hidden (kembali ke toolbar utama saja).
function SizeBar({ editor }: { editor: Editor }) {
  const isImage = editor.isActive("image");
  const isYoutube = editor.isActive("youtube");
  if (!isImage && !isYoutube) return null;

  const kind = isImage ? "image" : "youtube";
  // Ambil ukuran saat ini.
  let currentSize: SizePreset = null;
  if (isImage) {
    const src = (editor.getAttributes("image").src as string) ?? "";
    currentSize = splitSizeFragment(src)[1];
  } else {
    currentSize = (editor.getAttributes("youtube").size ?? null) as SizePreset;
  }

  function apply(size: SizePreset) {
    if (isImage) {
      const src = (editor.getAttributes("image").src as string) ?? "";
      const newSrc = joinSizeFragment(src, size);
      editor.chain().focus().updateAttributes("image", { src: newSrc }).run();
    } else {
      editor.chain().focus().updateAttributes("youtube", { size }).run();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-t bg-amber-50/60 px-3 py-1.5 text-[12px]">
      <span className="mr-1 font-semibold text-amber-800">
        Ukuran {kind === "image" ? "gambar" : "video"}:
      </span>
      {SIZE_PRESETS.map((p) => {
        const active =
          p.value === currentSize ||
          (p.value === null && (currentSize === null || currentSize === 100)) ||
          (p.value === 100 && (currentSize === null || currentSize === 100));
        return (
          <button
            key={String(p.value)}
            type="button"
            onClick={() => apply(p.value)}
            className={cn(
              "rounded-md border px-2.5 py-1 font-bold transition",
              active
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50",
            )}
            title={p.value ? `${p.value}%` : "Full width"}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function Btn({
  onClick,
  active,
  disabled,
  title,
  icon: Icon,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-8 rounded-md",
        active && "bg-foreground/10 text-foreground",
      )}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon className="size-4" />
    </Button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

// FontFamilyDropdown — pill dropdown dengan preview font name di label.
// Current font detect via `editor.getAttributes("textStyle").fontFamily`.
function FontFamilyDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "";
  const label = FONT_FAMILIES.find((f) => f.stack === current)?.label ?? "Default";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as unknown as globalThis.Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 min-w-[112px] items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-muted"
        title="Jenis font"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Type className="size-3.5 text-muted-foreground" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 min-w-[180px] overflow-hidden rounded-md border bg-popover p-1 shadow-md">
          {FONT_FAMILIES.map((f) => {
            const active = f.stack === current;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  if (f.stack === "") {
                    editor.chain().focus().unsetFontFamily().run();
                  } else {
                    editor.chain().focus().setFontFamily(f.stack).run();
                  }
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent/60",
                )}
                style={f.stack ? { fontFamily: f.stack } : undefined}
              >
                <span>{f.label}</span>
                {active && <span className="text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// FontSizeDropdown — pill dropdown ukuran. Current size dari textStyle.fontSize.
function FontSizeDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";
  const label = current ? current.replace("px", "") : "16";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as unknown as globalThis.Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 min-w-[56px] items-center justify-between gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-muted"
        title="Ukuran font"
      >
        <span>{label}</span>
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 min-w-[80px] overflow-hidden rounded-md border bg-popover p-1 shadow-md">
          {FONT_SIZES.map((s) => {
            const active = s === current;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (editor.chain().focus() as any).setFontSize(s).run();
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent/60",
                )}
              >
                <span>{s.replace("px", "")}</span>
                {active && <span className="text-xs">✓</span>}
              </button>
            );
          })}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (editor.chain().focus() as any).unsetFontSize().run();
              setOpen(false);
            }}
            className="flex w-full items-center rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Reset default
          </button>
        </div>
      )}
    </div>
  );
}

// ColorPickerBtn — tombol dengan palette popup. Current color terdeteksi
// dari attribute textStyle.color, ditampilkan sebagai bar di bawah icon.
function ColorPickerBtn({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = (editor.getAttributes("textStyle").color as string | undefined) ?? "";

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as unknown as globalThis.Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center justify-center rounded-md border border-transparent px-1.5 hover:bg-muted"
        title="Warna teks"
      >
        <div className="flex flex-col items-center">
          <Palette className="size-4" />
          <div
            className="mt-0.5 h-[3px] w-5 rounded-sm"
            style={{ background: current || "#000000" }}
          />
        </div>
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 w-[200px] rounded-md border bg-popover p-2 shadow-md">
          <div className="grid grid-cols-5 gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  editor.chain().focus().setColor(c).run();
                  setOpen(false);
                }}
                className={cn(
                  "size-6 rounded border transition hover:scale-110",
                  current.toLowerCase() === c.toLowerCase()
                    ? "border-foreground"
                    : "border-border",
                )}
                style={{ background: c }}
                title={c}
                aria-label={`Warna ${c}`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={current || "#000000"}
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Pilih warna lain"
            />
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setOpen(false);
              }}
              className="flex-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              Hapus warna
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LinkBtn({ editor }: { editor: Editor }) {
  function set() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL link (kosongkan untuk hapus):", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }
  return (
    <Btn
      onClick={set}
      active={editor.isActive("link")}
      title="Link"
      icon={LinkIcon}
    />
  );
}

// YoutubeDialog — modal input URL YouTube. Ganti window.prompt karena
// browser (Firefox setting, Chrome popup blocker, in-app browser) sering
// blok native dialog secara silent → icon terlihat "tidak respons".
// Proper Dialog + input validation live memberi UX konsisten dengan modal
// image/audio.
function YoutubeDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (url: string) => void;
}) {
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInput("");
      setErr(null);
    }
  }, [open]);

  const trimmed = input.trim();
  const id = trimmed ? extractYouTubeID(trimmed) : null;
  const canSubmit = !!id;

  function submit() {
    if (!id) {
      setErr("URL tidak dikenali. Gunakan link dari youtube.com/watch, youtu.be, atau youtube.com/shorts.");
      return;
    }
    onPick(`https://www.youtube.com/watch?v=${id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <YoutubeIcon className="size-5 text-red-500" />
            Sisipkan Video YouTube
          </DialogTitle>
          <DialogDescription>
            Paste URL dari youtube.com/watch, youtu.be, atau youtube.com/shorts.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <input
            autoFocus
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (err) setErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="https://www.youtube.com/watch?v=…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
          />
          {err && (
            <p className="text-[12px] text-rose-600">{err}</p>
          )}
          {id && (
            <p className="text-[12px] text-emerald-600">
              Video ID terdeteksi: <code className="font-mono">{id}</code>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Sisipkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TableMenu({ editor }: { editor: Editor }) {
  const inTable = editor.isActive("table");
  if (inTable) {
    return (
      <>
        <Btn
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          title="Tambah kolom"
          icon={TableIcon}
        />
        <Btn
          onClick={() => editor.chain().focus().addRowAfter().run()}
          title="Tambah baris"
          icon={TableIcon}
        />
        <Btn
          onClick={() => editor.chain().focus().deleteTable().run()}
          title="Hapus tabel"
          icon={TableIcon}
        />
      </>
    );
  }
  return (
    <Btn
      onClick={() =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run()
      }
      title="Sisipkan tabel"
      icon={TableIcon}
    />
  );
}
