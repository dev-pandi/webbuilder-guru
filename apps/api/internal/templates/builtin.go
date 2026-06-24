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
		{"label": "Program", "href": "/program"},
		{"label": "Galeri", "href": "/galeri"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Sekolah ABC", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Sekolah ABC — Mendidik Generasi Berkarakter"})

	home := page("home", "Beranda", true,
		map[string]any{
			"title":       "Sekolah ABC — Mendidik Generasi Unggul & Berkarakter",
			"description": "Sekolah dengan kurikulum modern, guru berpengalaman, dan fasilitas lengkap. PPDB 2025/2026 sudah dibuka.",
		},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Mendidik Generasi Unggul, Berkarakter, dan Berprestasi",
				"subtitle": "Sekolah yang " + cv.Tone + ". Lingkungan belajar yang aman, inspiratif, dan adaptif untuk masa depan terbaik anak Anda.",
				"ctaLabel": "Daftar PPDB Sekarang", "ctaHref": "#daftar",
			}),
			block("FeatureList", map[string]any{
				"title": "Mengapa Memilih Kami",
				"items": []map[string]any{
					{"title": "Kurikulum Modern", "desc": "Berbasis projek, literasi digital, dan pengembangan karakter sesuai standar Kurikulum Merdeka."},
					{"title": "Guru Berpengalaman", "desc": "100% tenaga pendidik bersertifikat dengan rata-rata pengalaman mengajar 10 tahun."},
					{"title": "Fasilitas Lengkap", "desc": "Lab komputer, lab sains, perpustakaan modern, lapangan olahraga, dan ruang kelas ber-AC."},
					{"title": "Lokasi Strategis", "desc": "Mudah diakses dari berbagai arah, dilengkapi area parkir dan jalur antar-jemput."},
					{"title": "Ekstrakurikuler", "desc": "Lebih dari 15 pilihan: robotika, paskibra, futsal, paduan suara, dan banyak lagi."},
					{"title": "Lulusan Berprestasi", "desc": "85% alumni diterima di universitas top dalam dan luar negeri."},
				},
			}),
			block("FeatureList", map[string]any{
				"title": "Program Unggulan",
				"items": []map[string]any{
					{"title": "Kelas Reguler", "desc": "Kurikulum nasional dengan tambahan pembelajaran bahasa Inggris dan coding."},
					{"title": "Kelas Bilingual", "desc": "Pembelajaran dalam bahasa Indonesia dan Inggris untuk persiapan global."},
					{"title": "Kelas Akselerasi", "desc": "Program percepatan untuk siswa berbakat istimewa."},
				},
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Ibu Sari, Orang Tua Murid", "text": "Anak saya berkembang pesat sejak masuk Sekolah ABC. Gurunya sangat sabar dan komunikasi dengan orang tua sangat baik."},
					{"name": "Andi, Alumni 2022", "text": "Sekolah yang membentuk karakter dan menyiapkan saya menghadapi dunia kuliah. Sangat berkesan."},
				},
			}),
			block("Section", map[string]any{
				"title": "📢 Pengumuman PPDB Tahun Ajaran 2025/2026",
				"body":  "Pendaftaran siswa baru telah dibuka 1 Januari – 31 Maret 2025.\nGelombang 1: hingga 31 Januari (diskon biaya pendaftaran 20%).\nGelombang 2: 1 Februari – 31 Maret.\n\nKuota terbatas — daftarkan putra-putri Anda sekarang!",
			}),
			footer,
		},
	)

	profil := page("profil", "Profil", false,
		map[string]any{"title": "Profil Sekolah ABC", "description": "Visi, misi, dan sejarah sekolah."},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Profil Sekolah ABC",
				"subtitle": "Berdiri sejak 1995, melayani generasi muda dengan dedikasi penuh.",
			}),
			block("Section", map[string]any{
				"title": "Sejarah Singkat",
				"body":  "Sekolah ABC didirikan pada tahun 1995 oleh sekelompok pendidik yang memiliki visi mencetak generasi muda yang " + cv.Tone + ". Berawal dari satu gedung sederhana dengan 60 siswa, kini Sekolah ABC telah berkembang menjadi institusi pendidikan terpercaya dengan lebih dari 800 siswa aktif.",
			}),
			block("FeatureList", map[string]any{
				"title": "Visi & Misi",
				"items": []map[string]any{
					{"title": "🎯 Visi", "desc": "Menjadi sekolah unggulan yang menghasilkan generasi cerdas, berkarakter, dan siap menghadapi tantangan global."},
					{"title": "✨ Misi 1", "desc": "Menyelenggarakan pendidikan berkualitas dengan kurikulum berstandar internasional."},
					{"title": "🤝 Misi 2", "desc": "Menanamkan nilai-nilai moral, etika, dan budaya Indonesia."},
					{"title": "🌱 Misi 3", "desc": "Mengembangkan potensi setiap siswa secara individual dan berkelanjutan."},
				},
			}),
			block("FeatureList", map[string]any{
				"title": "Nilai-Nilai Kami",
				"items": []map[string]any{
					{"title": "Integritas", "desc": "Jujur dan bertanggung jawab dalam setiap tindakan."},
					{"title": "Inovasi", "desc": "Selalu mencari cara yang lebih baik untuk belajar dan mengajar."},
					{"title": "Inklusi", "desc": "Pendidikan untuk semua tanpa memandang latar belakang."},
					{"title": "Kolaborasi", "desc": "Bekerja sama membangun komunitas belajar yang positif."},
				},
			}),
			block("Section", map[string]any{
				"title": "Tim Kepemimpinan",
				"body":  "Dr. Ahmad Wijaya, M.Pd. — Kepala Sekolah (sejak 2018)\nIbu Siti Nurhaliza, S.Pd. — Wakil Kepala Bidang Akademik\nBapak Joko Susilo, M.Si. — Wakil Kepala Bidang Kesiswaan\n\nTim kami terdiri dari 45 guru tetap dan 12 staf pendukung yang berdedikasi.",
			}),
			footer,
		},
	)

	program := page("program", "Program", false,
		map[string]any{"title": "Program Akademik — Sekolah ABC"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Program Akademik Unggulan",
				"subtitle": "Program pendidikan yang dirancang untuk mengembangkan potensi maksimal setiap siswa.",
			}),
			block("FeatureList", map[string]any{
				"title": "Tingkat Pendidikan",
				"items": []map[string]any{
					{"title": "TK / PAUD", "desc": "Usia 3-6 tahun. Fokus pada motorik, sosialisasi, dan pengenalan dasar membaca-berhitung melalui bermain."},
					{"title": "SD", "desc": "Kelas 1-6. Pondasi akademik kuat dengan pendekatan tematik dan integratif sesuai Kurikulum Merdeka."},
					{"title": "SMP", "desc": "Kelas 7-9. Pendalaman materi dengan tambahan kelas bahasa Inggris, coding, dan ekstrakurikuler pilihan."},
				},
			}),
			block("Section", map[string]any{
				"title": "Kurikulum",
				"body":  "Kami menggunakan Kurikulum Merdeka dengan adaptasi internasional. Setiap mata pelajaran ditujukan untuk mengembangkan 6 dimensi Pelajar Pancasila: beriman, berkebinekaan global, bergotong-royong, mandiri, bernalar kritis, dan kreatif.",
			}),
			block("FeatureList", map[string]any{
				"title": "Mata Pelajaran Unggulan",
				"items": []map[string]any{
					{"title": "Bahasa Inggris", "desc": "5 jam/minggu dengan native speaker untuk kelas tertentu."},
					{"title": "Coding & Robotika", "desc": "Pengenalan logika pemrograman dari kelas 4 SD."},
					{"title": "Karakter & Kepemimpinan", "desc": "Program khusus untuk membangun soft skill siswa."},
					{"title": "Seni & Olahraga", "desc": "Eksplorasi minat lewat 15+ pilihan ekskul."},
				},
			}),
			block("FeatureList", map[string]any{
				"title": "Ekstrakurikuler",
				"items": []map[string]any{
					{"title": "🤖 Robotika", "desc": "Kompetisi tahunan tingkat nasional."},
					{"title": "⚽ Futsal & Basket", "desc": "Latihan rutin + pertandingan persahabatan."},
					{"title": "🎵 Paduan Suara", "desc": "Tampil di acara sekolah dan kompetisi."},
					{"title": "📚 Pramuka", "desc": "Wajib untuk kelas 4-9, membangun karakter."},
					{"title": "🎨 Seni Lukis", "desc": "Eksplorasi kreativitas dan ekspresi diri."},
					{"title": "🏆 Olimpiade", "desc": "Pembinaan untuk Mat, IPA, IPS, dan Bahasa."},
				},
			}),
			footer,
		},
	)

	galeri := page("galeri", "Galeri", false,
		map[string]any{"title": "Galeri Kegiatan — Sekolah ABC"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Galeri Kegiatan Sekolah",
				"subtitle": "Momen-momen berharga dari kegiatan belajar, ekstrakurikuler, dan kebersamaan di Sekolah ABC.",
			}),
			block("ProductGrid", map[string]any{
				"title": "Kegiatan Terbaru",
				"items": []map[string]any{
					{"name": "Hari Kemerdekaan 2024", "price": "17 Agustus 2024", "image": ""},
					{"name": "Pentas Seni", "price": "Desember 2024", "image": ""},
					{"name": "Field Trip ke Museum", "price": "November 2024", "image": ""},
					{"name": "Olimpiade Matematika", "price": "Oktober 2024", "image": ""},
					{"name": "Wisuda Kelas 6", "price": "Juni 2024", "image": ""},
					{"name": "Acara Perpisahan", "price": "Juni 2024", "image": ""},
				},
			}),
			block("Section", map[string]any{
				"title": "Ingin Mengunjungi Sekolah?",
				"body":  "Kami terbuka untuk kunjungan calon orang tua siswa. Hubungi kami untuk mengatur jadwal tour sekolah dan bertemu langsung dengan kepala sekolah serta guru.",
			}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak Sekolah ABC", "description": "Alamat, telepon, email, dan jam operasional."},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Hubungi Kami",
				"subtitle": "Kami siap menjawab pertanyaan tentang pendaftaran, kurikulum, atau hal lainnya.",
			}),
			block("FeatureList", map[string]any{
				"title": "Informasi Kontak",
				"items": []map[string]any{
					{"title": "📍 Alamat", "desc": "Jl. Pendidikan No. 1, Kelurahan Maju, Kecamatan Sejahtera, Kota Bahagia 12345"},
					{"title": "📞 Telepon", "desc": "(021) 1234-5678 / WhatsApp: 0812-3456-7890"},
					{"title": "✉ Email", "desc": "info@sekolahabc.sch.id\nppdb@sekolahabc.sch.id"},
					{"title": "🕒 Jam Operasional", "desc": "Senin – Jumat: 07.00 – 16.00\nSabtu: 08.00 – 12.00"},
					{"title": "🚌 Akses", "desc": "Dekat dengan halte Trans, ada area parkir luas, dan layanan antar-jemput."},
					{"title": "🌐 Media Sosial", "desc": "Instagram: @sekolahabc.official\nFacebook: SekolahABCOfficial"},
				},
			}),
			block("Section", map[string]any{
				"title": "Pertanyaan Umum (FAQ)",
				"body":  "Apa syarat pendaftaran? Cek halaman PPDB untuk detail lengkap atau hubungi kami langsung.\nBerapa biaya pendaftaran? Variasi sesuai jenjang. Hubungi kami untuk brosur biaya.\nApakah ada beasiswa? Ya, kami menyediakan beasiswa prestasi dan beasiswa kurang mampu. Tanyakan detailnya ke admin.",
			}),
			footer,
		},
	)

	return []map[string]any{home, profil, program, galeri, kontak}
}

