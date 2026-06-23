// Block schemas drive the editor's add-block menu and per-block prop form.
// They must stay in sync with the block render code in:
//   - apps/web/app/sites/[id]/editor/page.tsx (preview)
//   - apps/renderer/components/Blocks.tsx     (live render)
//   - apps/api/internal/exports/render.go     (static export)

export type FieldType = "string" | "textarea" | "number" | "image" | "items";

export type ItemField = { name: string; label: string; type: "string" | "textarea" | "image" };

export type FieldDef =
  | { name: string; label: string; type: "string" | "textarea" | "number" | "image"; placeholder?: string }
  | { name: string; label: string; type: "items"; itemFields: ItemField[] };

export type BlockSchema = {
  type: string;
  label: string;
  defaults: Record<string, unknown>;
  fields: FieldDef[];
};

export const blockSchemas: BlockSchema[] = [
  {
    type: "Navbar",
    label: "Navbar",
    defaults: { brand: "Brand", links: [{ label: "Beranda", href: "/" }] },
    fields: [
      { name: "brand", label: "Brand", type: "string" },
      {
        name: "links",
        label: "Menu",
        type: "items",
        itemFields: [
          { name: "label", label: "Label", type: "string" },
          { name: "href", label: "Tautan", type: "string" },
        ],
      },
    ],
  },
  {
    type: "Hero",
    label: "Hero",
    defaults: { title: "Judul Hero", subtitle: "Subjudul singkat.", ctaLabel: "Mulai", ctaHref: "#" },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      { name: "ctaLabel", label: "CTA Label", type: "string" },
      { name: "ctaHref", label: "CTA Link", type: "string" },
    ],
  },
  {
    type: "Heading",
    label: "Heading",
    defaults: { text: "Judul", level: 2 },
    fields: [
      { name: "text", label: "Teks", type: "string" },
      { name: "level", label: "Level (1-6)", type: "number" },
    ],
  },
  {
    type: "Text",
    label: "Teks Paragraf",
    defaults: { body: "Tulis isi paragraf di sini." },
    fields: [{ name: "body", label: "Isi", type: "textarea" }],
  },
  {
    type: "Section",
    label: "Section",
    defaults: { title: "Judul Section", body: "Deskripsi singkat." },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "body", label: "Isi", type: "textarea" },
    ],
  },
  {
    type: "FeatureList",
    label: "Daftar Fitur",
    defaults: {
      title: "Mengapa Memilih Kami",
      items: [
        { title: "Fitur A", desc: "Penjelasan singkat." },
        { title: "Fitur B", desc: "Penjelasan singkat." },
        { title: "Fitur C", desc: "Penjelasan singkat." },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Item",
        type: "items",
        itemFields: [
          { name: "title", label: "Judul", type: "string" },
          { name: "desc", label: "Deskripsi", type: "textarea" },
        ],
      },
    ],
  },
  {
    type: "ProductGrid",
    label: "Grid Produk",
    defaults: {
      title: "Best Seller",
      items: [
        { name: "Produk A", price: "Rp 10.000", image: "" },
        { name: "Produk B", price: "Rp 20.000", image: "" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Produk",
        type: "items",
        itemFields: [
          { name: "name", label: "Nama", type: "string" },
          { name: "price", label: "Harga", type: "string" },
          { name: "image", label: "Gambar", type: "image" },
        ],
      },
    ],
  },
  {
    type: "ProjectGrid",
    label: "Grid Project",
    defaults: {
      title: "Project",
      items: [
        { name: "Project A", desc: "Deskripsi.", href: "#" },
        { name: "Project B", desc: "Deskripsi.", href: "#" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Project",
        type: "items",
        itemFields: [
          { name: "name", label: "Nama", type: "string" },
          { name: "desc", label: "Deskripsi", type: "textarea" },
          { name: "href", label: "Tautan", type: "string" },
        ],
      },
    ],
  },
  {
    type: "BlogList",
    label: "List Blog",
    defaults: {
      items: [
        { title: "Artikel A", excerpt: "Ringkasan.", href: "#" },
        { title: "Artikel B", excerpt: "Ringkasan.", href: "#" },
      ],
    },
    fields: [
      {
        name: "items",
        label: "Artikel",
        type: "items",
        itemFields: [
          { name: "title", label: "Judul", type: "string" },
          { name: "excerpt", label: "Ringkasan", type: "textarea" },
          { name: "href", label: "Tautan", type: "string" },
        ],
      },
    ],
  },
  {
    type: "Testimonial",
    label: "Testimoni",
    defaults: {
      items: [{ name: "Nama", text: "Testimoni." }],
    },
    fields: [
      {
        name: "items",
        label: "Testimoni",
        type: "items",
        itemFields: [
          { name: "name", label: "Nama", type: "string" },
          { name: "text", label: "Pesan", type: "textarea" },
        ],
      },
    ],
  },
  {
    type: "Footer",
    label: "Footer",
    defaults: { copyright: "© 2025" },
    fields: [{ name: "copyright", label: "Copyright", type: "string" }],
  },
  {
    type: "ProductGridDynamic",
    label: "Grid Produk (dari DB)",
    defaults: { title: "Produk Terbaru", limit: 12 },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "limit", label: "Jumlah maks", type: "number" },
    ],
  },
  {
    type: "BlogListDynamic",
    label: "List Blog (dari DB)",
    defaults: { title: "Artikel Terbaru", limit: 10 },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "limit", label: "Jumlah maks", type: "number" },
    ],
  },
];

export function schemaFor(type: string): BlockSchema | undefined {
  return blockSchemas.find((s) => s.type === type);
}
