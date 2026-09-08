package templates

// guru_pandi_upi.go — Template spesial co-branding PANDI × UPI untuk website
// pribadi guru. Menggunakan custom block set "Guru*" di renderer
// (apps/renderer/components/GuruBlocks.tsx) supaya visual persis mockup di
// /website-guru-mockup-pembelajaran/.
//
// Ini template STANDALONE — di-append manual ke BuiltinTemplates() (skip
// matrix category × variant). Kategori "guru-pandi" tampil sebagai section
// terpisah di picker.
//
// Design decisions:
//   - Semua page dimulai dengan block "GuruStyles" — inject 1x CSS scoped
//     (var prefix .guru-*) supaya konsisten cross-page tanpa clash tailwind.
//   - Palette + font di-set via theme colors (primary/secondary/bg/fg) +
//     CSS var (--font-heading/--font-body) — user tetap bisa custom.
//   - Custom block Guru* menerima flat prop, bukan nested Container/Columns
//     — 1 block = 1 section (mudah edit di dashboard).

// Asset paths — file PNG di-copy dari mockup ke apps/renderer/public/templates/
// dan apps/web/public/templates/ (mirror untuk preview iframe di dashboard).
const (
	guruAssetTeacher = "/templates/guru-pandi-upi/teacher.png"
	guruAssetPromo1  = "/templates/guru-pandi-upi/promo-pelatihan-guru.png"
	guruAssetPromo2  = "/templates/guru-pandi-upi/promo-literasi-kelas.png"
	guruAssetPromo3  = "/templates/guru-pandi-upi/promo-komunitas-guru.png"
)

// guruPandiUPITemplate returns the co-branded PANDI × UPI teacher template.
func guruPandiUPITemplate() BuiltinTemplate {
	theme := map[string]any{
		"colors": map[string]any{
			"primary":   "#14233b",
			"secondary": "#b6423d",
			"bg":        "#fbf8f1",
			"fg":        "#263247",
		},
		"font": map[string]any{
			"heading": "Georgia",
			"body":    "Inter",
		},
		"radius": "1.5rem",
	}

	return BuiltinTemplate{
		Slug:        "guru-pandi-upi",
		Category:    "guru-pandi",
		Variant:     "pandi-upi",
		Name:        "Guru PANDI × UPI — Editorial",
		Description: "Template co-branding PANDI × UPI untuk website pribadi guru. Custom blok Guru* untuk fidelity 100% ke mockup. 9 halaman: Beranda, Profil, Ceritaku, Bacaanku, Inspirasiku, Bangsaku, Peradaban, Forum Diskusi, Pembelajaran.",
		Theme:       theme,
		Pages:       guruPandiUPIPages(),
	}
}

// -------- Shared helpers untuk semua page --------

func guruNavLinks(activeSlug string) []map[string]any {
	items := []struct{ Label, Href, Slug string }{
		{"Beranda", "/", "home"},
		{"Profil", "/profil", "profil"},
		{"Ceritaku", "/ceritaku", "ceritaku"},
		{"Bacaanku", "/bacaanku", "bacaanku"},
		{"Inspirasiku", "/inspirasiku", "inspirasiku"},
		{"Bangsaku", "/bangsaku", "bangsaku"},
		{"Peradaban", "/peradaban", "peradaban"},
		{"Forum Diskusi", "/forum-diskusi", "forum-diskusi"},
		{"Pembelajaran", "/pembelajaran", "pembelajaran"},
	}
	out := make([]map[string]any, 0, len(items))
	for _, it := range items {
		out = append(out, map[string]any{
			"label":  it.Label,
			"href":   it.Href,
			"active": it.Slug == activeSlug,
		})
	}
	return out
}

func guruNav(activeSlug string) map[string]any {
	return block("GuruNavbar", map[string]any{
		"brandName": "Ratna Prameswari",
		"brandRole": "Guru Bahasa Indonesia",
		"brandMark": "R",
		"links":     guruNavLinks(activeSlug),
	})
}