// ---------------- UMKM ----------------

func umkmPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Beranda", "href": "/"},
		{"label": "Produk", "href": "/produk"},
		{"label": "Tentang", "href": "/tentang"},
		{"label": "Cara Pesan", "href": "/cara-pesan"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Toko Bahagia", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Toko Bahagia — Produk UMKM Asli Indonesia"})

	home := page("home", "Beranda", true,
		map[string]any{
			"title":       "Toko Bahagia — Produk UMKM Berkualitas, Harga Bersahabat",
			"description": "Belanja produk UMKM asli Indonesia: keripik, kopi, sambal, dan banyak lagi. Pesan praktis lewat WhatsApp.",
		},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Produk UMKM Asli Indonesia, Langsung dari Tangan Pengrajin",
				"subtitle": "Belanja praktis lewat WhatsApp. " + cv.Tone + ". Pengiriman cepat ke seluruh Indonesia.",
				"ctaLabel": "Order via WhatsApp", "ctaHref": "https://wa.me/6281234567890",
			}),
			block("FeatureList", map[string]any{
				"title": "Kenapa Pilih Kami?",
				"items": []map[string]any{
					{"title": "🌿 100% Bahan Lokal", "desc": "Mendukung petani dan pengrajin lokal dengan harga adil."},
					{"title": "✅ Kualitas Terjamin", "desc": "Setiap produk melewati QC ketat sebelum dikirim."},
					{"title": "🚚 Pengiriman Cepat", "desc": "Same-day untuk Jabodetabek, 1-3 hari untuk seluruh Indonesia."},
					{"title": "💬 Respon Cepat", "desc": "Tim CS aktif via WhatsApp setiap hari pukul 08.00 – 21.00."},
				},
			}),
			block("ProductGridDynamic", map[string]any{
				"title": "Best Seller Bulan Ini",
				"limit": 6,
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Sari, Jakarta", "text": "Rasanya enak banget, pengirimannya cepat. Sudah jadi langganan tetap!"},
					{"name": "Budi, Surabaya", "text": "Sudah langganan 6 bulan, kualitas konsisten dan packaging rapi."},
					{"name": "Dini, Bandung", "text": "CS-nya ramah dan responsif. Recommended untuk yang cari produk UMKM kualitas."},
				},
			}),
			block("Section", map[string]any{
				"title": "🎁 Promo Spesial Bulan Ini",
				"body":  "GRATIS ongkir untuk pembelian minimal Rp 100.000.\nDiskon 10% untuk pelanggan baru — pakai kode WELCOME10.\nBeli 3 gratis 1 untuk produk pilihan setiap hari Jumat!",
			}),
			footer,
		},
	)

	produk := page("produk", "Produk", false,
		map[string]any{"title": "Katalog Produk — Toko Bahagia", "description": "Semua produk Toko Bahagia tersedia di sini."},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Katalog Produk Kami",
				"subtitle": "Telusuri semua produk UMKM asli Indonesia. Klik produk untuk detail dan pemesanan.",
			}),
			block("ProductGridDynamic", map[string]any{
				"title": "",
				"limit": 24,
			}),
			block("Section", map[string]any{
				"title": "💬 Pesanan Custom?",
				"body":  "Butuh produk dalam jumlah besar untuk hampers, event, atau reseller? Hubungi WhatsApp kami untuk penawaran khusus.",
			}),
			footer,
		},
	)

	tentang := page("tentang", "Tentang Kami", false,
		map[string]any{"title": "Tentang Toko Bahagia"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Cerita di Balik Toko Bahagia",
				"subtitle": "Dimulai dari dapur kecil, kini telah dipercaya ribuan pelanggan di seluruh Indonesia.",
			}),
			block("Section", map[string]any{
				"title": "Awal Mula",
				"body":  "Toko Bahagia berdiri tahun 2020 dari hobi memasak yang berkembang jadi bisnis keluarga. Berawal dari produk keripik singkong yang dijual ke tetangga, kini kami menjadi mitra resmi lebih dari 30 pengrajin UMKM di Jawa.\n\nVisi kami sederhana: membantu produk UMKM lokal lebih dikenal sambil memberi pelanggan akses ke produk berkualitas dengan harga adil.",
			}),
			block("FeatureList", map[string]any{
				"title": "Komitmen Kami",
				"items": []map[string]any{
					{"title": "Mendukung UMKM", "desc": "Kami membayar pengrajin di atas harga pasar dan membantu mereka naik kelas."},
					{"title": "Bahan Pilihan", "desc": "Hanya bahan terbaik yang dipilih untuk setiap produk."},
					{"title": "Tanpa Pengawet Berbahaya", "desc": "Semua produk diproduksi dengan standar keamanan pangan."},
					{"title": "Kemasan Ramah Lingkungan", "desc": "Kami mengurangi penggunaan plastik dan beralih ke bahan biodegradable."},
				},
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Tim Toko Bahagia", "text": "Kami percaya produk lokal Indonesia tidak kalah dengan produk impor. Misi kami adalah membuktikan itu setiap hari."},
				},
			}),
			footer,
		},
	)

	caraPesan := page("cara-pesan", "Cara Pesan", false,
		map[string]any{"title": "Cara Pesan — Toko Bahagia"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Cara Pemesanan",
				"subtitle": "Pesan dalam 3 langkah mudah via WhatsApp.",
			}),
			block("FeatureList", map[string]any{
				"title": "3 Langkah Mudah",
				"items": []map[string]any{
					{"title": "1️⃣ Pilih Produk", "desc": "Buka halaman Produk, pilih item yang Anda inginkan. Catat nama produk dan jumlahnya."},
					{"title": "2️⃣ Chat WhatsApp", "desc": "Klik tombol WhatsApp atau scan QR code. Kirim format: nama produk, jumlah, alamat lengkap."},
					{"title": "3️⃣ Bayar & Tunggu", "desc": "Tim CS akan konfirmasi total + ongkir. Setelah transfer, paket dikirim dalam 1-3 hari kerja."},
				},
			}),
			block("Section", map[string]any{
				"title": "Format Pesanan via WhatsApp",
				"body":  "Halo kak, mau pesan:\n• [Nama Produk 1] – [Jumlah]\n• [Nama Produk 2] – [Jumlah]\n\nAlamat lengkap: [nama], [no HP], [alamat]\n\nKirimkan ke: 0812-3456-7890",
			}),
			block("FeatureList", map[string]any{
				"title": "Metode Pembayaran",
				"items": []map[string]any{
					{"title": "💳 Transfer Bank", "desc": "BCA, Mandiri, BRI, BNI — semua tersedia."},
					{"title": "📱 E-Wallet", "desc": "GoPay, OVO, DANA, ShopeePay."},
					{"title": "💵 COD (Bayar di Tempat)", "desc": "Tersedia untuk wilayah Jabodetabek dengan minimum order."},
				},
			}),
			block("Section", map[string]any{
				"title": "Pengiriman & Pengembalian",
				"body":  "Kami bekerja sama dengan JNE, J&T, SiCepat, dan Anteraja. Estimasi tiba 1-3 hari kerja untuk Jawa, 3-7 hari untuk luar Jawa.\n\nJika produk rusak atau salah kirim, hubungi kami dalam 24 jam — penggantian gratis tanpa repot.",
			}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Hubungi Toko Bahagia"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Hubungi Kami",
				"subtitle": "Punya pertanyaan? Tim kami siap membantu setiap hari.",
			}),
			block("FeatureList", map[string]any{
				"title": "Cara Menghubungi",
				"items": []map[string]any{
					{"title": "📱 WhatsApp", "desc": "0812-3456-7890 (respon ~5 menit, jam kerja)"},
					{"title": "📸 Instagram", "desc": "@tokobahagia — DM atau komentar di postingan"},
					{"title": "✉ Email", "desc": "halo@tokobahagia.id (untuk pesanan grosir / partnership)"},
					{"title": "📞 Telepon", "desc": "(021) 1234-5678 — Senin-Jumat 09.00-17.00"},
					{"title": "📍 Workshop", "desc": "Jl. UMKM Maju No. 88, Bekasi (kunjungan dengan janji)"},
					{"title": "🕒 Jam Operasional", "desc": "Senin-Sabtu: 08.00-21.00\nMinggu: 10.00-18.00"},
				},
			}),
			block("Section", map[string]any{
				"title": "🤝 Tertarik Jadi Reseller?",
				"body":  "Kami punya program kemitraan dengan margin menarik dan dukungan marketing. Cocok untuk Anda yang mau memulai bisnis tanpa modal besar.\n\nChat WhatsApp dengan kata kunci RESELLER untuk info lengkap.",
			}),
			footer,
		},
	)

	return []map[string]any{home, produk, tentang, caraPesan, kontak}
}

