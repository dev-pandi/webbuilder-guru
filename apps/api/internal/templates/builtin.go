package templates

// BuiltinTemplate is the in-memory shape used to seed the templates table.
// 5 categories × 3 variants = 15 entries.
type BuiltinTemplate struct {
	Slug        string
	Category    string
	Variant     string
	Name        string
	Description string
	PreviewURL  string
	Theme       map[string]any
	Pages       []map[string]any
}

// Public lists for the dashboard to render the picker.
type CategoryInfo struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Description string `json:"description"`
	Emoji       string `json:"emoji"`
}

type VariantInfo struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

var Categories = []CategoryInfo{
	{Key: "school", Label: "Sekolah", Description: "PAUD, SD, SMP, SMA, atau kampus.", Emoji: "🎓"},
	{Key: "umkm", Label: "UMKM / Jualan", Description: "Toko online sederhana untuk UMKM.", Emoji: "🛍️"},
	{Key: "portfolio", Label: "Portofolio", Description: "Profil personal, project, dan kontak.", Emoji: "💼"},
	{Key: "teacher", Label: "Guru", Description: "Profil guru, jadwal, materi belajar.", Emoji: "👨‍🏫"},
	{Key: "blog", Label: "Blog", Description: "Blog personal atau magazine.", Emoji: "📝"},
}

var Variants = []VariantInfo{
	{Key: "modern", Name: "Modern", Description: "Berani, kontras tinggi, tipografi besar."},
	{Key: "clean", Name: "Clean", Description: "Minimalis, banyak whitespace, fokus konten."},
	{Key: "professional", Name: "Professional", Description: "Formal, terpercaya, tipografi serif klasik."},
}

// variantFontRadius returns the typography + radius profile for a variant.
func variantFontRadius(v string) (heading, body, radius string) {
	switch v {
	case "modern":
		return "Plus Jakarta Sans", "Inter", "1rem"
	case "clean":
		return "Inter", "Inter", "0.375rem"
	case "professional":
		return "Playfair Display", "Inter", "0.25rem"
	}
	return "Inter", "Inter", "0.5rem"
}

// palette returns colors for (category, variant).
func palette(cat, v string) map[string]string {
	type p struct{ primary, secondary, bg, fg string }
	table := map[string]map[string]p{
		"school": {
			"modern":       {"#2563eb", "#06b6d4", "#ffffff", "#0f172a"},
			"clean":        {"#475569", "#94a3b8", "#ffffff", "#1e293b"},
			"professional": {"#1e3a8a", "#047857", "#fafaf9", "#1c1917"},
		},
		"umkm": {
			"modern":       {"#f97316", "#fbbf24", "#fffbf5", "#1f2937"},
			"clean":        {"#10b981", "#6ee7b7", "#ffffff", "#064e3b"},
			"professional": {"#0f766e", "#b45309", "#fafaf9", "#1c1917"},
		},
		"portfolio": {
			"modern":       {"#a855f7", "#ec4899", "#0f172a", "#f8fafc"},
			"clean":        {"#0f172a", "#64748b", "#ffffff", "#0f172a"},
			"professional": {"#1e3a8a", "#0891b2", "#ffffff", "#0f172a"},
		},
		"teacher": {
			"modern":       {"#7c3aed", "#22c55e", "#ffffff", "#111827"},
			"clean":        {"#16a34a", "#84cc16", "#ffffff", "#14532d"},
			"professional": {"#be123c", "#a16207", "#fffbeb", "#1f1209"},
		},
		"blog": {
			"modern":       {"#dc2626", "#ea580c", "#ffffff", "#111827"},
			"clean":        {"#111827", "#6b7280", "#ffffff", "#111827"},
			"professional": {"#1e3a8a", "#b45309", "#fffbf5", "#1c1917"},
		},
	}
	if catMap, ok := table[cat]; ok {
		if px, ok := catMap[v]; ok {
			return map[string]string{
				"primary":   px.primary,
				"secondary": px.secondary,
				"bg":        px.bg,
				"fg":        px.fg,
			}
		}
	}
	return map[string]string{"primary": "#2563eb", "secondary": "#0ea5e9", "bg": "#ffffff", "fg": "#0f172a"}
}