func guruFooter() map[string]any {
	return block("GuruFooter", map[string]any{
		"brandName":    "Ratna Prameswari",
		"brandRole":    "Guru Bahasa Indonesia",
		"brandMark":    "R",
		"copyText":     "Ruang pribadi untuk menyimpan cerita, bacaan, inspirasi, dan refleksi tentang pendidikan. Seluruh nama dan konten pada template ini bersifat contoh — silakan ganti dengan data Anda.",
		"builderTitle": "Web Builder Guru",
		"builderBrand": "PANDI × UPI",
		"builderNote":  "Co-branding program website pribadi guru",
		"links":        guruNavLinks(""),
		"bottomLeft":   "© 2026 Ratna Prameswari — Website guru",
		"bottomRight":  "rumahguru.id · contoh domain fiktif",
	})
}

// guruStyleBlock — di-emit sekali di awal SETIAP page supaya CSS ter-inject
// meskipun user navigate langsung ke sub-page (bukan dari home).
func guruStyleBlock() map[string]any {
	return block("GuruStyles", map[string]any{})
}

// -------- guruPandiUPIPages: entry point --------

func guruPandiUPIPages() []map[string]any {
	return []map[string]any{
		guruHomePage(),
		guruProfilPage(),
		guruCeritakuPage(),
		guruBacaankuPage(),
		guruInspirasikuPage(),
		guruBangsakuPage(),
		guruPeradabanPage(),
		guruForumDiskusiPage(),
		guruPembelajaranPage(),
	}
}

// -------- Home / Beranda --------

func guruHomePage() map[string]any {
	return page("home", "Beranda", true,
		map[string]any{
			"title":       "Beranda · Ratna Prameswari — Guru Bahasa Indonesia",
			"description": "Website pribadi guru — cerita mengajar, bacaan, refleksi, dan diskusi.",
		},
		[]map[string]any{
			guruStyleBlock(),
			guruNav("home"),
			block("GuruHero", map[string]any{
				"eyebrow":           "Ruang Belajar & Berbagi",
				"title":             "Halo, saya Ratna.",
				"titleEm":           "Saya belajar bersama siswa.",
				"subtitle":          "Website ini adalah rumah kecil untuk menyimpan pengalaman mengajar, bacaan, gagasan, dan percakapan tentang pendidikan — agar hal-hal baik tidak selesai di dalam kelas.",
				"ctaLabel":          "Mulai dari Ceritaku",
				"ctaHref":           "/ceritaku",
				"ctaSecondaryLabel": "Kenal lebih dekat",
				"ctaSecondaryHref":  "/profil",
				"image":             guruAssetTeacher,
				"imageAlt":          "Ilustrasi guru",
				"stats": []map[string]any{
					{"value": "12+", "label": "Tahun mengajar"},
					{"value": "6", "label": "Ruang berbagi"},
					{"value": "1", "label": "Niat: terus belajar"},
				},
				"noteAText": "Bahasa Indonesia",
				"noteASub":  "SMP · Literasi · Sastra",
				"noteBText": "Catatan hari ini",
				"noteBSub":  "Siswa berani bertanya.",
			}),
			// Dynamic — fetch banner efektif site pada render time.
			block("GuruPromoCarouselDynamic", map[string]any{}),
			// Dynamic — Jejak Website Saya dari SiteStats (spec §12).
			block("GuruStatsBarDynamic", map[string]any{
				"eyebrow":  "Jejak Website Saya",
				"title":    "Tulisan yang tumbuh bersama pembaca.",
				"subtitle": "Catatan kecil tentang bagaimana tulisan di website ini dibaca dan ditanggapi.",
			}),
			block("GuruRubricGrid", map[string]any{
				"eyebrow":  "Enam ruang utama",
				"title":    "Apa yang saya simpan di sini?",
				"subtitle": "Tidak semua pengalaman perlu menjadi tulisan panjang. Ada yang cukup dicatat, ada yang perlu dibaca ulang, dan ada yang justru perlu dibicarakan bersama.",
				"items": []map[string]any{
					{"title": "Ceritaku", "desc": "Cerita keseharian dan pengalaman mengajar yang tetap terhubung dengan Bahasa Indonesia.", "href": "/ceritaku", "icon": "book"},
					{"title": "Bacaanku", "desc": "Buku yang saya baca, tandai, dan bawa kembali ke ruang kelas.", "href": "/bacaanku", "icon": "bookmark"},
					{"title": "Inspirasiku", "desc": "Praktik baik, ide sederhana, dan orang-orang yang menyalakan semangat.", "href": "/inspirasiku", "icon": "sparkle"},
					{"title": "Bangsaku", "desc": "Belajar Indonesia lewat gotong royong, keberagaman, tanggung jawab, keadilan, dan bahasa.", "href": "/bangsaku", "icon": "flag"},
					{"title": "Peradaban", "desc": "Membaca sejarah, budaya, dan warisan sebagai percakapan antargenerasi.", "href": "/peradaban", "icon": "temple"},
					{"title": "Forum Diskusi", "desc": "Ruang guru, siswa, orang tua, dan pembaca untuk membicarakan materi & isu aktual.", "href": "/forum-diskusi", "icon": "chat"},
				},
			}),
			// Dynamic — 4 tulisan terbaru dari DB (featured + 3 side).
			block("GuruLatestGridDynamic", map[string]any{
				"eyebrow":  "Tulisan terbaru",
				"title":    "Dari kelas, buku, dan sekitar.",
				"subtitle": "Beberapa catatan yang paling baru saya tulis. Saya menyimpannya bukan sebagai jawaban final, tetapi sebagai jejak proses belajar.",
			}),
			block("GuruQuote", map[string]any{
				"text":   "Saya tidak ingin website ini hanya menjadi etalase. Saya ingin ia menjadi tempat untuk mengingat apa yang sudah dipelajari — dan apa yang masih perlu diperbaiki.",
				"author": "Ratna Prameswari · catatan mengajar",
			}),
			guruFooter(),
		},
	)
}