// ---------------- Portofolio ----------------

func portfolioPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Beranda", "href": "/"},
		{"label": "Project", "href": "/project"},
		{"label": "Layanan", "href": "/layanan"},
		{"label": "Tentang", "href": "/tentang"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Nama Saya", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Nama Saya — Web Developer & Designer"})

	home := page("home", "Beranda", true,
		map[string]any{
			"title":       "Nama Saya — Portfolio Web Developer",
			"description": "Web developer berpengalaman 5+ tahun. Spesialis aplikasi web modern dengan React, Next.js, dan Go.",
		},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Halo, saya Nama Saya 👋",
				"subtitle": "Web Developer & Designer dari Jakarta. Saya membangun aplikasi web yang " + cv.Tone + ", dengan fokus pada user experience.",
				"ctaLabel": "Lihat Project", "ctaHref": "/project",
			}),
			block("FeatureList", map[string]any{
				"title": "Apa yang Saya Lakukan",
				"items": []map[string]any{
					{"title": "💻 Frontend Development", "desc": "Aplikasi React/Next.js dengan UI modern, performa optimal, dan accessible."},
					{"title": "⚙️ Backend Development", "desc": "REST API dengan Go/Node.js, integrasi database, autentikasi, dan deployment."},
					{"title": "🎨 UI/UX Design", "desc": "Desain interface yang clean, intuitif, dan memprioritaskan kebutuhan user."},
					{"title": "📱 Mobile-Responsive", "desc": "Setiap aplikasi dibangun mobile-first untuk pengalaman mulus di semua device."},
				},
			}),
			block("ProjectGrid", map[string]any{
				"title": "Project Pilihan",
				"items": []map[string]any{
					{"name": "Web Builder Platform", "desc": "Multi-tenant SaaS untuk membuat website dengan editor visual. 500+ active users.", "href": "/project"},
					{"name": "E-commerce UMKM", "desc": "Marketplace untuk pengrajin lokal dengan payment gateway terintegrasi.", "href": "/project"},
					{"name": "Dashboard Analytics", "desc": "Realtime dashboard untuk monitoring KPI bisnis, refresh tiap 1 detik.", "href": "/project"},
				},
			}),
			block("Section", map[string]any{
				"title": "Cara Saya Bekerja",
				"body":  "Saya percaya komunikasi adalah kunci. Setiap project dimulai dengan diskusi mendalam tentang goal dan user, lalu prototyping cepat sebelum coding. Sprint mingguan dengan demo agar Anda selalu update progress.",
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Pak Andi, CEO TechCorp", "text": "Hasil kerjanya melebihi ekspektasi. Komunikasi smooth, deadline tepat, dan kode-nya rapi banget."},
					{"name": "Mbak Rina, Founder StartupID", "text": "Sangat profesional. Tidak hanya bisa coding, tapi juga ngerti bisnis dan kasih saran strategis."},
				},
			}),
			footer,
		},
	)

	project := page("project", "Project", false,
		map[string]any{"title": "Project Saya — Portfolio"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Project Saya",
				"subtitle": "Kumpulan project terbaik dari 5 tahun karir saya sebagai developer. Klik untuk detail studi kasus.",
			}),
			block("ProjectGrid", map[string]any{
				"title": "Web Applications",
				"items": []map[string]any{
					{"name": "🛍️ E-commerce UMKM", "desc": "Marketplace lokal dengan 50+ merchant. Stack: Next.js + Stripe + Postgres.", "href": "#"},
					{"name": "📊 Dashboard Analytics", "desc": "Realtime dashboard B2B dengan grafik interaktif. Stack: React + Go + ClickHouse.", "href": "#"},
					{"name": "🎓 Learning Management System", "desc": "Platform pembelajaran online untuk 5000+ siswa. Stack: Next.js + Node + Postgres.", "href": "#"},
					{"name": "🏥 Sistem Klinik", "desc": "Sistem manajemen klinik dengan rekam medis digital. Stack: Vue + Laravel.", "href": "#"},
				},
			}),
			block("ProjectGrid", map[string]any{
				"title": "Open Source & Side Projects",
				"items": []map[string]any{
					{"name": "🛠️ go-utils", "desc": "Library Go untuk helper umum (250+ stars di GitHub).", "href": "#"},
					{"name": "✍️ Personal Blog Generator", "desc": "Static site generator untuk blog teknis (Markdown → HTML).", "href": "#"},
					{"name": "🎨 Tailwind Component Kit", "desc": "Collection komponen UI siap pakai. 1000+ downloads.", "href": "#"},
				},
			}),
			block("Section", map[string]any{
				"title": "Tertarik Berkolaborasi?",
				"body":  "Saya selalu terbuka untuk diskusi project menarik. Reach out via halaman Kontak atau langsung email!",
			}),
			footer,
		},
	)

	layanan := page("layanan", "Layanan", false,
		map[string]any{"title": "Layanan — Nama Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Layanan yang Saya Tawarkan",
				"subtitle": "Solusi web development untuk berbagai kebutuhan bisnis Anda.",
			}),
			block("FeatureList", map[string]any{
				"title": "Paket Layanan",
				"items": []map[string]any{
					{"title": "🌐 Website Bisnis", "desc": "Landing page + halaman produk + SEO basic. Mulai Rp 5jt. Lead time 2 minggu."},
					{"title": "💼 Web Aplikasi Custom", "desc": "Aplikasi web fungsional dengan database & autentikasi. Mulai Rp 15jt. Lead time 1-3 bulan."},
					{"title": "🛒 E-commerce", "desc": "Toko online lengkap dengan payment gateway & inventory. Mulai Rp 25jt."},
					{"title": "🔧 Maintenance & Fix", "desc": "Update fitur, bug fix, optimasi performa. Per jam atau retainer bulanan."},
					{"title": "🎨 UI/UX Redesign", "desc": "Perbaikan tampilan untuk aplikasi yang sudah ada. Wireframe → desain final."},
					{"title": "📚 Konsultasi & Mentoring", "desc": "Sesi 1-on-1 untuk diskusi arsitektur, code review, atau career advice."},
				},
			}),
			block("Section", map[string]any{
				"title": "Proses Kerja",
				"body":  "1. Discovery — diskusi kebutuhan via call (gratis 30 menit).\n2. Proposal — penawaran detail beserta timeline & budget.\n3. Sprint — kerja iteratif dengan demo mingguan.\n4. Launch — deploy + handover dokumentasi.\n5. Support — 30 hari bug fix gratis pasca-launch.",
			}),
			block("FeatureList", map[string]any{
				"title": "Stack yang Sering Saya Pakai",
				"items": []map[string]any{
					{"title": "Frontend", "desc": "React, Next.js, Tailwind, TypeScript, shadcn/ui"},
					{"title": "Backend", "desc": "Go (Fiber/Gin), Node.js (Express/Fastify), Python (FastAPI)"},
					{"title": "Database", "desc": "PostgreSQL, MySQL, MongoDB, Redis"},
					{"title": "DevOps", "desc": "Docker, Kubernetes, GitHub Actions, AWS, Vercel"},
				},
			}),
			footer,
		},
	)

	tentang := page("tentang", "Tentang", false,
		map[string]any{"title": "Tentang Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Tentang Saya",
				"subtitle": "Developer, designer, dan eternal learner.",
			}),
			block("Section", map[string]any{
				"title": "Cerita Singkat",
				"body":  "Saya mulai ngoding tahun 2018 saat masih kuliah jurusan Teknik Informatika. Dimulai dari hobi bikin website iseng, sekarang sudah 5 tahun jadi full-time developer di berbagai project remote.\n\nSaya percaya teknologi terbaik adalah yang membuat hidup orang lebih mudah, bukan lebih rumit. Karenanya saya selalu fokus pada kesederhanaan dan user experience.",
			}),
			block("FeatureList", map[string]any{
				"title": "Pengalaman",
				"items": []map[string]any{
					{"title": "💼 2022 – Sekarang", "desc": "Senior Full-Stack Developer @ Remote (B2B SaaS)"},
					{"title": "💻 2020 – 2022", "desc": "Full-Stack Developer @ Local Startup (E-commerce)"},
					{"title": "🌱 2018 – 2020", "desc": "Freelance Web Developer (websites + tools UMKM)"},
				},
			}),
			block("FeatureList", map[string]any{
				"title": "Selain Coding",
				"items": []map[string]any{
					{"title": "📷 Fotografi", "desc": "Hobi street photography saat weekend keluar kota."},
					{"title": "🎮 Gaming", "desc": "Penggemar RPG dan indie games."},
					{"title": "📚 Membaca", "desc": "Sci-fi, business, dan psychology — semuanya saya lahap."},
					{"title": "🧑‍🏫 Berbagi", "desc": "Mentor di komunitas developer lokal. Sesekali ngajar bootcamp."},
				},
			}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak — Nama Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Mari Berkolaborasi 🤝",
				"subtitle": "Saya selalu terbuka untuk diskusi project, kerja sama, atau sekadar ngobrol soal teknologi.",
			}),
			block("FeatureList", map[string]any{
				"title": "Cara Menghubungi",
				"items": []map[string]any{
					{"title": "✉ Email", "desc": "hello@namasaya.com — respon dalam 24 jam"},
					{"title": "💼 LinkedIn", "desc": "linkedin.com/in/namasaya — profile lengkap + endorsement"},
					{"title": "🐙 GitHub", "desc": "github.com/namasaya — open source contributions"},
					{"title": "🐦 Twitter / X", "desc": "@namasaya — thoughts & tech updates"},
					{"title": "📱 WhatsApp", "desc": "0812-3456-7890 (urgent only please)"},
					{"title": "📍 Lokasi", "desc": "Jakarta, Indonesia. Tersedia untuk remote dan onsite (Jabodetabek)."},
				},
			}),
			block("Section", map[string]any{
				"title": "Mulai Project?",
				"body":  "Kirim email dengan info berikut:\n• Brief project (apa yang ingin dibangun)\n• Timeline kapan harus selesai\n• Budget range\n• Apakah ada referensi visual / contoh aplikasi serupa\n\nSaya akan reply dengan proposal + jadwal call discovery dalam 24 jam.",
			}),
			footer,
		},
	)

	return []map[string]any{home, project, layanan, tentang, kontak}
}