func buildTheme(cat, v string) map[string]any {
	heading, body, radius := variantFontRadius(v)
	return map[string]any{
		"colors": palette(cat, v),
		"font":   map[string]any{"heading": heading, "body": body},
		"radius": radius,
	}
}

// variantCopy supplies small textual tweaks so the same page tree
// reads slightly differently across variants. Keeps things DRY without
// duplicating entire page trees.
type variantCopy struct {
	CTA  string // primary CTA label
	Tone string // short adjective for hero subtitle
}

func copyFor(v string) variantCopy {
	switch v {
	case "modern":
		return variantCopy{CTA: "Mulai Sekarang", Tone: "modern, dinamis, dan siap berkembang"}
	case "clean":
		return variantCopy{CTA: "Pelajari Lebih Lanjut", Tone: "rapi, mudah dipahami, dan fokus"}
	case "professional":
		return variantCopy{CTA: "Hubungi Kami", Tone: "tepercaya, profesional, dan berpengalaman"}
	}
	return variantCopy{CTA: "Mulai", Tone: ""}
}

// BuiltinTemplates returns all 15 templates by combining each category with each variant.
func BuiltinTemplates() []BuiltinTemplate {
	out := make([]BuiltinTemplate, 0, len(Categories)*len(Variants))
	for _, c := range Categories {
		for _, v := range Variants {
			out = append(out, BuiltinTemplate{
				Slug:        c.Key + "-" + v.Key,
				Category:    c.Key,
				Variant:     v.Key,
				Name:        c.Label + " — " + v.Name,
				Description: v.Description,
				Theme:       buildTheme(c.Key, v.Key),
				Pages:       buildPages(c.Key, v.Key),
			})
		}
	}
	return out
}

// buildPages dispatches to per-category page builders. Pages share the same
// structure across variants of one category — only copy tone changes via copyFor.
func buildPages(cat, variant string) []map[string]any {
	cv := copyFor(variant)
	switch cat {
	case "school":
		return schoolPages(cv)
	case "umkm":
		return umkmPages(cv)
	case "portfolio":
		return portfolioPages(cv)
	case "teacher":
		return teacherPages(cv)
	case "blog":
		return blogPages(cv)
	}
	return nil
}

// --- helper for page tree shorthand ---

func block(typ string, props map[string]any) map[string]any {
	return map[string]any{"type": typ, "props": props}
}

func page(slug, title string, isHome bool, seo map[string]any, blocks []map[string]any) map[string]any {
	if seo == nil {
		seo = map[string]any{}
	}
	return map[string]any{
		"slug":    slug,
		"title":   title,
		"is_home": isHome,
		"seo":     seo,
		"tree":    map[string]any{"blocks": blocks},
	}
}

// ---------------- Sekolah ----------------

func schoolPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Beranda", "href": "/"},
		{"label": "Profil", "href": "/profil"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Sekolah ABC", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Sekolah ABC"})

	home := page("home", "Beranda", true,
		map[string]any{"title": "Sekolah ABC — Beranda", "description": "Mendidik generasi unggul dan berkarakter."},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Mendidik Generasi Unggul, Berkarakter, dan Berprestasi",
				"subtitle": "Sekolah yang " + cv.Tone + ". Lingkungan belajar yang aman, inspiratif, dan adaptif.",
				"ctaLabel": cv.CTA, "ctaHref": "#daftar",
			}),
			block("FeatureList", map[string]any{
				"title": "Mengapa Memilih Kami",
				"items": []map[string]any{
					{"title": "Kurikulum Modern", "desc": "Berbasis projek dan literasi digital."},
					{"title": "Guru Berpengalaman", "desc": "Tenaga pendidik tersertifikasi."},
					{"title": "Fasilitas Lengkap", "desc": "Lab, perpustakaan, dan lapangan olahraga."},
				},
			}),
			block("Section", map[string]any{
				"title": "Pengumuman Terbaru",
				"body":  "Pendaftaran siswa baru tahun ajaran 2025/2026 telah dibuka. Daftarkan diri Anda sekarang.",
			}),
			footer,
		},
	)

	profil := page("profil", "Profil", false,
		map[string]any{"title": "Profil Sekolah ABC", "description": "Visi, misi, dan sejarah sekolah."},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Profil Sekolah", "level": 1}),
			block("Text", map[string]any{
				"body": "Sekolah ABC berdiri sejak 1995 dengan visi mencetak siswa yang unggul dalam akademik dan karakter. " +
					"Kami berkomitmen pada pendidikan yang " + cv.Tone + ".",
			}),
			block("FeatureList", map[string]any{
				"title": "Nilai Kami",
				"items": []map[string]any{
					{"title": "Integritas", "desc": "Jujur dalam setiap tindakan."},
					{"title": "Inovasi", "desc": "Selalu mencari cara lebih baik."},
					{"title": "Inklusi", "desc": "Pendidikan untuk semua."},
				},
			}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak Sekolah ABC"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Hubungi Kami", "level": 1}),
			block("Text", map[string]any{"body": "Alamat: Jl. Pendidikan No. 1\nEmail: info@sekolahabc.sch.id\nTelp: (021) 1234-5678"}),
			footer,
		},
	)

	return []map[string]any{home, profil, kontak}
}

// ---------------- UMKM ----------------

func umkmPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Beranda", "href": "/"},
		{"label": "Produk", "href": "/produk"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Toko Bahagia", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Toko Bahagia"})

	home := page("home", "Beranda", true,
		map[string]any{"title": "Toko Bahagia — Produk Terbaik", "description": "Toko UMKM dengan produk berkualitas."},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Produk UMKM Berkualitas, Harga Bersahabat",
				"subtitle": "Belanja praktis lewat WhatsApp. " + cv.Tone + ".",
				"ctaLabel": cv.CTA, "ctaHref": "https://wa.me/6281234567890",
			}),
			block("ProductGrid", map[string]any{
				"title": "Best Seller",
				"items": []map[string]any{
					{"name": "Keripik Singkong", "price": "Rp 15.000", "image": ""},
					{"name": "Kopi Bubuk 250g", "price": "Rp 45.000", "image": ""},
					{"name": "Sambal Botol", "price": "Rp 25.000", "image": ""},
				},
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Sari", "text": "Rasanya enak banget, pengiriman cepat."},
					{"name": "Budi", "text": "Sudah langganan 6 bulan, kualitas konsisten."},
				},
			}),
			footer,
		},
	)

	produk := page("produk", "Produk", false,
		map[string]any{"title": "Katalog Produk", "description": "Semua produk Toko Bahagia."},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Katalog Produk", "level": 1}),
			block("ProductGrid", map[string]any{"items": []map[string]any{}}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Hubungi Toko Bahagia"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Kontak", "level": 1}),
			block("Text", map[string]any{"body": "WhatsApp: 0812-3456-7890\nInstagram: @tokobahagia\nEmail: halo@tokobahagia.id"}),
			footer,
		},
	)
	return []map[string]any{home, produk, kontak}
}

// ---------------- Portofolio ----------------

func portfolioPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Project", "href": "/project"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Nama Saya", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Nama Saya"})

	home := page("home", "Beranda", true,
		map[string]any{"title": "Nama Saya — Portfolio"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Halo, saya Nama Saya — Web Developer",
				"subtitle": "Saya membangun aplikasi web yang " + cv.Tone + ".",
				"ctaLabel": cv.CTA, "ctaHref": "/project",
			}),
			block("FeatureList", map[string]any{
				"title": "Skill Utama",
				"items": []map[string]any{
					{"title": "Frontend", "desc": "React, Next.js, Tailwind"},
					{"title": "Backend", "desc": "Go, Node.js, PostgreSQL"},
					{"title": "DevOps", "desc": "Docker, CI/CD, Kubernetes"},
				},
			}),
			footer,
		},
	)

	project := page("project", "Project", false,
		map[string]any{"title": "Project Saya"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Project", "level": 1}),
			block("ProjectGrid", map[string]any{
				"title": "",
				"items": []map[string]any{
					{"name": "Project A", "desc": "E-commerce platform untuk UMKM.", "href": "#"},
					{"name": "Project B", "desc": "Dashboard analytics realtime.", "href": "#"},
					{"name": "Project C", "desc": "Mobile app untuk siswa.", "href": "#"},
				},
			}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Hubungi Saya", "level": 1}),
			block("Text", map[string]any{"body": "Email: hello@namasaya.com\nLinkedIn: linkedin.com/in/namasaya\nGitHub: github.com/namasaya"}),
			footer,
		},
	)
	return []map[string]any{home, project, kontak}
}