// -------- Profil --------

func guruProfilPage() map[string]any {
	return page("profil", "Profil", false,
		map[string]any{
			"title":       "Profil · Ratna Prameswari",
			"description": "Kenalan lebih dekat dengan Ratna Prameswari, guru Bahasa Indonesia.",
		},
		[]map[string]any{
			guruStyleBlock(),
			guruNav("profil"),
			block("GuruRubricHero", map[string]any{
				"eyebrow":  "Profil",
				"title":    "Mengajar adalah cara saya terus belajar.",
				"subtitle": "Saya Ratna Prameswari, guru Bahasa Indonesia. Saya tertarik pada literasi, sastra, pembelajaran berbasis cerita, dan cara-cara sederhana membuat siswa merasa aman untuk menyampaikan pendapat.",
				"iconKey":  "book",
			}),
			block("GuruProfileCard", map[string]any{
				"image": guruAssetTeacher,
				"name":  "Ratna Prameswari",
				"role":  "Guru Bahasa Indonesia · SMP Nusantara Raya (fiktif)",
				"contacts": []map[string]any{
					{"icon": "📍", "label": "Bandung, Indonesia"},
					{"icon": "✉️", "label": "ratna@rumahguru.id"},
					{"icon": "🌐", "label": "rumahguru.id"},
				},
				"panels": []map[string]any{
					{
						"eyebrow": "Tentang Saya",
						"title":   "Ruang kelas sebagai ruang tumbuh.",
						"body":    "Selama lebih dari satu dekade, saya belajar bahwa mengajar bukan hanya memindahkan pengetahuan. Ia juga tentang mendengar, memberi ruang, dan membantu siswa menemukan bahasa untuk menjelaskan apa yang mereka pikirkan. Website ini saya gunakan untuk mendokumentasikan proses itu: praktik yang berhasil, hal yang tidak berjalan sesuai rencana, bacaan yang mengubah cara pandang, dan pertanyaan yang belum saya temukan jawabannya.",
					},
					{
						"title": "Nilai yang saya pegang",
						"body":  "Keingintahuan lebih penting daripada terlihat selalu benar. Bahasa dapat menjadi jembatan, bukan sekadar mata pelajaran. Dan setiap pengalaman di kelas layak direnungkan agar tidak hilang begitu saja.",
					},
				},
			}),
			block("GuruTagList", map[string]any{
				"title": "Fokus & minat",
				"tags":  []string{"Literasi", "Bahasa Indonesia", "Sastra", "Refleksi Mengajar", "Budaya Nusantara", "Diskusi Kelas"},
			}),
			block("GuruTimeline", map[string]any{
				"title": "Jejak mengajar",
				"items": []map[string]any{
					{"date": "2014—2018", "title": "Guru Bahasa Indonesia", "desc": "Mengembangkan kebiasaan jurnal membaca dan presentasi buku."},
					{"date": "2019—2023", "title": "Koordinator program literasi sekolah", "desc": "Mendampingi klub baca, pojok literasi, dan lokakarya menulis sederhana."},
					{"date": "2024—Kini", "title": "Guru & pembelajar", "desc": "Fokus pada dokumentasi praktik baik dan percakapan antarguru."},
				},
			}),
			guruFooter(),
		},
	)
}

