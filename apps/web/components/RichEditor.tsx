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

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExt from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Youtube from "@tiptap/extension-youtube";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Node, mergeAttributes } from "@tiptap/core";
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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
    html: () => "",
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
        return `<div data-youtube-video${wStyle}${dataSize}${dataURL}><iframe src="${escapeHTML(embed)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
      }
      if (lang === "audio") {
        return `<audio data-audio controls preload="none" src="${escapeHTML(raw)}"></audio>`;
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
  renderHTML({ HTMLAttributes, node }) {
    // Rebuild struktur default TipTap Youtube (parent implementation) +
    // tambah wrapper attribute untuk size. Yang KRITIS: normalize URL ke
    // embed form supaya (a) iframe benar-benar play di browser (YouTube
    // reject non-embed URL di iframe), (b) turndown rule bisa detect
    // via `src.includes("youtube.com/embed")` → serialize ke markdown fence.
    const size = (node.attrs.size ?? null) as SizePreset;
    const wrapAttrs: Record<string, string> = {
      "data-youtube-video": "",
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
});

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
  renderHTML({ HTMLAttributes }) {
    return [
      "audio",
      mergeAttributes(HTMLAttributes, {
        controls: "true",
        preload: "none",
        "data-audio": "",
      }),
    ];
  },
});

// --- Component ---

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      LinkExt.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
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
    ],
    content: mdToHtml(value),
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    editorProps: {
      attributes: {
        class:
          "wb-prose prose-tight min-h-[400px] max-w-none p-4 focus:outline-none",
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
      editor.commands.setContent(html, false);
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
      <div className="flex flex-wrap items-center gap-0.5 bg-muted/30 px-2 py-1.5">
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
