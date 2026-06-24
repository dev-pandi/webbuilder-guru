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

export type BlockCategory =
  | "layout"
  | "hero"
  | "konten"
  | "showcase"
  | "marketing"
  | "sosial"
  | "list"
  | "dynamic";

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  layout: "Layout",
  hero: "Hero",
  konten: "Konten",
  showcase: "Showcase",
  marketing: "Marketing",
  sosial: "Sosial Proof",
  list: "List",
  dynamic: "Dynamic (DB)",
};

export type BlockSchema = {
  type: string;
  label: string;
  category: BlockCategory;
  description?: string;
  emoji?: string;
  defaults: Record<string, unknown>;
  fields: FieldDef[];
};

export const blockSchemas: BlockSchema[] = [
  // ---------- Layout ----------
  {
    type: "Navbar",
    label: "Navbar",
    category: "layout",
    emoji: "🧭",
    description: "Header navigasi dengan brand + menu",
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
    type: "Footer",
    label: "Footer",
    category: "layout",
    emoji: "🦶",
    description: "Footer copyright minimal",
    defaults: { copyright: "© 2025" },
    fields: [{ name: "copyright", label: "Copyright", type: "string" }],
  },
  {
    type: "Section",
    label: "Section Teks",
    category: "layout",
    emoji: "📐",
    description: "Section dengan judul + paragraf",
    defaults: { title: "Judul Section", body: "Deskripsi singkat." },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "body", label: "Isi", type: "textarea" },
    ],
  },

  // ---------- Hero ----------
  {
    type: "Hero",
    label: "Hero Standar",
    category: "hero",
    emoji: "🎯",
    description: "Centered hero dengan CTA",
    defaults: { title: "Judul Hero", subtitle: "Subjudul singkat.", ctaLabel: "Mulai", ctaHref: "#" },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      { name: "ctaLabel", label: "CTA Label", type: "string" },
      { name: "ctaHref", label: "CTA Link", type: "string" },
    ],
  },
  {
    type: "HeroSpotlight",
    label: "Hero Spotlight ✨",
    category: "hero",
    emoji: "🌟",
    description: "Hero dengan spotlight gradient animasi (Aceternity-style)",
    defaults: {
      eyebrow: "Pengumuman",
      title: "Bangun produk yang dicintai pengguna",
      subtitle: "Platform lengkap untuk meluncurkan ide Anda dengan cepat dan elegan.",
      ctaLabel: "Mulai Gratis",
      ctaHref: "#",
      ctaSecondaryLabel: "Lihat Demo",
      ctaSecondaryHref: "#",
    },
    fields: [
      { name: "eyebrow", label: "Eyebrow (label kecil di atas)", type: "string" },
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      { name: "ctaLabel", label: "CTA Utama Label", type: "string" },
      { name: "ctaHref", label: "CTA Utama Link", type: "string" },
      { name: "ctaSecondaryLabel", label: "CTA Sekunder Label", type: "string" },
      { name: "ctaSecondaryHref", label: "CTA Sekunder Link", type: "string" },
    ],
  },

  // ---------- Konten ----------
  {
    type: "Heading",
    label: "Heading",
    category: "konten",
    emoji: "📝",
    description: "Judul level 1-6",
    defaults: { text: "Judul", level: 2 },
    fields: [
      { name: "text", label: "Teks", type: "string" },
      { name: "level", label: "Level (1-6)", type: "number" },
    ],
  },
  {
    type: "Text",
    label: "Paragraf",
    category: "konten",
    emoji: "📄",
    description: "Paragraf teks panjang",
    defaults: { body: "Tulis isi paragraf di sini." },
    fields: [{ name: "body", label: "Isi", type: "textarea" }],
  },

  // ---------- Showcase ----------
  {
    type: "FeatureList",
    label: "Feature List",
    category: "showcase",
    emoji: "✨",
    description: "Grid 3 kolom fitur/value prop",
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
    type: "BentoGrid",
    label: "Bento Grid ✨",
    category: "showcase",
    emoji: "🍱",
    description: "Layout asimetris ala bento untuk fitur unggulan",
    defaults: {
      title: "Semua dalam Satu Platform",
      items: [
        { title: "Fast", desc: "Performa kilat dengan caching otomatis.", size: "large" },
        { title: "Secure", desc: "End-to-end encryption.", size: "small" },
        { title: "Scalable", desc: "Auto-scaling.", size: "small" },
        { title: "Developer Friendly", desc: "API yang clean dan SDK lengkap.", size: "wide" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Cell",
        type: "items",
        itemFields: [
          { name: "title", label: "Judul", type: "string" },
          { name: "desc", label: "Deskripsi", type: "textarea" },
          { name: "size", label: "Ukuran (small/wide/large)", type: "string" },
        ],
      },
    ],
  },
  {
    type: "StatsBar",
    label: "Stats Bar ✨",
    category: "showcase",
    emoji: "📊",
    description: "Deretan angka besar dengan label",
    defaults: {
      items: [
        { value: "10k+", label: "Pengguna Aktif" },
        { value: "99.9%", label: "Uptime" },
        { value: "150+", label: "Negara" },
        { value: "4.9★", label: "Rating" },
      ],
    },
    fields: [
      {
        name: "items",
        label: "Statistik",
        type: "items",
        itemFields: [
          { name: "value", label: "Nilai (mis. 10k+)", type: "string" },
          { name: "label", label: "Label", type: "string" },
        ],
      },
    ],
  },
  {
    type: "LogoCloud",
    label: "Logo Cloud ✨",
    category: "showcase",
    emoji: "🏢",
    description: "Logo partner / klien dalam baris",
    defaults: {
      title: "Dipercaya oleh tim hebat",
      items: [
        { name: "Acme", image: "" },
        { name: "Globex", image: "" },
        { name: "Initech", image: "" },
        { name: "Umbrella", image: "" },
        { name: "Soylent", image: "" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Logo",
        type: "items",
        itemFields: [
          { name: "name", label: "Nama", type: "string" },
          { name: "image", label: "Logo", type: "image" },
        ],
      },
    ],
  },

  // ---------- Marketing ----------
  {
    type: "CTABanner",
    label: "CTA Banner ✨",
    category: "marketing",
    emoji: "📣",
    description: "Banner ajakan dengan gradient + tombol besar",
    defaults: {
      title: "Siap memulai?",
      subtitle: "Daftar gratis dan rasakan sendiri perbedaannya dalam 2 menit.",
      ctaLabel: "Coba Gratis",
      ctaHref: "#",
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      { name: "ctaLabel", label: "CTA Label", type: "string" },
      { name: "ctaHref", label: "CTA Link", type: "string" },
    ],
  },
  {
    type: "PricingTable",
    label: "Pricing Table ✨",
    category: "marketing",
    emoji: "💎",
    description: "3-tier pricing card",
    defaults: {
      title: "Harga Sederhana",
      subtitle: "Pilih paket yang sesuai kebutuhan.",
      items: [
        {
          title: "Starter",
          price: "Gratis",
          period: "selamanya",
          desc: "Untuk mencoba",
          features: "1 situs\n100 halaman\nSSL otomatis\nSupport email",
          ctaLabel: "Mulai",
          ctaHref: "#",
          featured: "",
        },
        {
          title: "Pro",
          price: "Rp 99.000",
          period: "per bulan",
          desc: "Paling populer",
          features: "Unlimited situs\nUnlimited halaman\nCustom domain\nPriority support\nAdvanced analytics",
          ctaLabel: "Coba Pro",
          ctaHref: "#",
          featured: "yes",
        },
        {
          title: "Business",
          price: "Rp 299.000",
          period: "per bulan",
          desc: "Untuk tim",
          features: "Semua di Pro\n10 anggota tim\nAPI access\nSLA 99.99%\nDedicated manager",
          ctaLabel: "Hubungi Sales",
          ctaHref: "#",
          featured: "",
        },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      {
        name: "items",
        label: "Paket",
        type: "items",
        itemFields: [
          { name: "title", label: "Nama Paket", type: "string" },
          { name: "price", label: "Harga", type: "string" },
          { name: "period", label: "Periode (per bulan)", type: "string" },
          { name: "desc", label: "Tagline", type: "string" },
          { name: "features", label: "Fitur (pisahkan dengan enter)", type: "textarea" },
          { name: "ctaLabel", label: "CTA Label", type: "string" },
          { name: "ctaHref", label: "CTA Link", type: "string" },
          { name: "featured", label: "Featured (yes/kosong)", type: "string" },
        ],
      },
    ],
  },
  {
    type: "FAQ",
    label: "FAQ Accordion ✨",
    category: "marketing",
    emoji: "❓",
    description: "Pertanyaan-jawaban yang bisa di-collapse",
    defaults: {
      title: "Pertanyaan Umum",
      items: [
        {
          question: "Apakah ada uji coba gratis?",
          answer: "Ya, semua fitur Pro bisa dicoba gratis 14 hari tanpa kartu kredit.",
        },
        {
          question: "Bagaimana cara membatalkan langganan?",
          answer: "Cukup buka Settings > Billing, klik Cancel. Berlaku sampai akhir periode tagihan.",
        },
        {
          question: "Apakah data saya aman?",
          answer: "Kami pakai enkripsi end-to-end, daily backup, dan compliance SOC 2 Type II.",
        },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Q & A",
        type: "items",
        itemFields: [
          { name: "question", label: "Pertanyaan", type: "string" },
          { name: "answer", label: "Jawaban", type: "textarea" },
        ],
      },
    ],
  },

  // ---------- Sosial Proof ----------
  {
    type: "Testimonial",
    label: "Testimoni Static",
    category: "sosial",
    emoji: "💬",
    description: "Quote dari pelanggan, layout tetap",
    defaults: {
      items: [{ name: "Nama", text: "Testimoni dari pelanggan." }],
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
    type: "TestimonialMarquee",
    label: "Marquee Testimoni ✨",
    category: "sosial",
    emoji: "🎢",
    description: "Testimoni auto-scroll horizontal infinite",
    defaults: {
      title: "Apa kata mereka",
      items: [
        { name: "Sari, Founder", text: "Platform ini mengubah cara kami bekerja. Setup-nya kurang dari 5 menit." },
        { name: "Doni, Engineer", text: "Fitur dynamic content-nya luar biasa fleksibel." },
        { name: "Rina, Manager", text: "Tim non-teknis kami akhirnya bisa publish sendiri tanpa minta tolong dev." },
        { name: "Agus, CEO", text: "ROI terlihat dalam minggu pertama." },
        { name: "Maya, Designer", text: "Template-nya cantik dan customizable. Editor visual-nya intuitif." },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Testimoni",
        type: "items",
        itemFields: [
          { name: "name", label: "Nama / Role", type: "string" },
          { name: "text", label: "Pesan", type: "textarea" },
        ],
      },
    ],
  },

  // ---------- List ----------
  {
    type: "ProductGrid",
    label: "Grid Produk (statis)",
    category: "list",
    emoji: "🛍️",
    description: "Inline product cards (items)",
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
    category: "list",
    emoji: "💼",
    description: "Showcase project / portfolio",
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
    label: "List Blog (statis)",
    category: "list",
    emoji: "📰",
    description: "Inline blog post list",
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

  // ---------- Dynamic ----------
  {
    type: "ProductGridDynamic",
    label: "Grid Produk (DB)",
    category: "dynamic",
    emoji: "🔄",
    description: "Auto-load dari tab Produk",
    defaults: { title: "Produk Terbaru", limit: 12 },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "limit", label: "Jumlah maks", type: "number" },
    ],
  },
  {
    type: "BlogListDynamic",
    label: "List Blog (DB)",
    category: "dynamic",
    emoji: "🔄",
    description: "Auto-load dari tab Blog",
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

// Group block schemas by category, preserving the order of CATEGORY_LABELS.
export function blockSchemasByCategory(): Array<{
  key: BlockCategory;
  label: string;
  blocks: BlockSchema[];
}> {
  const order: BlockCategory[] = [
    "hero",
    "layout",
    "konten",
    "showcase",
    "marketing",
    "sosial",
    "list",
    "dynamic",
  ];
  return order.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    blocks: blockSchemas.filter((b) => b.category === key),
  }));
}