// -------- Rubrik pribadi (5 halaman) --------

// guruRubrikPage helper — struktur konsisten untuk 5 rubrik.
// `articles` parameter di-drop karena block sekarang dynamic (fetch dari DB).
// Data awal disediakan lewat seedSampleGuru saat site dibuat dari template.
func guruRubrikPage(slug, title, eyebrow, subtitle, iconKey string, _ []map[string]any, topics []string) map[string]any {
	sidebarLinks := []map[string]any{
		{"label": "Ceritaku", "href": "/ceritaku"},
		{"label": "Bacaanku", "href": "/bacaanku"},
		{"label": "Inspirasiku", "href": "/inspirasiku"},
		{"label": "Bangsaku", "href": "/bangsaku"},
		{"label": "Peradaban", "href": "/peradaban"},
	}
	return page(slug, title, false,
		map[string]any{
			"title":       title + " · Ratna Prameswari",
			"description": subtitle,
		},
		[]map[string]any{
			guruStyleBlock(),
			guruNav(slug),
			block("GuruRubricHero", map[string]any{
				"eyebrow":  eyebrow,
				"title":    title,
				"subtitle": subtitle,
				"iconKey":  iconKey,
			}),
			// Dynamic — fetch artikel rubric ini dari DB.
			block("GuruArticleGridDynamic", map[string]any{
				"rubric":       slug,
				"sidebarTitle": "Tentang rubrik",
				"sidebarBody":  "Semua tulisan awal template ini adalah contoh. Ubah, tambah, atau hapus dari dashboard.",
				"sidebarTags":  topics,
				"sidebarLinks": sidebarLinks,
			}),
			guruFooter(),
		},
	)
}

