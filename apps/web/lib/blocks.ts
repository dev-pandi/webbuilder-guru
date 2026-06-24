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
  | "media"
  | "list"
  | "dynamic";

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  layout: "Layout",
  hero: "Hero",
  konten: "Konten",
  showcase: "Showcase",
  marketing: "Marketing",
  sosial: "Sosial Proof",
  media: "Media",
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

  // =================== NEW BLOCKS ===================

  // ---------- Hero ----------
  {
    type: "HeroSplit",
    label: "Hero Split ✨",
    category: "hero",
    emoji: "↔️",
    description: "Hero teks kiri + gambar kanan",
    defaults: {
      eyebrow: "Baru!",
      title: "Bangun website profesional dalam hitungan menit",
      subtitle:
        "Editor visual yang powerful dengan ratusan template siap pakai. Tidak perlu coding, hasilnya tetap profesional.",
      ctaLabel: "Mulai Gratis",
      ctaHref: "#",
      ctaSecondaryLabel: "Lihat Demo",
      ctaSecondaryHref: "#",
      image: "",
      reversed: "",
    },
    fields: [
      { name: "eyebrow", label: "Eyebrow", type: "string" },
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      { name: "ctaLabel", label: "CTA Utama", type: "string" },
      { name: "ctaHref", label: "CTA Utama Link", type: "string" },
      { name: "ctaSecondaryLabel", label: "CTA Sekunder", type: "string" },
      { name: "ctaSecondaryHref", label: "CTA Sekunder Link", type: "string" },
      { name: "image", label: "Gambar", type: "image" },
      { name: "reversed", label: "Gambar di kiri? (yes/kosong)", type: "string" },
    ],
  },

  // ---------- Layout ----------
  {
    type: "Banner",
    label: "Promo Banner ✨",
    category: "layout",
    emoji: "🎀",
    description: "Strip pengumuman/promo tipis di atas halaman",
    defaults: {
      text: "🎉 Diskon 30% untuk minggu ini saja!",
      ctaLabel: "Pakai sekarang →",
      ctaHref: "#",
    },
    fields: [
      { name: "text", label: "Teks", type: "string" },
      { name: "ctaLabel", label: "CTA Label", type: "string" },
      { name: "ctaHref", label: "CTA Link", type: "string" },
    ],
  },
  {
    type: "Divider",
    label: "Divider",
    category: "layout",
    emoji: "➖",
    description: "Garis pembatas horizontal dengan label opsional",
    defaults: { label: "" },
    fields: [
      { name: "label", label: "Label di tengah (opsional)", type: "string" },
    ],
  },
  {
    type: "Spacer",
    label: "Spacer",
    category: "layout",
    emoji: "⬜",
    description: "Spasi vertikal kosong",
    defaults: { size: 64 },
    fields: [{ name: "size", label: "Tinggi (px)", type: "number" }],
  },

  // ---------- Konten ----------
  {
    type: "Quote",
    label: "Pull Quote ✨",
    category: "konten",
    emoji: "❝",
    description: "Quote besar dengan attribution",
    defaults: {
      text: "Tujuan terbaik bukan tentang menjadi sempurna, tapi tentang menjadi nyata dan terhubung dengan pelanggan kita.",
      author: "Sari Wijaya",
      role: "Founder, TokoBahagia",
    },
    fields: [
      { name: "text", label: "Quote", type: "textarea" },
      { name: "author", label: "Penulis", type: "string" },
      { name: "role", label: "Peran/Jabatan", type: "string" },
    ],
  },
  {
    type: "Alert",
    label: "Alert / Callout ✨",
    category: "konten",
    emoji: "💡",
    description: "Box info/warning/success/danger",
    defaults: {
      variant: "info",
      title: "Penting untuk diketahui",
      body: "Ini adalah informasi penting yang perlu diperhatikan pembaca.",
    },
    fields: [
      {
        name: "variant",
        label: "Tipe (info/success/warning/danger)",
        type: "string",
      },
      { name: "title", label: "Judul", type: "string" },
      { name: "body", label: "Isi", type: "textarea" },
    ],
  },

  // ---------- Showcase ----------
  {
    type: "FeatureSide",
    label: "Feature dengan Gambar ✨",
    category: "showcase",
    emoji: "🖼️",
    description: "Fitur + gambar berselang-seling kiri-kanan",
    defaults: {
      items: [
        {
          title: "Editor visual yang mudah",
          desc: "Drag-and-drop block siap pakai dengan preview real-time. Tidak perlu pengetahuan teknis sama sekali.",
          image: "",
        },
        {
          title: "Custom domain + SSL otomatis",
          desc: "Pakai domain Anda sendiri. SSL diurus otomatis lewat Caddy on-demand TLS.",
          image: "",
        },
        {
          title: "Export ke HTML/CSS/JS",
          desc: "Unduh hasil sebagai file statis. Hosting di mana saja: Netlify, Vercel, atau server sendiri.",
          image: "",
        },
      ],
    },
    fields: [
      {
        name: "items",
        label: "Fitur",
        type: "items",
        itemFields: [
          { name: "title", label: "Judul", type: "string" },
          { name: "desc", label: "Deskripsi", type: "textarea" },
          { name: "image", label: "Gambar", type: "image" },
        ],
      },
    ],
  },
  {
    type: "Timeline",
    label: "Timeline ✨",
    category: "showcase",
    emoji: "📅",
    description: "Garis waktu peristiwa vertikal",
    defaults: {
      title: "Perjalanan Kami",
      items: [
        {
          date: "2020",
          title: "Awal Mula",
          desc: "Ide pertama lahir di kantor kecil dengan 3 orang tim.",
        },
        {
          date: "2022",
          title: "1.000 Pelanggan",
          desc: "Milestone pertama tercapai. Tim berkembang ke 15 orang.",
        },
        {
          date: "2024",
          title: "Ekspansi Nasional",
          desc: "Buka kantor di 3 kota: Jakarta, Bandung, Surabaya.",
        },
        {
          date: "2025",
          title: "Go Global",
          desc: "Launch produk di pasar Asia Tenggara.",
        },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Event",
        type: "items",
        itemFields: [
          { name: "date", label: "Tanggal/Tahun", type: "string" },
          { name: "title", label: "Judul", type: "string" },
          { name: "desc", label: "Deskripsi", type: "textarea" },
        ],
      },
    ],
  },
  {
    type: "ProcessSteps",
    label: "Process Steps ✨",
    category: "showcase",
    emoji: "🪜",
    description: "Langkah-langkah proses bernomor",
    defaults: {
      title: "Cara Kerjanya",
      subtitle: "Mulai dalam 3 langkah sederhana.",
      items: [
        {
          title: "Daftar akun",
          desc: "Buat akun gratis dalam 30 detik dengan email Anda.",
        },
        {
          title: "Pilih template",
          desc: "Pilih dari 15 template profesional siap pakai.",
        },
        {
          title: "Publikasikan",
          desc: "Klik publish dan situs Anda langsung live.",
        },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      {
        name: "items",
        label: "Langkah",
        type: "items",
        itemFields: [
          { name: "title", label: "Judul", type: "string" },
          { name: "desc", label: "Deskripsi", type: "textarea" },
        ],
      },
    ],
  },
  {
    type: "TeamGrid",
    label: "Team Grid ✨",
    category: "showcase",
    emoji: "👥",
    description: "Grid anggota tim dengan foto + peran",
    defaults: {
      title: "Tim Kami",
      subtitle: "Orang-orang luar biasa di balik produk ini.",
      items: [
        { name: "Andi Pratama", role: "CEO & Founder", image: "" },
        { name: "Sari Wijaya", role: "CTO", image: "" },
        { name: "Budi Santoso", role: "Head of Design", image: "" },
        { name: "Rini Wijaya", role: "Head of Marketing", image: "" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      {
        name: "items",
        label: "Anggota",
        type: "items",
        itemFields: [
          { name: "name", label: "Nama", type: "string" },
          { name: "role", label: "Peran", type: "string" },
          { name: "image", label: "Foto", type: "image" },
        ],
      },
    ],
  },
  {
    type: "IconList",
    label: "Icon List ✨",
    category: "showcase",
    emoji: "✅",
    description: "List teks dengan emoji/icon di depan",
    defaults: {
      title: "Yang Anda dapatkan",
      items: [
        { icon: "✓", text: "Gratis 14 hari, tanpa kartu kredit" },
        { icon: "✓", text: "Unlimited halaman & block" },
        { icon: "✓", text: "Custom domain + SSL otomatis" },
        { icon: "✓", text: "Support email 24/7" },
        { icon: "✓", text: "Export ke HTML/CSS/JS" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Item",
        type: "items",
        itemFields: [
          { name: "icon", label: "Emoji/Icon", type: "string" },
          { name: "text", label: "Teks", type: "string" },
        ],
      },
    ],
  },
  {
    type: "StatsCard",
    label: "Stats Card ✨",
    category: "showcase",
    emoji: "🎯",
    description: "Satu angka prominent dengan deskripsi",
    defaults: {
      value: "98%",
      label: "Pelanggan puas",
      desc: "Berdasarkan survei akhir tahun 2024 ke lebih dari 1.000 pelanggan aktif. Rating ini stabil selama 3 tahun terakhir.",
    },
    fields: [
      { name: "value", label: "Angka prominent", type: "string" },
      { name: "label", label: "Label", type: "string" },
      { name: "desc", label: "Deskripsi", type: "textarea" },
    ],
  },

  // ---------- Media ----------
  {
    type: "VideoEmbed",
    label: "Video Embed ✨",
    category: "media",
    emoji: "🎬",
    description: "Embed video YouTube atau Vimeo",
    defaults: {
      title: "Lihat Demonya",
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "src",
        label: "URL Embed (youtube.com/embed/... atau player.vimeo.com/...)",
        type: "string",
      },
    ],
  },
  {
    type: "Map",
    label: "Map Embed ✨",
    category: "media",
    emoji: "🗺️",
    description: "Peta lokasi (Google Maps iframe URL)",
    defaults: {
      title: "Lokasi Kami",
      src: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3966.288!2d106.8228!3d-6.2088!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1",
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "src", label: "URL Embed Maps", type: "string" },
    ],
  },
  {
    type: "Gallery",
    label: "Image Gallery ✨",
    category: "media",
    emoji: "🖼️",
    description: "Galeri gambar grid responsive",
    defaults: {
      title: "Galeri",
      items: [
        { image: "", caption: "Foto 1" },
        { image: "", caption: "Foto 2" },
        { image: "", caption: "Foto 3" },
        { image: "", caption: "Foto 4" },
        { image: "", caption: "Foto 5" },
        { image: "", caption: "Foto 6" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Gambar",
        type: "items",
        itemFields: [
          { name: "image", label: "Gambar", type: "image" },
          { name: "caption", label: "Caption", type: "string" },
        ],
      },
    ],
  },
  {
    type: "SocialLinks",
    label: "Social Links ✨",
    category: "media",
    emoji: "🔗",
    description: "Row link sosial media dengan icon",
    defaults: {
      title: "Ikuti kami",
      items: [
        { platform: "Instagram", href: "https://instagram.com/example" },
        { platform: "Twitter", href: "https://twitter.com/example" },
        { platform: "Facebook", href: "https://facebook.com/example" },
        { platform: "LinkedIn", href: "https://linkedin.com/in/example" },
        { platform: "YouTube", href: "https://youtube.com/@example" },
      ],
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      {
        name: "items",
        label: "Platform",
        type: "items",
        itemFields: [
          {
            name: "platform",
            label:
              "Platform (Instagram/Twitter/Facebook/LinkedIn/YouTube/TikTok/GitHub/Email/WhatsApp)",
            type: "string",
          },
          { name: "href", label: "URL", type: "string" },
        ],
      },
    ],
  },

  // ---------- Marketing ----------
  {
    type: "Newsletter",
    label: "Newsletter Signup ✨",
    category: "marketing",
    emoji: "📧",
    description: "Form sederhana email signup",
    defaults: {
      title: "Tetap update",
      subtitle:
        "Subscribe newsletter mingguan kami untuk tips, tutorial, dan update produk langsung ke inbox.",
      placeholder: "nama@email.com",
      ctaLabel: "Subscribe",
      action: "mailto:contact@example.com",
      note: "Tanpa spam. Unsubscribe kapan saja.",
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      { name: "placeholder", label: "Placeholder input", type: "string" },
      { name: "ctaLabel", label: "Tombol Label", type: "string" },
      { name: "action", label: "Form action (URL/mailto)", type: "string" },
      { name: "note", label: "Catatan kecil di bawah", type: "string" },
    ],
  },
  {
    type: "ContactForm",
    label: "Contact Form ✨",
    category: "marketing",
    emoji: "📨",
    description: "Form kontak (nama, email, pesan)",
    defaults: {
      title: "Kontak Kami",
      subtitle: "Kami akan reply dalam 24 jam.",
      ctaLabel: "Kirim Pesan",
      action: "mailto:contact@example.com",
    },
    fields: [
      { name: "title", label: "Judul", type: "string" },
      { name: "subtitle", label: "Subjudul", type: "textarea" },
      { name: "ctaLabel", label: "Tombol Label", type: "string" },
      { name: "action", label: "Form action (URL/mailto)", type: "string" },
    ],
  },
  {
    type: "Tabs",
    label: "Tabs (CSS-only) ✨",
    category: "marketing",
    emoji: "📑",
    description: "Konten dalam tab interaktif, max 4 tab",
    defaults: {
      items: [
        {
          label: "Fitur",
          body: "Editor visual lengkap dengan 40+ block siap pakai. Drag, drop, dan publish — semudah itu.",
        },
        {
          label: "Harga",
          body: "Mulai gratis selamanya. Upgrade ke Pro mulai Rp 99rb/bulan untuk fitur advanced.",
        },
        {
          label: "FAQ",
          body: "Pertanyaan yang sering ditanyakan tentang produk, billing, dan support.",
        },
      ],
    },
    fields: [
      {
        name: "items",
        label: "Tab",
        type: "items",
        itemFields: [
          { name: "label", label: "Label Tab", type: "string" },
          { name: "body", label: "Isi Tab", type: "textarea" },
        ],
      },
    ],
  },

  // ---------- Sosial ----------
  {
    type: "TestimonialCard",
    label: "Testimoni Big Card ✨",
    category: "sosial",
    emoji: "💎",
    description: "Single testimoni format hero card prominent",
    defaults: {
      quote:
        "Platform ini benar-benar mengubah cara saya membangun website untuk klien. Yang dulunya makan waktu seminggu, sekarang selesai dalam 1 jam. Tampilannya pun jauh lebih profesional.",
      name: "Sari Wijaya",
      role: "Founder, TokoBahagia",
      avatar: "",
      rating: 5,
    },
    fields: [
      { name: "quote", label: "Quote", type: "textarea" },
      { name: "name", label: "Nama", type: "string" },
      { name: "role", label: "Peran/Jabatan", type: "string" },
      { name: "avatar", label: "Foto", type: "image" },
      { name: "rating", label: "Rating (0-5)", type: "number" },
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
    "media",
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