// ---------------- Guru ----------------

func teacherPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Materi", "href": "/materi"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Pak Budi", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Pak Budi"})

	home := page("home", "Beranda", true,
		map[string]any{"title": "Pak Budi — Guru Matematika"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Pak Budi — Guru Matematika SMA",
				"subtitle": "Belajar matematika dengan cara yang " + cv.Tone + ".",
				"ctaLabel": cv.CTA, "ctaHref": "/materi",
			}),
			block("FeatureList", map[string]any{
				"title": "Yang Akan Anda Pelajari",
				"items": []map[string]any{
					{"title": "Aljabar", "desc": "Dari dasar hingga olimpiade."},
					{"title": "Kalkulus", "desc": "Konsep + latihan soal."},
					{"title": "Statistika", "desc": "Aplikasi di kehidupan nyata."},
				},
			}),
			footer,
		},
	)

	materi := page("materi", "Materi", false,
		map[string]any{"title": "Materi Belajar"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Materi Belajar", "level": 1}),
			block("Text", map[string]any{"body": "Unduh materi terbaru, lengkap dengan latihan soal dan pembahasan."}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak Pak Budi"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Kontak", "level": 1}),
			block("Text", map[string]any{"body": "Email: budi@guru.id\nWhatsApp: 0812-0000-0000"}),
			footer,
		},
	)
	return []map[string]any{home, materi, kontak}
}

// ---------------- Blog ----------------

func blogPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Artikel", "href": "/artikel"},
		{"label": "Tentang", "href": "/tentang"},
	}
	nav := block("Navbar", map[string]any{"brand": "Blog Saya", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Blog Saya"})

	home := page("home", "Beranda", true,
		map[string]any{"title": "Blog Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Tulisan Tentang Teknologi & Kehidupan",
				"subtitle": "Diperbarui setiap minggu — " + cv.Tone + ".",
				"ctaLabel": cv.CTA, "ctaHref": "/artikel",
			}),
			block("BlogList", map[string]any{
				"items": []map[string]any{
					{"title": "Memulai Next.js", "excerpt": "Panduan singkat untuk pemula yang ingin membangun aplikasi web modern.", "href": "#"},
					{"title": "Tips Produktivitas", "excerpt": "Lima kebiasaan yang membantu saya menyelesaikan lebih banyak hal.", "href": "#"},
					{"title": "Belajar Go dalam 30 Hari", "excerpt": "Apa yang saya pelajari setelah satu bulan menulis Go setiap hari.", "href": "#"},
				},
			}),
			footer,
		},
	)

	artikel := page("artikel", "Artikel", false,
		map[string]any{"title": "Semua Artikel"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Semua Artikel", "level": 1}),
			block("BlogList", map[string]any{"items": []map[string]any{}}),
			footer,
		},
	)

	tentang := page("tentang", "Tentang", false,
		map[string]any{"title": "Tentang Penulis"},
		[]map[string]any{
			nav,
			block("Heading", map[string]any{"text": "Tentang Saya", "level": 1}),
			block("Text", map[string]any{"body": "Saya menulis tentang teknologi dan kehidupan sehari-hari. Senang berbagi pengalaman dan belajar bersama."}),
			footer,
		},
	)
	return []map[string]any{home, artikel, tentang}
}