func guruCeritakuPage() map[string]any {
	return guruRubrikPage(
		"ceritaku", "Ceritaku",
		"Rubrik pribadi",
		"Cerita keseharian, pengalaman mengajar, dan refleksi pribadi yang tetap dikaitkan dengan Bahasa Indonesia sebagai mata pelajaran yang saya ampu.",
		"book",
		[]map[string]any{
			{"title": "Hati-hati dengan Spasi", "excerpt": "Sebuah spasi yang salah menjadi pintu masuk untuk membicarakan bagaimana tanda kecil dapat mengubah cara kita membaca dan memahami kalimat.", "meta": "Ceritaku · 2 Sep 2026", "engagement": "1.248 views · 18 tanggapan", "featured": true, "href": "/ceritaku"},
			{"title": "Ketika Siswa Menemukan Makna dalam Cerpen", "excerpt": "Dari jawaban yang berbeda-beda, kami belajar bahwa membaca bukan sekadar mencari satu jawaban yang dianggap paling benar.", "meta": "Ceritaku · 3 Sep 2026", "engagement": "734 views · 11 tanggapan", "coverVariant": "red", "href": "/ceritaku"},
			{"title": "Belajar Menulis Pembuka yang Tidak Membosankan", "excerpt": "Satu latihan kecil: lima menit menulis kalimat pertama yang membuat pembaca ingin bertahan.", "meta": "Ceritaku · 4 Sep 2026", "engagement": "512 views · 8 tanggapan", "coverVariant": "sage", "href": "/ceritaku"},
			{"title": "Dari Salah Tanda Baca Jadi Obrolan Bermakna", "excerpt": "Kesalahan di papan tulis justru membuka percakapan tentang jeda, nada, dan maksud penulis.", "meta": "Ceritaku · 5 Sep 2026", "engagement": "389 views · 6 tanggapan", "coverVariant": "gold", "href": "/ceritaku"},
		},
		[]string{"Pendidikan", "Literasi", "Refleksi", "Indonesia"},
	)
}

func guruBacaankuPage() map[string]any {
	return guruRubrikPage(
		"bacaanku", "Bacaanku",
		"Rubrik pribadi",
		"Buku yang saya baca, tandai, dan bawa kembali ke ruang kelas. Catatan singkat, kutipan yang menempel di ingatan, dan cara buku ini menjadi bahan diskusi bersama siswa.",
		"bookmark",
		[]map[string]any{
			{"title": "Membaca Lagi Laskar Pelangi", "excerpt": "Apa yang berubah ketika buku ini dibaca dari sudut pandang guru, bukan pembaca umum?", "meta": "Bacaanku · 2 Sep 2026", "featured": true, "href": "/bacaanku"},
			{"title": "Chairil Anwar dan Kata yang Tidak Sopan", "excerpt": "Kelas puisi bisa dimulai dari satu kata yang mengejutkan — dan berakhir pada percakapan tentang keberanian menulis jujur.", "meta": "Bacaanku · 3 Sep 2026", "coverVariant": "red", "href": "/bacaanku"},
			{"title": "Bumi Manusia sebagai Bacaan Bersama", "excerpt": "Membaca Pramoedya di kelas SMP — cara memilih bab yang bisa memantik diskusi tanpa membuat siswa merasa jauh.", "meta": "Bacaanku · 4 Sep 2026", "coverVariant": "sage", "href": "/bacaanku"},
			{"title": "Buku Kecil, Ide Besar", "excerpt": "Tiga buku tipis yang memberi saya cara baru menjelaskan hal sederhana kepada siswa yang mudah bosan.", "meta": "Bacaanku · 5 Sep 2026", "coverVariant": "gold", "href": "/bacaanku"},
		},
		[]string{"Sastra", "Novel", "Puisi", "Ulasan Buku"},
	)
}