// ---------------- Guru ----------------

func teacherPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Beranda", "href": "/"},
		{"label": "Materi", "href": "/materi"},
		{"label": "Jadwal", "href": "/jadwal"},
		{"label": "Tentang", "href": "/tentang"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Pak Budi", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Pak Budi — Guru Matematika SMA"})

	home := page("home", "Beranda", true,
		map[string]any{
			"title":       "Pak Budi — Guru Matematika SMA",
			"description": "Belajar matematika SMA dengan cara menyenangkan dan terstruktur. Materi gratis, kelas privat, dan konsultasi PR.",
		},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Belajar Matematika Itu Menyenangkan! 📐",
				"subtitle": "Pak Budi — guru matematika SMA dengan 15 tahun pengalaman. Belajar dengan cara yang " + cv.Tone + ".",
				"ctaLabel": "Lihat Materi Gratis", "ctaHref": "/materi",
			}),
			block("FeatureList", map[string]any{
				"title": "Yang Akan Anda Pelajari",
				"items": []map[string]any{
					{"title": "🔢 Aljabar", "desc": "Dari konsep dasar persamaan linear hingga persiapan olimpiade matematika."},
					{"title": "📊 Statistika", "desc": "Probabilitas, distribusi, dan aplikasi statistik di kehidupan nyata."},
					{"title": "∫ Kalkulus", "desc": "Limit, turunan, dan integral — dijelaskan dengan analogi sederhana."},
					{"title": "📐 Geometri", "desc": "Geometri datar, ruang, dan transformasi dengan visualisasi interaktif."},
					{"title": "🎯 Trigonometri", "desc": "Identitas, persamaan, dan aplikasi di fisika & engineering."},
					{"title": "🏆 Soal Olimpiade", "desc": "Latihan soal tingkat OSN/OSP dengan strategi penyelesaian."},
				},
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Maya, Siswa Kelas 12", "text": "Awalnya benci matematika, sekarang nilai saya naik dari 60 ke 92. Pak Budi pinter banget jelasinnya step by step!"},
					{"name": "Andi, Alumni 2023", "text": "Berkat Pak Budi, saya lulus SBMPTN jurusan Teknik. Materi & soalnya benar-benar membantu."},
					{"name": "Ibu Rini, Orang Tua", "text": "Anak saya jadi lebih percaya diri menghadapi matematika. Terima kasih, Pak!"},
				},
			}),
			block("Section", map[string]any{
				"title": "🎁 Materi Gratis untuk Anda",
				"body":  "Saya menyediakan ratusan halaman materi belajar GRATIS untuk siswa SMA. Lengkap dengan pembahasan soal dan video penjelasan.\n\nKlik halaman Materi untuk mulai belajar sekarang!",
			}),
			footer,
		},
	)

	materi := page("materi", "Materi", false,
		map[string]any{"title": "Materi Belajar — Pak Budi"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Materi Belajar Matematika",
				"subtitle": "Ratusan materi gratis untuk siswa SMA, lengkap dengan latihan soal dan pembahasan.",
			}),
			block("FeatureList", map[string]any{
				"title": "Kategori Materi",
				"items": []map[string]any{
					{"title": "📘 Aljabar (Kelas 10)", "desc": "Persamaan linear, kuadrat, pertidaksamaan, sistem persamaan. 25 modul + 100 soal."},
					{"title": "📗 Trigonometri (Kelas 11)", "desc": "Identitas trigonometri, persamaan, dan grafik. 20 modul + 80 soal."},
					{"title": "📙 Kalkulus (Kelas 11-12)", "desc": "Limit, turunan, integral, aplikasi. 30 modul + 120 soal."},
					{"title": "📕 Statistika & Peluang", "desc": "Distribusi, probabilitas, kombinatorik. 15 modul + 60 soal."},
					{"title": "📓 Geometri Analitik", "desc": "Persamaan garis, lingkaran, parabola, ellips. 18 modul."},
					{"title": "🏆 Persiapan Olimpiade", "desc": "Soal-soal level OSN tahun-tahun sebelumnya dengan pembahasan."},
				},
			}),
			block("Section", map[string]any{
				"title": "Cara Mengakses",
				"body":  "Semua materi tersedia GRATIS dalam format PDF + video YouTube. Klik salah satu kategori di atas untuk mulai belajar.\n\nButuh penjelasan lebih lanjut? Tanyakan langsung via WhatsApp atau ikuti kelas privat saya (lihat halaman Jadwal).",
			}),
			block("BlogList", map[string]any{
				"items": []map[string]any{
					{"title": "5 Trik Mudah Menghadapi Soal Cerita", "excerpt": "Tips ampuh menerjemahkan soal cerita jadi persamaan matematika.", "href": "#"},
					{"title": "Persiapan UTBK Matematika dari 0", "excerpt": "Roadmap lengkap 3 bulan untuk siap UTBK dengan skor optimal.", "href": "#"},
					{"title": "Olimpiade Matematika: Mulai dari Mana?", "excerpt": "Panduan untuk siswa yang baru ingin mencoba kompetisi.", "href": "#"},
				},
			}),
			footer,
		},
	)

	jadwal := page("jadwal", "Jadwal Kelas", false,
		map[string]any{"title": "Jadwal Kelas Privat — Pak Budi"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Jadwal Kelas Privat",
				"subtitle": "Pilih jadwal yang cocok untuk Anda. Kelas online via Zoom atau offline di Jakarta.",
			}),
			block("FeatureList", map[string]any{
				"title": "Jadwal Reguler",
				"items": []map[string]any{
					{"title": "🟢 Senin – Rabu – Jumat", "desc": "Pukul 16.00 – 17.30 (Kelas 10) | 18.00 – 19.30 (Kelas 11) | 19.30 – 21.00 (Kelas 12)"},
					{"title": "🟢 Selasa – Kamis – Sabtu", "desc": "Pukul 09.00 – 10.30 (Privat 1-on-1) | 13.00 – 14.30 (Privat 1-on-1)"},
					{"title": "🟢 Sabtu Pagi", "desc": "Pukul 08.00 – 10.00 — Kelas Olimpiade & Pembahasan Soal Sulit"},
				},
			}),
			block("FeatureList", map[string]any{
				"title": "Tipe Kelas",
				"items": []map[string]any{
					{"title": "👥 Kelas Reguler (3-5 siswa)", "desc": "Rp 350rb/bulan (8x pertemuan). Cocok untuk belajar bareng teman."},
					{"title": "👤 Privat 1-on-1", "desc": "Rp 200rb/sesi (90 menit). Materi & pace disesuaikan kebutuhan Anda."},
					{"title": "🏆 Kelas Olimpiade", "desc": "Rp 500rb/bulan (4x pertemuan). Khusus persiapan OSN/OSP."},
					{"title": "🎯 Crash Course UTBK", "desc": "Rp 1.5jt (8x pertemuan). Materi komplit untuk maksimalkan skor UTBK."},
				},
			}),
			block("Section", map[string]any{
				"title": "📍 Lokasi",
				"body":  "Offline: Ruko Bahagia Blok B-12, Jl. Pendidikan Raya, Jakarta Selatan\nOnline: Via Zoom (link dikirim H-1)\n\nTrial gratis 1 sesi untuk siswa baru — booking via WhatsApp.",
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Reza, Siswa Kelas 11", "text": "Kelas privat-nya enak, Pak Budi sabar banget kalau saya nggak paham."},
				},
			}),
			footer,
		},
	)

	tentang := page("tentang", "Tentang", false,
		map[string]any{"title": "Tentang Pak Budi"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Tentang Saya",
				"subtitle": "Guru matematika dengan misi membuat siswa mencintai matematika.",
			}),
			block("Section", map[string]any{
				"title": "Halo, saya Pak Budi 👋",
				"body":  "Saya Budi Santoso, S.Pd., M.Si. — guru matematika dengan 15 tahun pengalaman mengajar siswa SMA. Saya alumni S2 Matematika dari ITB dan sudah mengantarkan lebih dari 500 siswa lulus PTN ternama.\n\nFilosofi saya: tidak ada anak yang bodoh matematika, hanya cara mengajar yang kurang cocok. Saya selalu menyesuaikan gaya belajar setiap siswa.",
			}),
			block("FeatureList", map[string]any{
				"title": "Pendidikan & Sertifikat",
				"items": []map[string]any{
					{"title": "🎓 S2 Matematika ITB", "desc": "Lulus tahun 2009 dengan predikat cumlaude."},
					{"title": "🎓 S1 Pendidikan Matematika UPI", "desc": "Lulus tahun 2007."},
					{"title": "📜 Sertifikasi Guru Profesional", "desc": "Sertifikat sebagai pendidik bersertifikat Kemendikbud."},
					{"title": "🏆 Trainer Olimpiade Matematika", "desc": "Pelatih tim OSN tingkat provinsi sejak 2015."},
				},
			}),
			block("FeatureList", map[string]any{
				"title": "Pencapaian Murid",
				"items": []map[string]any{
					{"title": "🎯 500+ siswa", "desc": "Lulus SNMPTN/SBMPTN ke PTN ternama"},
					{"title": "🥇 12 medali OSN", "desc": "Murid berhasil meraih medali olimpiade nasional"},
					{"title": "📈 Rata-rata kenaikan 30 poin", "desc": "Dalam 3 bulan kelas reguler"},
				},
			}),
			block("Section", map[string]any{
				"title": "Mengapa Matematika?",
				"body":  "Matematika bukan sekadar angka — ini cara berpikir yang melatih logika, ketelitian, dan kreativitas. Skill yang berguna di SEMUA bidang karir, dari bisnis hingga seni.\n\nMari saya tunjukkan bahwa matematika bisa menyenangkan! 🎯",
			}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak Pak Budi"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Hubungi Pak Budi",
				"subtitle": "Punya pertanyaan tentang materi, jadwal, atau ingin trial gratis? Hubungi saya kapan saja.",
			}),
			block("FeatureList", map[string]any{
				"title": "Kontak",
				"items": []map[string]any{
					{"title": "📱 WhatsApp", "desc": "0812-0000-0000 (untuk reservasi kelas & pertanyaan cepat)"},
					{"title": "✉ Email", "desc": "budi@guru.id (untuk diskusi panjang & kerja sama)"},
					{"title": "📸 Instagram", "desc": "@pakbudi.math (tips harian & quiz seru)"},
					{"title": "▶️ YouTube", "desc": "Pak Budi Mathematics (video penjelasan materi gratis)"},
					{"title": "📍 Lokasi Offline", "desc": "Ruko Bahagia B-12, Jl. Pendidikan Raya, Jakarta Selatan"},
					{"title": "🕒 Jam Kerja", "desc": "Senin – Sabtu: 09.00 – 21.00 (Minggu libur)"},
				},
			}),
			block("Section", map[string]any{
				"title": "🎁 Trial Gratis 1 Sesi",
				"body":  "Belum yakin? Coba dulu kelas saya GRATIS satu sesi. Kirim WhatsApp dengan info:\n• Nama & kelas Anda\n• Topik yang ingin dipelajari\n• Jadwal yang preferred\n\nSaya akan reply maksimal 4 jam.",
			}),
			footer,
		},
	)

	return []map[string]any{home, materi, jadwal, tentang, kontak}
}