func guruInspirasikuPage() map[string]any {
	return guruRubrikPage(
		"inspirasiku", "Inspirasiku",
		"Rubrik pribadi",
		"Praktik baik, ide sederhana, dan orang-orang yang menyalakan semangat mengajar. Kadang inspirasi datang bukan dari teori besar, tetapi dari percakapan singkat di ruang guru.",
		"sparkle",
		[]map[string]any{
			{"title": "Kelas Kecil, Perubahan Besar", "excerpt": "Cerita tentang guru desa yang mengubah cara siswa memandang buku, bermodal satu rak dan konsistensi.", "meta": "Inspirasiku · 2 Sep 2026", "featured": true, "href": "/inspirasiku"},
			{"title": "Rutinitas Membaca yang Sederhana", "excerpt": "15 menit sebelum pelajaran dimulai — bagaimana kebiasaan kecil ini mengubah suasana kelas selama satu semester.", "meta": "Inspirasiku · 3 Sep 2026", "coverVariant": "red", "href": "/inspirasiku"},
			{"title": "Guru sebagai Pembelajar", "excerpt": "Refleksi dari sebuah lokakarya: yang paling saya bawa pulang justru bukan materi, tapi cara berbicara antarguru.", "meta": "Inspirasiku · 4 Sep 2026", "coverVariant": "sage", "href": "/inspirasiku"},
			{"title": "Satu Pertanyaan yang Mengubah Kelas", "excerpt": "Kadang cukup satu pertanyaan sederhana untuk membuat siswa berhenti dan mulai memikirkan jawabannya sendiri.", "meta": "Inspirasiku · 5 Sep 2026", "coverVariant": "gold", "href": "/inspirasiku"},
		},
		[]string{"Praktik Baik", "Guru", "Motivasi", "Refleksi"},
	)
}

func guruBangsakuPage() map[string]any {
	return guruRubrikPage(
		"bangsaku", "Bangsaku",
		"Rubrik tematik",
		"Belajar Indonesia lewat gotong royong, keberagaman, tanggung jawab, keadilan, dan bahasa. Catatan tentang bagaimana pelajaran kewargaan bisa terasa dekat, bukan sekadar hafalan.",
		"flag",
		[]map[string]any{
			{"title": "Gotong Royong yang Bukan Slogan", "excerpt": "Contoh kecil dari kelas: bagaimana pembagian tugas yang adil membuat proyek kelompok terasa milik semua orang.", "meta": "Bangsaku · 2 Sep 2026", "featured": true, "href": "/bangsaku"},
			{"title": "Berbeda Tetap Bertetangga", "excerpt": "Diskusi keberagaman berangkat dari cerita siswa tentang tetangga, bukan dari definisi buku teks.", "meta": "Bangsaku · 3 Sep 2026", "coverVariant": "red", "href": "/bangsaku"},
			{"title": "Bahasa yang Merangkul", "excerpt": "Bagaimana pilihan kata dalam percakapan sehari-hari mencerminkan cara kita memperlakukan orang lain.", "meta": "Bangsaku · 4 Sep 2026", "coverVariant": "sage", "href": "/bangsaku"},
			{"title": "Tanggung Jawab yang Bisa Dilatih", "excerpt": "Tanggung jawab bukan lahir dari ceramah, tetapi dari kebiasaan kecil yang konsisten dijalankan bersama.", "meta": "Bangsaku · 5 Sep 2026", "coverVariant": "gold", "href": "/bangsaku"},
		},
		[]string{"Kewargaan", "Keberagaman", "Gotong Royong", "Keadilan"},
	)
}

func guruPeradabanPage() map[string]any {
	return guruRubrikPage(
		"peradaban", "Peradaban",
		"Rubrik tematik",
		"Membaca sejarah, budaya, dan warisan sebagai percakapan antargenerasi. Catatan yang menghubungkan pelajaran hari ini dengan jejak yang sudah lama ditinggalkan.",
		"temple",
		[]map[string]any{
			{"title": "Jejak Aksara dalam Perjalanan Nusantara", "excerpt": "Membaca aksara sebagai ingatan yang hidup — bukan sekadar simbol di halaman buku sejarah.", "meta": "Peradaban · 2 Sep 2026", "featured": true, "href": "/peradaban"},
			{"title": "Cerita Rakyat sebagai Bahan Ajar", "excerpt": "Bagaimana dongeng lama tetap relevan untuk membicarakan tema-tema besar di kelas SMP.", "meta": "Peradaban · 3 Sep 2026", "coverVariant": "red", "href": "/peradaban"},
			{"title": "Warisan yang Tidak Selalu Terlihat", "excerpt": "Bahasa daerah, kebiasaan makan, cara menyapa — warisan datang dalam bentuk yang sering kita anggap biasa.", "meta": "Peradaban · 4 Sep 2026", "coverVariant": "sage", "href": "/peradaban"},
			{"title": "Membaca Museum sebagai Guru", "excerpt": "Kunjungan ke museum yang berubah dari tugas menjadi obrolan tentang cara kita menyimpan ingatan bersama.", "meta": "Peradaban · 5 Sep 2026", "coverVariant": "gold", "href": "/peradaban"},
		},
		[]string{"Sejarah", "Budaya", "Nusantara", "Warisan"},
	)
}

// -------- Forum Diskusi --------

func guruForumDiskusiPage() map[string]any {
	return page("forum-diskusi", "Forum Diskusi", false,
		map[string]any{
			"title":       "Forum Diskusi · Ratna Prameswari",
			"description": "Ruang interaksi guru, siswa, orang tua, dan pembaca.",
		},
		[]map[string]any{
			guruStyleBlock(),
			guruNav("forum-diskusi"),
			block("GuruRubricHero", map[string]any{
				"eyebrow":  "Ruang interaksi",
				"title":    "Forum Diskusi",
				"subtitle": "Tempat guru, siswa, orang tua, dan pembaca berinteraksi tentang materi pelajaran, pengalaman, isu aktual, maupun topik sederhana. Percakapan pada template ini ditampilkan dengan prinsip moderasi.",
				"iconKey":  "chat",
			}),
			// Dynamic — fetch thread rubric=forum-diskusi dari DB.
			block("GuruForumThreadListDynamic", map[string]any{
				"moderationNote": map[string]any{
					"badge": "Dimoderasi",
					"title": "Ruang aman untuk berdiskusi",
					"body":  "Tanggapan ditampilkan setelah moderasi. Hindari data pribadi siswa, hormati karya dan sumber, serta fokus pada topik yang sedang dibahas.",
				},
				"participants": []string{"Guru", "Siswa", "Orang tua", "Pembaca"},
				"sidebarLinks": []map[string]any{
					{"label": "Ceritaku", "href": "/ceritaku"},
					{"label": "Bacaanku", "href": "/bacaanku"},
					{"label": "Inspirasiku", "href": "/inspirasiku"},
					{"label": "Peradaban", "href": "/peradaban"},
				},
			}),
			guruFooter(),
		},
	)
}

// -------- Pembelajaran --------

func guruPembelajaranPage() map[string]any {
	sidebarLinks := []map[string]any{
		{"label": "Ceritaku", "href": "/ceritaku"},
		{"label": "Bacaanku", "href": "/bacaanku"},
		{"label": "Inspirasiku", "href": "/inspirasiku"},
		{"label": "Forum Diskusi", "href": "/forum-diskusi"},
	}
	return page("pembelajaran", "Pembelajaran", false,
		map[string]any{
			"title":       "Pembelajaran · Ratna Prameswari",
			"description": "Kumpulan materi Bahasa Indonesia sebagai catatan belajar ringkas.",
		},
		[]map[string]any{
			guruStyleBlock(),
			guruNav("pembelajaran"),
			block("GuruRubricHero", map[string]any{
				"eyebrow":  "Materi",
				"title":    "Pembelajaran",
				"subtitle": "Kumpulan materi Bahasa Indonesia yang saya susun sebagai catatan belajar ringkas, dengan contoh yang dekat dengan penggunaan bahasa sehari-hari.",
				"iconKey":  "book",
			}),
			// Dynamic — fetch materi dari DB.
			block("GuruLearningGridDynamic", map[string]any{
				"sidebarTitle": "Tentang Pembelajaran",
				"sidebarBody":  "Ruang ini berisi materi Bahasa Indonesia yang disusun dalam format ringkas untuk mendukung proses belajar.",
				"sidebarTags":  []string{"Cerpen", "Eksposisi", "Deskripsi", "Ejaan"},
				"sidebarLinks": sidebarLinks,
			}),
			guruFooter(),
		},
	)
}