// ---------------- Blog ----------------

func blogPages(cv variantCopy) []map[string]any {
	links := []map[string]any{
		{"label": "Beranda", "href": "/"},
		{"label": "Artikel", "href": "/artikel"},
		{"label": "Kategori", "href": "/kategori"},
		{"label": "Tentang", "href": "/tentang"},
		{"label": "Kontak", "href": "/kontak"},
	}
	nav := block("Navbar", map[string]any{"brand": "Blog Saya", "links": links})
	footer := block("Footer", map[string]any{"copyright": "© Blog Saya — Berbagi Cerita & Wawasan"})

	home := page("home", "Beranda", true,
		map[string]any{
			"title":       "Blog Saya — Tulisan Tentang Teknologi & Kehidupan",
			"description": "Catatan harian seputar teknologi, produktivitas, dan refleksi pribadi. Diperbarui setiap minggu.",
		},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Tulisan Tentang Teknologi, Produktivitas & Kehidupan",
				"subtitle": "Diperbarui setiap minggu — " + cv.Tone + ". Subscribe untuk dapat artikel terbaru langsung ke inbox.",
				"ctaLabel": "Baca Artikel Terbaru", "ctaHref": "/artikel",
			}),
			block("BlogListDynamic", map[string]any{
				"title": "Artikel Terbaru",
				"limit": 6,
			}),
			block("FeatureList", map[string]any{
				"title": "Topik yang Sering Saya Bahas",
				"items": []map[string]any{
					{"title": "💻 Teknologi", "desc": "Tutorial coding, review tools, dan tren web development."},
					{"title": "⚡ Produktivitas", "desc": "Workflow, habit, dan tips manajemen waktu."},
					{"title": "📚 Buku & Belajar", "desc": "Review buku dan refleksi dari yang saya baca."},
					{"title": "🌱 Pengalaman", "desc": "Cerita & pelajaran dari perjalanan karir & hidup."},
				},
			}),
			block("Section", map[string]any{
				"title": "📬 Newsletter",
				"body":  "Dapatkan artikel terbaru + reflection eksklusif yang nggak saya post di blog, kirim langsung ke email Anda. Tanpa spam, kapan saja bisa unsubscribe.\n\nKirim email Anda ke: subscribe@blogsaya.com",
			}),
			block("Testimonial", map[string]any{
				"items": []map[string]any{
					{"name": "Rani, Software Engineer", "text": "Tulisannya bermanfaat dan mudah dicerna. Wajib follow untuk yang lagi belajar coding."},
					{"name": "Doni, Product Manager", "text": "Konten teknologinya selalu update dan disertai contoh nyata. Top!"},
				},
			}),
			footer,
		},
	)

	artikel := page("artikel", "Artikel", false,
		map[string]any{"title": "Semua Artikel — Blog Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Semua Artikel",
				"subtitle": "Telusuri kumpulan tulisan lengkap. Filter berdasarkan kategori di halaman Kategori.",
			}),
			block("BlogListDynamic", map[string]any{
				"title": "",
				"limit": 50,
			}),
			footer,
		},
	)

	kategori := page("kategori", "Kategori", false,
		map[string]any{"title": "Kategori Artikel — Blog Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Jelajahi Berdasarkan Kategori",
				"subtitle": "Pilih topik yang menarik untuk dibaca.",
			}),
			block("FeatureList", map[string]any{
				"title": "Topik",
				"items": []map[string]any{
					{"title": "💻 Web Development", "desc": "Tutorial Next.js, React, Tailwind, dan tools modern lainnya."},
					{"title": "⚙️ Backend & DevOps", "desc": "Go, Node.js, Docker, dan deployment best practices."},
					{"title": "🎨 Design & UX", "desc": "Prinsip desain, color theory, dan user research."},
					{"title": "⚡ Produktivitas", "desc": "Workflow, GTD, manajemen waktu, dan habit building."},
					{"title": "📚 Belajar & Karir", "desc": "Tips belajar efektif, career advice, dan refleksi journey."},
					{"title": "🌱 Personal", "desc": "Cerita pribadi, refleksi, dan random thoughts."},
				},
			}),
			block("BlogListDynamic", map[string]any{
				"title": "Artikel Populer",
				"limit": 6,
			}),
			footer,
		},
	)

	tentang := page("tentang", "Tentang", false,
		map[string]any{"title": "Tentang Penulis — Blog Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Halo, saya Penulis Blog Ini 👋",
				"subtitle": "Software engineer, lifelong learner, dan suka berbagi.",
			}),
			block("Section", map[string]any{
				"title": "Tentang Saya",
				"body":  "Saya menulis blog ini sejak 2020 sebagai cara untuk mendokumentasikan apa yang saya pelajari. Awalnya cuma untuk diri sendiri, sekarang sudah dibaca ribuan orang setiap bulan.\n\nDi luar coding, saya suka membaca buku, fotografi, dan minum kopi sambil ngobrol soal hal-hal random. Saya percaya semakin banyak kita berbagi, semakin banyak kita belajar.",
			}),
			block("FeatureList", map[string]any{
				"title": "Sehari-hari Saya",
				"items": []map[string]any{
					{"title": "💼 Pekerjaan", "desc": "Senior Software Engineer di startup remote."},
					{"title": "🌍 Lokasi", "desc": "Yogyakarta, Indonesia. Remote-friendly."},
					{"title": "✍️ Menulis", "desc": "Posting setiap Senin pagi, minimal 1 artikel/minggu."},
					{"title": "📚 Sedang Baca", "desc": "Buku terbaru: \"The Pragmatic Programmer\" (Andy Hunt)"},
				},
			}),
			block("FeatureList", map[string]any{
				"title": "Yang Saya Pakai",
				"items": []map[string]any{
					{"title": "💻 Setup", "desc": "MacBook Pro M2, monitor 27\" Dell, keyboard Keychron K3"},
					{"title": "⌨️ Editor", "desc": "Neovim + tmux untuk coding, Obsidian untuk catatan"},
					{"title": "☁️ Tools", "desc": "Linear (task), Notion (docs), 1Password (security)"},
					{"title": "📷 Camera", "desc": "Fujifilm X-T30 untuk street photography weekend"},
				},
			}),
			block("Section", map[string]any{
				"title": "Mengapa Menulis?",
				"body":  "Menulis adalah cara saya berpikir. Ketika ide masih di kepala, semuanya terasa jelas — tapi begitu dipaksa dituangkan ke kalimat, baru ketahuan mana yang benar-benar saya pahami dan mana yang masih shaky.\n\nBlog ini juga jadi semacam \"second brain\" yang bisa saya rujuk ulang. Senangnya, ternyata banyak orang yang juga mendapat manfaat dari catatan ini. 🙏",
			}),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak — Blog Saya"},
		[]map[string]any{
			nav,
			block("Hero", map[string]any{
				"title":    "Mari Terhubung 📬",
				"subtitle": "Saya selalu senang diskusi dengan pembaca atau sekadar sapa.",
			}),
			block("FeatureList", map[string]any{
				"title": "Cara Menghubungi",
				"items": []map[string]any{
					{"title": "✉ Email", "desc": "halo@blogsaya.com — biasanya reply dalam 1-2 hari"},
					{"title": "🐦 Twitter / X", "desc": "@blogsaya — diskusi cepat & komentar"},
					{"title": "💼 LinkedIn", "desc": "linkedin.com/in/penulis-blog"},
					{"title": "📸 Instagram", "desc": "@blogsaya.id — behind the scenes & foto random"},
					{"title": "🐙 GitHub", "desc": "github.com/penulis-blog — kode pendukung tutorial"},
					{"title": "📺 YouTube", "desc": "Channel video tutorial (dalam bahasa Indonesia)"},
				},
			}),
			block("Section", map[string]any{
				"title": "🎤 Open for Speaking & Workshop",
				"body":  "Saya tersedia untuk:\n• Talk teknologi di meetup/konferensi (online & offline)\n• Workshop coding untuk perusahaan/komunitas\n• Wawancara podcast tentang tech / career\n\nKirim email dengan detail acara — saya akan reply maksimal 3 hari.",
			}),
			block("Section", map[string]any{
				"title": "📝 Kontribusi & Guest Post?",
				"body":  "Tertarik nulis di blog ini? Saya menerima guest post dengan kriteria:\n• Topik sesuai (tech, productivity, learning)\n• Original (tidak pernah dipublikasikan)\n• Min 1000 kata dengan kualitas baik\n\nPitch ide-nya via email!",
			}),
			footer,
		},
	)

	return []map[string]any{home, artikel, kategori, tentang, kontak}
}
