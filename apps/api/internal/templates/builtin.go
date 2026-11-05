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
	// Kategori khusus co-branding PANDI × UPI — 1 template spesial untuk guru
	// yang ingin website pribadi bergaya editorial. Standalone, tidak ikut
	// matrix category × variant (buildPages skip cat=="guru-pandi").
	{Key: "guru-pandi", Label: "Guru PANDI × UPI", Description: "Template co-branding PANDI × UPI untuk website pribadi guru — 9 halaman editorial.", Emoji: "✨"},
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
//
// Design rules:
//   - `secondary` MUST be analogous to `primary` (same hue family, ±30° max).
//     Complementary pairs (purple+green, teal+amber) always read "amateur"
//     when rendered as conic-gradient borders / rotating beams.
//   - Modern variants stay saturated but never mix warm+cool.
//   - Professional variants use deeper, less-saturated tones for restraint.
func palette(cat, v string) map[string]string {
	type p struct{ primary, secondary, bg, fg string }
	table := map[string]map[string]p{
		"school": {
			"modern":       {"#2563eb", "#3b82f6", "#ffffff", "#0f172a"}, // blue analogous
			"clean":        {"#475569", "#64748b", "#ffffff", "#1e293b"}, // slate analogous
			"professional": {"#1e3a8a", "#1e40af", "#fafaf9", "#1c1917"}, // deep blue analogous
		},
		"umkm": {
			"modern":       {"#ea580c", "#c2410c", "#fffbf5", "#1f2937"}, // burnt orange analogous
			"clean":        {"#059669", "#047857", "#ffffff", "#064e3b"}, // deep green analogous
			"professional": {"#92400e", "#78350f", "#fafaf9", "#1c1917"}, // artisan amber analogous
		},
		"portfolio": {
			"modern":       {"#6366f1", "#4f46e5", "#0f172a", "#f8fafc"}, // indigo analogous (was purple+pink)
			"clean":        {"#0f172a", "#475569", "#ffffff", "#0f172a"}, // grayscale
			"professional": {"#1e3a8a", "#1e40af", "#ffffff", "#0f172a"}, // deep blue analogous
		},
		"teacher": {
			"modern":       {"#7c3aed", "#6d28d9", "#ffffff", "#111827"}, // violet analogous (was purple+green clash)
			"clean":        {"#059669", "#047857", "#ffffff", "#064e3b"}, // deep green analogous (was green+lime)
			"professional": {"#9f1239", "#881337", "#fffbeb", "#1f1209"}, // rose analogous (was red+amber)
		},
		"blog": {
			"modern":       {"#b91c1c", "#991b1b", "#ffffff", "#111827"}, // deep editorial red analogous
			"clean":        {"#111827", "#374151", "#ffffff", "#111827"}, // grayscale
			"professional": {"#1e3a8a", "#1e40af", "#fffbf5", "#1c1917"}, // deep blue analogous (was blue+amber)
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

// BuiltinTemplates returns 15 matrix templates (5 categories × 3 variants) plus
// standalone co-branded templates (guru-pandi-upi). Total = 16.
//
// The matrix loop skips category "guru-pandi" — it's a standalone template
// with 1 variant only (pandi-upi), appended manually below with dedicated
// editorial styling from the PANDI × UPI mockup.
func BuiltinTemplates() []BuiltinTemplate {
	out := make([]BuiltinTemplate, 0, len(Categories)*len(Variants)+1)
	for _, c := range Categories {
		// Standalone categories tidak ikut matrix — di-append manual di bawah.
		if c.Key == "guru-pandi" {
			continue
		}
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
	// Standalone co-branded template — PANDI × UPI teacher editorial.
	out = append(out, guruPandiUPITemplate())
	return out
}

// buildPages dispatches to per-category page builders. Pages share the same
// structure across variants of one category — only copy tone changes via copyFor.
// Variant is threaded so the HOME page can pick variant-specific Pro blocks.
func buildPages(cat, variant string) []map[string]any {
	cv := copyFor(variant)
	switch cat {
	case "school":
		return schoolPages(cv, variant)
	case "umkm":
		return umkmPages(cv, variant)
	case "portfolio":
		return portfolioPages(cv, variant)
	case "teacher":
		return teacherPages(cv, variant)
	case "blog":
		return blogPages(cv, variant)
	}
	return nil
}

// --- helper for page tree shorthand ---

func block(typ string, props map[string]any) map[string]any {
	return map[string]any{"type": typ, "props": props}
}

// containerBlock returns a Container primitive with the given children — used
// to build sectioned layouts in professional templates.
func containerBlock(gap string, children []map[string]any) map[string]any {
	return map[string]any{
		"type":     "Container",
		"props":    map[string]any{"gap": gap},
		"children": children,
	}
}

// columnsBlock returns a Columns primitive (N-column grid) with children
// distributed round-robin across columns by the renderer.
func columnsBlock(colCount int, gap string, children []map[string]any) map[string]any {
	return map[string]any{
		"type":     "Columns",
		"props":    map[string]any{"columns": colCount, "gap": gap},
		"children": children,
	}
}

// =============================================================================
// PRO block composition helpers — used by the "professional home" of every
// template so the starter site feels like a real product landing page, not a
// tutorial demo. Each helper picks the Pro block that best matches a variant
// so the modern/clean/professional distinction is visible on first render.
// =============================================================================

type heroCopy struct {
	Eyebrow, Title, Subtitle string
	Highlight, TitleAfter    string // used by HighlightHero
	CTA, CTAHref             string
	CTA2, CTA2Href           string
}

// proHero picks a Pro hero block for the variant:
//
//	modern       → AuroraHero (animated gradient blobs)
//	clean        → HighlightHero (marker-highlight key word)
//	professional → LampHero (top light cone, formal)
func proHero(variant string, c heroCopy) map[string]any {
	switch variant {
	case "clean":
		return block("HighlightHero", map[string]any{
			"title":      c.Title,
			"highlight":  c.Highlight,
			"titleAfter": c.TitleAfter,
			"subtitle":   c.Subtitle,
			"ctaLabel":   c.CTA,
			"ctaHref":    c.CTAHref,
		})
	case "professional":
		return block("LampHero", map[string]any{
			"title":    c.Title + " " + c.Highlight + " " + c.TitleAfter,
			"subtitle": c.Subtitle,
			"ctaLabel": c.CTA,
			"ctaHref":  c.CTAHref,
		})
	}
	// modern default
	return block("AuroraHero", map[string]any{
		"eyebrow":  c.Eyebrow,
		"title":    c.Title + " " + c.Highlight + " " + c.TitleAfter,
		"subtitle": c.Subtitle,
		"ctaLabel": c.CTA,
		"ctaHref":  c.CTAHref,
	})
}

// proFeatureGrid picks a Pro feature block per variant. All three use
// on-hover interactions only — no always-running conic-gradient borders
// (which turned 6 cards × rotating primary/secondary into visual chaos
// when combined with hero + CTA animations elsewhere on the page).
//
//	modern       → HoverGlowGrid (radial glow follows hover)
//	clean        → TiltCardGrid  (subtle 3D tilt on hover)
//	professional → HoverGlowGrid (calmer radial glow)
func proFeatureGrid(variant, title string, items []map[string]any) map[string]any {
	typ := "HoverGlowGrid"
	if variant == "clean" {
		typ = "TiltCardGrid"
	}
	return block(typ, map[string]any{"title": title, "items": items})
}

// proFinalCTA — the "convert now" strip at the bottom of the page.
// Always CTABanner (classic + static). Previously modern used
// MovingBorderCTA (rotating conic button), which — combined with
// the hero + BorderBeamCard — made the page feel like a carnival.
// Keeping ONE animated element (the hero) is enough wow.
func proFinalCTA(variant, title, subtitle, ctaLabel, ctaHref string) map[string]any {
	_ = variant // kept in signature for future variant-specific copy
	return block("CTABanner", map[string]any{
		"title":    title,
		"subtitle": subtitle,
		"ctaLabel": ctaLabel,
		"ctaHref":  ctaHref,
	})
}

// trustBar — logo marquee wrapped in a comment so users understand what to
// replace. Empty (no brand names) skips the block entirely.
func trustBar(headline string, brands []string) map[string]any {
	top := make([]map[string]any, 0, len(brands))
	bot := make([]map[string]any, 0, len(brands))
	half := (len(brands) + 1) / 2
	for i, b := range brands {
		item := map[string]any{"name": b}
		if i < half {
			top = append(top, item)
		} else {
			bot = append(bot, item)
		}
	}
	// Fallback: if all in top, mirror to bottom so both rows animate.
	if len(bot) == 0 {
		bot = top
	}
	return block("InfiniteMarqueeLogos", map[string]any{
		"title":       headline,
		"itemsTop":    top,
		"itemsBottom": bot,
	})
}

// statsRow — AnimatedCounterStats convenience.
func statsRow(title string, stats []map[string]any) map[string]any {
	return block("AnimatedCounterStats", map[string]any{
		"title": title,
		"items": stats,
	})
}

// proTestimonials — CardStackShowcase (3 quotes max — more become visual noise).
func proTestimonials(title string, items []map[string]any) map[string]any {
	if len(items) > 3 {
		items = items[:3]
	}
	return block("CardStackShowcase", map[string]any{"title": title, "items": items})
}

// =============================================================================
// SUB-PAGE helpers — sub pages (profil, program, kontak, dst.) should feel
// consistent with home but lighter. Different hero than home so the "landing"
// tetap istimewa.
// =============================================================================

// subHero — DotPatternSection with title + subtitle. Konsisten across
// sub-pages, tidak steal thunder dari home hero.
func subHero(title, subtitle string) map[string]any {
	return block("DotPatternSection", map[string]any{
		"title":    title,
		"subtitle": subtitle,
	})
}

// processSteps — 3-step process block for how-it-works flows.
func processSteps(title string, steps []map[string]any) map[string]any {
	return block("ProcessSteps", map[string]any{
		"title": title,
		"items": steps,
	})
}

// pageFAQ — FAQ block with question/answer pairs.
func pageFAQ(title string, items []map[string]any) map[string]any {
	return block("FAQ", map[string]any{
		"title": title,
		"items": items,
	})
}

// contactBlock — ContactForm with sensible defaults for Indonesian sites.
func contactBlock(title, subtitle string) map[string]any {
	return block("ContactForm", map[string]any{
		"title":    title,
		"subtitle": subtitle,
		"ctaLabel": "Kirim Pesan",
	})
}

// socialBlock — social links row.
func socialBlock(items []map[string]any) map[string]any {
	return block("SocialLinks", map[string]any{
		"title": "Terhubung dengan kami",
		"items": items,
	})
}

// mapBlock — Map placeholder for kontak pages.
func mapBlock(title string) map[string]any {
	return block("Map", map[string]any{"title": title})
}

// teamBlock — TeamGrid convenience.
func teamBlock(title string, members []map[string]any) map[string]any {
	return block("TeamGrid", map[string]any{"title": title, "items": members})
}

// timelineBlock — vertical timeline for history sections.
func timelineBlock(title string, items []map[string]any) map[string]any {
	return block("Timeline", map[string]any{"title": title, "items": items})
}

// featureSideBlock — side-by-side feature (image + text) alternating.
func featureSideBlock(items []map[string]any) map[string]any {
	return block("FeatureSide", map[string]any{"items": items})
}

// simpleCTA — small CTA banner used at bottom of sub-pages.
func simpleCTA(title, subtitle, ctaLabel, ctaHref string) map[string]any {
	return block("CTABanner", map[string]any{
		"title":    title,
		"subtitle": subtitle,
		"ctaLabel": ctaLabel,
		"ctaHref":  ctaHref,
	})
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

func schoolPages(cv variantCopy, variant string) []map[string]any {
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
			proHero(variant, heroCopy{
				Eyebrow:    "PPDB 2025/2026 · Kuota terbatas",
				Title:      "Mendidik generasi",
				Highlight:  "unggul & berkarakter",
				TitleAfter: "sejak dini.",
				Subtitle:   "Kurikulum Merdeka, guru bersertifikat, dan fasilitas modern — semua yang dibutuhkan anak Anda untuk tumbuh percaya diri dan siap menghadapi dunia.",
				CTA:        "Daftar PPDB Sekarang",
				CTAHref:    "#daftar",
			}),
			// Nama organisasi FIKTIF — sampel tidak boleh mengklaim afiliasi
			// institusi nyata (Kemendikbud dkk.) sebelum user menggantinya.
			trustBar("Dipercaya oleh lebih dari 3.000 keluarga sejak 2005", []string{
				"Yayasan Cahaya Ilmu", "Forum Sekolah Nusantara", "Klub Literasi Anak",
				"Liga Matematika Pelajar", "Komunitas STEM Muda", "Jaringan Sekolah Hijau",
				"Festival Sains Pelajar", "Sanggar Seni Pelangi", "Asosiasi Guru Inovatif",
			}),
			statsRow("Angka yang berbicara", []map[string]any{
				{"value": "20", "label": "Tahun pengalaman"},
				{"value": "3.200", "label": "Alumni sukses"},
				{"value": "85%", "label": "Diterima PTN/luar negeri"},
				{"value": "4.9/5", "label": "Rating orang tua"},
			}),
			proFeatureGrid(variant, "Mengapa keluarga memilih kami", []map[string]any{
				{"title": "Kurikulum Merdeka +", "desc": "Berbasis projek, literasi digital, dan pengembangan karakter — dilengkapi bahasa Inggris & coding sejak SD."},
				{"title": "Guru bersertifikat", "desc": "100% tenaga pendidik bersertifikat dengan rata-rata pengalaman mengajar 10 tahun. Rasio guru:siswa 1:15."},
				{"title": "Fasilitas modern", "desc": "Lab komputer, lab sains, perpustakaan, lapangan indoor & outdoor, semua ruang kelas ber-AC."},
				{"title": "Lokasi strategis", "desc": "5 menit dari stasiun, area parkir luas, jalur antar-jemput menuju 12 titik area sekitar."},
				{"title": "15+ ekstrakurikuler", "desc": "Robotika, paskibra, futsal, paduan suara, seni tari, karya ilmiah remaja, dan banyak lagi."},
				{"title": "Alumni berprestasi", "desc": "85% diterima di PTN top (UI, ITB, UGM) atau universitas luar negeri (NUS, Monash, RMIT)."},
			}),
			block("BentoGrid", map[string]any{
				"title": "Tiga jalur belajar — pilih yang cocok untuk anak Anda",
				"items": []map[string]any{
					{"title": "Kelas Reguler", "desc": "Kurikulum Nasional + bahasa Inggris & coding intensif.", "size": "large"},
					{"title": "Kelas Bilingual", "desc": "Dwibahasa Indonesia/Inggris — persiapan sekolah internasional.", "size": "wide"},
					{"title": "Kelas Akselerasi", "desc": "Percepatan untuk siswa berbakat istimewa (CIBI)."},
					{"title": "Home Visit", "desc": "Kunjungan guru ke rumah setiap semester."},
					{"title": "Konseling", "desc": "Psikolog anak siap 5 hari/minggu."},
				},
			}),
			proTestimonials("Cerita dari keluarga kami", []map[string]any{
				{"quote": "Anak saya berkembang pesat sejak masuk Sekolah ABC. Gurunya sabar, komunikasi dengan orang tua sangat baik, dan kurikulumnya membentuk karakter — bukan cuma nilai akademis.", "name": "Ibu Sari Wijaya", "role": "Orang tua siswa kelas 5"},
				{"quote": "Sekolah yang membentuk saya lebih dari akademis. Skill diskusi, kepemimpinan, dan public speaking yang saya dapat di sini sangat berguna waktu kuliah di UI.", "name": "Andi Prasetyo", "role": "Alumni 2022 — Ilmu Komputer UI"},
				{"quote": "Fasilitas top, guru care, dan yang paling penting: anak saya SUKA sekolah. Nggak pernah ngeluh berangkat, malah minta ekstra ekstrakurikuler.", "name": "Bapak Doni Hartono", "role": "Orang tua siswa kelas 8"},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Program PPDB Early Bird",
				"subtitle": "Gelombang 1 · sampai 31 Januari",
				"price":    "Rp 1.500.000",
				"period":   "biaya pendaftaran (diskon 40%)",
				"ctaLabel": "Daftar sekarang",
				"ctaHref":  "#daftar",
				"bullets": []map[string]any{
					{"text": "Diskon uang pangkal 20% (nilai s.d. Rp 8 juta)"},
					{"text": "Prioritas placement di kelas favorit"},
					{"text": "Free tes minat bakat & konsultasi psikolog"},
					{"text": "Kaos & starter kit sekolah gratis"},
					{"text": "Refund 100% jika batal sebelum 15 Feb"},
				},
			}),
			block("FAQ", map[string]any{
				"title": "Pertanyaan yang sering ditanyakan",
				"items": []map[string]any{
					{"question": "Berapa biaya sekolah per bulan?", "answer": "SPP mulai dari Rp 1,2 juta/bulan tergantung jenjang. Termasuk buku, seragam, dan snack pagi."},
					{"question": "Apakah ada beasiswa?", "answer": "Ya — beasiswa akademik (25–100%), beasiswa non-akademik (olahraga/seni), dan beasiswa dhuafa. Silakan hubungi bagian PPDB."},
					{"question": "Bagaimana proses PPDB-nya?", "answer": "1) Isi formulir online, 2) Bayar biaya pendaftaran, 3) Tes minat bakat + wawancara orang tua, 4) Pengumuman dalam 7 hari kerja."},
					{"question": "Ada jalur antar-jemput?", "answer": "Ada — 12 titik area sekitar sekolah. Biaya terpisah, ada opsi carter (private) atau shuttle (shared)."},
				},
			}),
			proFinalCTA(variant,
				"Siap mengantar putra-putri Anda ke sekolah masa depan?",
				"Kuota terbatas 60 siswa per angkatan. Daftar sekarang — early bird berakhir 31 Januari.",
				"Daftar PPDB · Gratis konsultasi",
				"#daftar",
			),
			footer,
		},
	)

	profil := page("profil", "Profil", false,
		map[string]any{"title": "Profil Sekolah ABC", "description": "Visi, misi, sejarah, dan tim di balik Sekolah ABC."},
		[]map[string]any{
			nav,
			subHero("Profil Sekolah ABC",
				"Berdiri sejak 1995, melayani generasi muda dengan dedikasi penuh. Sudah 30 tahun mempersiapkan alumni yang berkarakter."),
			statsRow("Perjalanan singkat kami", []map[string]any{
				{"value": "30", "label": "Tahun mengajar"},
				{"value": "3.200", "label": "Alumni sukses"},
				{"value": "800", "label": "Siswa aktif"},
				{"value": "57", "label": "Tenaga pendidik"},
			}),
			block("Section", map[string]any{
				"title": "Sejarah singkat",
				"body":  "Sekolah ABC didirikan pada tahun 1995 oleh sekelompok pendidik dengan visi mencetak generasi muda yang **berkarakter, kritis, dan siap menghadapi dunia**.\n\nBerawal dari satu gedung sederhana dengan 60 siswa, kini Sekolah ABC telah berkembang menjadi institusi pendidikan terpercaya dengan lebih dari 800 siswa aktif dari TK hingga SMP.",
			}),
			timelineBlock("30 tahun perjalanan", []map[string]any{
				{"date": "1995", "title": "Sekolah didirikan dengan 60 siswa & 8 guru"},
				{"date": "2005", "title": "Ekspansi jenjang SMP + fasilitas lab lengkap"},
				{"date": "2015", "title": "Akreditasi A untuk semua jenjang"},
				{"date": "2020", "title": "Program dwibahasa + partnership Cambridge Assessment"},
				{"date": "2025", "title": "Alumni ke-3.200 lulus — mayoritas ke PTN top"},
			}),
			proFeatureGrid(variant, "Visi & misi kami", []map[string]any{
				{"title": "Visi", "desc": "Menjadi sekolah unggulan yang menghasilkan generasi cerdas, berkarakter, dan siap menghadapi tantangan global."},
				{"title": "Misi akademik", "desc": "Menyelenggarakan pendidikan berkualitas dengan kurikulum berstandar internasional (Cambridge + Kurikulum Merdeka)."},
				{"title": "Misi karakter", "desc": "Menanamkan nilai-nilai moral, etika, dan kearifan budaya Indonesia dalam setiap aspek pembelajaran."},
				{"title": "Misi individu", "desc": "Mengembangkan potensi unik setiap siswa lewat konsultasi individual, tes minat bakat, dan program mentoring."},
			}),
			teamBlock("Tim kepemimpinan", []map[string]any{
				{"name": "Dr. Ahmad Wijaya, M.Pd.", "role": "Kepala Sekolah · sejak 2018", "image": ""},
				{"name": "Ibu Siti Nurhaliza, S.Pd.", "role": "Wakil Kepala Akademik", "image": ""},
				{"name": "Bapak Joko Susilo, M.Si.", "role": "Wakil Kepala Kesiswaan", "image": ""},
				{"name": "Ibu Rina Anggraeni, M.Psi.", "role": "Koordinator Psikologi", "image": ""},
			}),
			block("BentoGrid", map[string]any{
				"title": "Empat pilar nilai yang kami pegang",
				"items": []map[string]any{
					{"title": "Integritas", "desc": "Jujur dan bertanggung jawab dalam setiap tindakan — di kelas, di lapangan, di rumah.", "size": "large"},
					{"title": "Inovasi", "desc": "Selalu mencari cara yang lebih baik untuk belajar dan mengajar."},
					{"title": "Inklusi", "desc": "Pendidikan untuk semua tanpa memandang latar belakang.", "size": "wide"},
					{"title": "Kolaborasi", "desc": "Bekerja sama membangun komunitas belajar yang positif."},
				},
			}),
			simpleCTA("Tertarik gabung keluarga Sekolah ABC?", "PPDB 2025/2026 sudah dibuka — kuota terbatas.", "Daftar PPDB", "#daftar"),
			footer,
		},
	)

	program := page("program", "Program", false,
		map[string]any{"title": "Program Akademik — Sekolah ABC", "description": "Tingkat pendidikan, kurikulum, dan ekstrakurikuler."},
		[]map[string]any{
			nav,
			subHero("Program akademik unggulan",
				"Program pendidikan yang dirancang untuk mengembangkan potensi maksimal setiap siswa — dari TK hingga SMP."),
			proFeatureGrid(variant, "Tiga jenjang pendidikan", []map[string]any{
				{"title": "TK / PAUD (3–6 th)", "desc": "Fokus motorik, sosialisasi, dan pengenalan dasar membaca-berhitung melalui bermain. Rasio guru:siswa 1:8."},
				{"title": "SD (Kelas 1–6)", "desc": "Pondasi akademik kuat dengan pendekatan tematik + integratif Kurikulum Merdeka. Bahasa Inggris intensif dari kelas 1."},
				{"title": "SMP (Kelas 7–9)", "desc": "Pendalaman materi + coding, bahasa Inggris dwibahasa, dan program persiapan masuk SMA top."},
			}),
			block("Section", map[string]any{
				"title": "Kurikulum Merdeka + Cambridge",
				"body":  "Kami menggunakan **Kurikulum Merdeka** sebagai basis + **Cambridge Assessment** untuk pengukuran internasional. Setiap mata pelajaran ditujukan untuk mengembangkan 6 dimensi Pelajar Pancasila:\n\n- Beriman, bertakwa, berakhlak mulia\n- Berkebinekaan global\n- Bergotong-royong\n- Mandiri\n- Bernalar kritis\n- Kreatif",
			}),
			proFeatureGrid(variant, "Mata pelajaran unggulan", []map[string]any{
				{"title": "Bahasa Inggris", "desc": "5 jam/minggu dengan native speaker untuk kelas atas. Sertifikasi Cambridge YLE/KET di akhir jenjang."},
				{"title": "Coding & Robotika", "desc": "Pengenalan logika pemrograman dari kelas 4 SD. Scratch → Python → Arduino."},
				{"title": "Karakter & Kepemimpinan", "desc": "Program khusus untuk membangun soft skill: public speaking, teamwork, resilience."},
				{"title": "Seni & Olahraga", "desc": "Eksplorasi minat lewat 15+ pilihan ekskul — semuanya rutin tampil di event."},
				{"title": "Sains Aplikatif", "desc": "Eksperimen mingguan di lab, kunjungan ke pabrik/museum, project sains akhir semester."},
				{"title": "Well-being", "desc": "Sesi mindfulness mingguan + konsultasi psikolog setiap kali dibutuhkan."},
			}),
			block("BentoGrid", map[string]any{
				"title": "15+ ekstrakurikuler — cari passion kamu",
				"items": []map[string]any{
					{"title": "Robotika", "desc": "Juara nasional 2023 & 2024", "size": "large"},
					{"title": "Futsal & Basket", "desc": "Latihan rutin + kompetisi"},
					{"title": "Paduan Suara", "desc": "Tampil di kompetisi kota", "size": "wide"},
					{"title": "Pramuka", "desc": "Wajib kls 4–9"},
					{"title": "Seni Lukis", "desc": "Ekspresi kreatif"},
					{"title": "Olimpiade", "desc": "Mat/IPA/Bahasa"},
				},
			}),
			simpleCTA("Ingin lihat langsung kelas kami?", "Booking tour sekolah + trial class 1 hari untuk anak Anda — gratis.", "Booking tour", "#kunjungan"),
			footer,
		},
	)

	galeri := page("galeri", "Galeri", false,
		map[string]any{"title": "Galeri Kegiatan — Sekolah ABC", "description": "Momen dari kegiatan belajar, ekstrakurikuler, dan kebersamaan."},
		[]map[string]any{
			nav,
			subHero("Galeri kegiatan sekolah",
				"Momen-momen berharga dari kegiatan belajar, ekstrakurikuler, dan kebersamaan di Sekolah ABC."),
			block("Gallery", map[string]any{
				"title": "Kegiatan terbaru",
				"items": []map[string]any{
					{"image": "", "caption": "Hari Kemerdekaan · 17 Agustus 2024"},
					{"image": "", "caption": "Pentas Seni · Desember 2024"},
					{"image": "", "caption": "Field Trip Museum · November 2024"},
					{"image": "", "caption": "Olimpiade Matematika · Oktober 2024"},
					{"image": "", "caption": "Wisuda Kelas 6 · Juni 2024"},
					{"image": "", "caption": "Perpisahan · Juni 2024"},
					{"image": "", "caption": "Robotics Fair · Mei 2024"},
					{"image": "", "caption": "Pekan Buku · April 2024"},
				},
			}),
			proTestimonials("Cerita di balik foto", []map[string]any{
				{"quote": "Anak saya dulu pemalu banget. Setelah 2 tahun ikut pentas seni & pramuka, sekarang dia yang paling percaya diri di kelas. Perubahannya kelihatan banget.", "name": "Ibu Marina", "role": "Orang tua siswa kelas 6"},
				{"quote": "Field trip ke museum bikin saya sadar sejarah Indonesia keren banget. Sejak itu saya suka baca buku sejarah — dulu paling males.", "name": "Rafi Ahmad", "role": "Siswa kelas 8"},
				{"quote": "Robotika 2 tahun di ABC bikin saya lolos ke jurusan Teknik Robotika UI. Skill teamwork & problem-solving dari kompetisi itu sangat berharga.", "name": "Naya Cahaya", "role": "Alumni 2023"},
			}),
			simpleCTA("Ingin mengunjungi sekolah langsung?", "Kami terbuka untuk kunjungan calon orang tua siswa. Jadwal tour setiap Rabu & Sabtu.", "Booking kunjungan", "#kunjungan"),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak Sekolah ABC", "description": "Alamat, telepon, email, dan jam operasional."},
		[]map[string]any{
			nav,
			subHero("Hubungi kami",
				"Kami siap menjawab pertanyaan tentang pendaftaran, kurikulum, atau hal lainnya. Rata-rata respon dalam 3 jam kerja."),
			block("IconList", map[string]any{
				"title": "Informasi lengkap",
				"items": []map[string]any{
					{"icon": "📍", "text": "Jl. Pendidikan No. 1, Kelurahan Maju, Kecamatan Sejahtera, Kota Bahagia 12345"},
					{"icon": "📞", "text": "(021) 1234-5678 · WhatsApp: 0812-3456-7890"},
					{"icon": "✉", "text": "info@sekolahabc.sch.id · ppdb@sekolahabc.sch.id"},
					{"icon": "🕒", "text": "Senin–Jumat 07.00–16.00 · Sabtu 08.00–12.00"},
					{"icon": "🚌", "text": "Dekat halte Trans · parkir luas · layanan antar-jemput ke 12 titik area sekitar"},
				},
			}),
			contactBlock("Kirim pesan langsung",
				"Isi form di bawah — tim admin kami akan membalas dalam 3 jam kerja."),
			mapBlock("Lokasi sekolah"),
			socialBlock([]map[string]any{
				{"platform": "Instagram"},
				{"platform": "Facebook"},
				{"platform": "YouTube"},
				{"platform": "TikTok"},
				{"platform": "WhatsApp"},
			}),
			pageFAQ("Pertanyaan yang sering ditanyakan", []map[string]any{
				{"question": "Apa syarat pendaftaran?"},
				{"question": "Berapa biaya SPP per bulan?"},
				{"question": "Apakah ada beasiswa?"},
				{"question": "Bagaimana sistem antar-jemput?"},
				{"question": "Apakah bisa observasi kelas dulu?"},
			}),
			footer,
		},
	)

	return []map[string]any{home, profil, program, galeri, kontak}
}

// ---------------- UMKM ----------------

func umkmPages(cv variantCopy, variant string) []map[string]any {
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
			proHero(variant, heroCopy{
				Eyebrow:    "GRATIS ongkir · min. belanja Rp 100.000",
				Title:      "Produk UMKM asli Indonesia,",
				Highlight:  "langsung dari pengrajin",
				TitleAfter: "ke meja Anda.",
				Subtitle:   "Belanja praktis lewat WhatsApp. Dikirim dari dapur artisan lokal — tanpa perantara, harga adil untuk kedua pihak.",
				CTA:        "Order via WhatsApp",
				CTAHref:    "https://wa.me/6281234567890",
			}),
			trustBar("Sudah dipercaya lebih dari 12.000 pelanggan di seluruh Indonesia", []string{
				"Pasar Kriya Nusantara", "Festival Pangan Lokal", "Bazar Akhir Pekan",
				"Komunitas UMKM Naik Kelas", "Galeri Oleh-Oleh", "Koperasi Rasa Nusantara",
				"Klub Jajan Lokal", "Pesta Kuliner Kota", "Dapur Kota",
			}),
			statsRow("Kepercayaan yang tumbuh setiap tahun", []map[string]any{
				{"value": "12.000+", "label": "Pelanggan setia"},
				{"value": "150+", "label": "Kota di Indonesia"},
				{"value": "45+", "label": "Produk artisan"},
				{"value": "4.9/5", "label": "Rating pelanggan"},
			}),
			proFeatureGrid(variant, "Kenapa pelanggan pilih kami", []map[string]any{
				{"title": "100% bahan lokal", "desc": "Kami membeli langsung dari petani dan pengrajin dengan harga adil — bukan sekedar reseller."},
				{"title": "QC ketat", "desc": "Setiap produk dicek higienitas + rasa sebelum dikirim. Tidak lolos? Tidak keluar dari gudang."},
				{"title": "Kirim same-day", "desc": "Jabodetabek same-day (order sebelum 14.00), luar Jabodetabek 1–3 hari via JNE/J&T/SiCepat."},
				{"title": "CS ramah", "desc": "Tim CS aktif via WhatsApp 08.00–21.00, respon rata-rata <5 menit di jam kerja."},
				{"title": "Packaging premium", "desc": "Setiap paket dibungkus rapi + kartu ucapan gratis. Cocok untuk hampers atau hadiah."},
				{"title": "Ramah lingkungan", "desc": "Kemasan biodegradable + program pickup box kosong untuk pelanggan langganan."},
			}),
			block("ProductGridDynamic", map[string]any{
				"title": "Best seller bulan ini",
				"limit": 6,
			}),
			proTestimonials("Kata pelanggan setia kami", []map[string]any{
				{"quote": "Rasanya enak banget, pengirimannya cepat. Packaging rapi dan ada kartu ucapan — jadi ide hampers lebaran keluarga. Sudah jadi langganan tetap!", "name": "Sari Wijaya", "role": "Jakarta · 6 bulan langganan"},
				{"quote": "Sudah langganan 6 bulan, kualitas konsisten — nggak pernah kecewa. CS-nya juga ramah kalau saya tanya-tanya soal produk baru.", "name": "Budi Prasetyo", "role": "Surabaya · reseller"},
				{"quote": "Awalnya coba karena rekomendasi teman, sekarang malah gue yang rekomendasiin ke semua orang. Sambalnya juara, kopinya bikin nagih.", "name": "Dini Rahayu", "role": "Bandung · foodie"},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Paket Langganan Bulanan",
				"subtitle": "Rasa baru setiap bulan · bisa cancel kapan saja",
				"price":    "Rp 249.000",
				"period":   "/bulan (hemat Rp 60.000 vs beli satuan)",
				"ctaLabel": "Coba 1 bulan",
				"ctaHref":  "https://wa.me/6281234567890?text=Halo,%20saya%20mau%20coba%20paket%20langganan",
				"bullets": []map[string]any{
					{"text": "4 produk artisan pilihan chef setiap bulan"},
					{"text": "GRATIS ongkir seluruh Indonesia"},
					{"text": "Prioritas rilis produk baru (1 minggu lebih awal)"},
					{"text": "Voucher belanja Rp 25.000 setiap bulan"},
					{"text": "Cancel/pause kapan saja tanpa penalti"},
				},
			}),
			block("Section", map[string]any{
				"title": "Promo Spesial Bulan Ini",
				"body":  "**GRATIS ongkir** untuk pembelian minimal Rp 100.000.\n**Diskon 10%** untuk pelanggan baru — pakai kode `WELCOME10`.\n**Beli 3 gratis 1** untuk produk pilihan setiap hari Jumat!",
			}),
			proFinalCTA(variant,
				"Yuk mulai belanja dari pengrajin lokal.",
				"Chat CS kami sekarang, kami bantu pilih produk yang cocok untuk Anda.",
				"Chat WhatsApp CS",
				"https://wa.me/6281234567890",
			),
			footer,
		},
	)

	produk := page("produk", "Produk", false,
		map[string]any{"title": "Katalog Produk — Toko Bahagia", "description": "Semua produk UMKM asli — makanan, kopi, kerajinan."},
		[]map[string]any{
			nav,
			subHero("Katalog produk kami",
				"Telusuri semua produk UMKM asli Indonesia. Klik produk untuk detail dan pemesanan langsung via WhatsApp."),
			block("ProductGridDynamic", map[string]any{
				"title": "",
				"limit": 24,
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Pesanan Grosir / Hampers",
				"subtitle": "Untuk event, kantor, atau reseller",
				"price":    "Mulai Rp 3 juta",
				"period":   "min. order 50 pcs · custom packaging",
				"ctaLabel": "Chat penawaran",
				"ctaHref":  "https://wa.me/6281234567890?text=Halo,%20saya%20mau%20info%20grosir",
				"bullets": []map[string]any{
					{"text": "Diskon 20–35% dari harga eceran"},
					{"text": "Custom packaging + kartu ucapan brand Anda"},
					{"text": "Pengiriman terjadwal (bisa batch mingguan)"},
					{"text": "PIC dedicated untuk pesanan berulang"},
				},
			}),
			pageFAQ("Pertanyaan produk", []map[string]any{
				{"question": "Berapa lama masa simpan produk?"},
				{"question": "Ada produk halal-certified?"},
				{"question": "Bisa custom rasa / packaging?"},
				{"question": "Minimum order berapa?"},
			}),
			simpleCTA("Butuh rekomendasi produk?",
				"Chat CS kami — kami bantu pilih produk yang cocok untuk hadiah, hampers, atau konsumsi harian.",
				"Chat WhatsApp",
				"https://wa.me/6281234567890"),
			footer,
		},
	)

	tentang := page("tentang", "Tentang Kami", false,
		map[string]any{"title": "Tentang Toko Bahagia", "description": "Cerita, misi, dan komitmen kami mendukung UMKM Indonesia."},
		[]map[string]any{
			nav,
			subHero("Cerita di balik Toko Bahagia",
				"Dimulai dari dapur kecil di Bekasi, kini telah dipercaya lebih dari 12.000 pelanggan di 150+ kota."),
			statsRow("Perjalanan kami — 5 tahun bersama UMKM lokal", []map[string]any{
				{"value": "12.000+", "label": "Pelanggan setia"},
				{"value": "30+", "label": "UMKM mitra"},
				{"value": "45+", "label": "Produk artisan"},
				{"value": "150+", "label": "Kota terjangkau"},
			}),
			block("Section", map[string]any{
				"title": "Awal mula",
				"body":  "Toko Bahagia berdiri tahun 2020 dari **hobi memasak** yang berkembang jadi bisnis keluarga. Berawal dari produk keripik singkong yang dijual ke tetangga, kini kami menjadi mitra resmi lebih dari 30 pengrajin UMKM di Jawa.\n\nVisi kami sederhana: **membantu produk UMKM lokal lebih dikenal** sambil memberi pelanggan akses ke produk berkualitas dengan harga adil untuk kedua pihak.",
			}),
			timelineBlock("5 tahun perjalanan", []map[string]any{
				{"date": "2020", "title": "Toko Bahagia lahir dari dapur rumah di Bekasi"},
				{"date": "2021", "title": "Ekspansi ke marketplace + kemitraan 10 UMKM"},
				{"date": "2022", "title": "Pindah ke workshop 200m² + tim 8 orang"},
				{"date": "2024", "title": "12.000 pelanggan tetap + paket langganan launched"},
				{"date": "2025", "title": "Program pemberdayaan 30+ UMKM mitra"},
			}),
			proFeatureGrid(variant, "Komitmen kami", []map[string]any{
				{"title": "Mendukung UMKM", "desc": "Kami membayar pengrajin di atas harga pasar dan membantu mereka naik kelas via training + branding."},
				{"title": "Bahan pilihan", "desc": "Hanya bahan terbaik yang dipilih. Kalau kami sendiri tidak mau makan, tidak akan kami jual."},
				{"title": "Standar keamanan", "desc": "Semua produk diproduksi dengan standar higienitas BPOM. Tanpa pengawet berbahaya."},
				{"title": "Ramah lingkungan", "desc": "Kemasan biodegradable + program pickup box untuk pelanggan langganan."},
				{"title": "Harga adil", "desc": "Margin kami tetap tipis — biar produk terjangkau + pengrajin dapat bagian layak."},
				{"title": "Logistik teruji", "desc": "5 mitra ekspedisi + QC packaging sebelum kirim — sudah 99.7% zero-complaint."},
			}),
			proTestimonials("Kata tim kami sendiri", []map[string]any{
				{"quote": "Kami percaya produk lokal Indonesia tidak kalah dengan produk impor. Misi kami adalah membuktikan itu setiap hari — satu paket, satu review 5-bintang, satu pengrajin yang naik kelas.", "name": "Nadia Putri", "role": "Founder Toko Bahagia"},
				{"quote": "Yang bikin kami beda dari toko UMKM lain: kami tinggal 30 menit dari lokasi produksi. Kalau ada complaint pelanggan, saya bisa langsung ketemu pengrajin hari itu juga.", "name": "Ari Susilo", "role": "Head of Operations"},
				{"quote": "Melihat pengrajin kopi kami sekarang punya rumah baru dari hasil langganan bulanan kami — itu yang bikin kerja ini worth it, bukan angka omzet.", "name": "Bu Rini Astuti", "role": "Community Manager"},
			}),
			simpleCTA("Ingin bergabung sebagai mitra UMKM?",
				"Kami rutin buka slot untuk pengrajin baru. Kirim contoh produk + cerita brand kamu.",
				"Ajukan kemitraan",
				"mailto:partnership@tokobahagia.id"),
			footer,
		},
	)

	caraPesan := page("cara-pesan", "Cara Pesan", false,
		map[string]any{"title": "Cara Pesan — Toko Bahagia", "description": "3 langkah mudah pemesanan via WhatsApp."},
		[]map[string]any{
			nav,
			subHero("Pesan dalam 3 langkah",
				"Kami sengaja bikin sederhana — nggak perlu bikin akun, nggak perlu install app. Cukup WhatsApp."),
			processSteps("Alur pemesanan", []map[string]any{
				{"title": "Pilih produk", "desc": "Buka halaman Produk, catat nama & jumlah."},
				{"title": "Chat WhatsApp", "desc": "Kirim format pesanan + alamat ke CS."},
				{"title": "Transfer & tunggu", "desc": "CS konfirmasi total, bayar, kirim 1-3 hari."},
			}),
			block("Section", map[string]any{
				"title": "Format pesanan copy-paste",
				"body":  "```\nHalo kak, mau pesan:\n• [Nama Produk 1] – [Jumlah]\n• [Nama Produk 2] – [Jumlah]\n\nAlamat lengkap:\n[Nama penerima]\n[No HP aktif]\n[Alamat + kode pos]\n```\n\nKirim ke: **0812-3456-7890** (WA)",
			}),
			proFeatureGrid(variant, "Metode pembayaran", []map[string]any{
				{"title": "Transfer bank", "desc": "BCA, Mandiri, BRI, BNI — nomor rekening dikirim setelah konfirmasi order."},
				{"title": "E-wallet", "desc": "GoPay, OVO, DANA, ShopeePay — auto-verify via nomor unik."},
				{"title": "COD (bayar di tempat)", "desc": "Tersedia untuk Jabodetabek dengan minimum order Rp 200.000."},
				{"title": "Invoice / PO", "desc": "Untuk pesanan corporate / instansi. Term of payment negotiable."},
			}),
			block("Section", map[string]any{
				"title": "Pengiriman & pengembalian",
				"body":  "Kami bekerja sama dengan **JNE, J&T, SiCepat, Anteraja, GoSend, GrabExpress**. Estimasi tiba:\n\n- **Jabodetabek**: same-day (order sebelum 14.00) atau next-day\n- **Jawa**: 1–3 hari kerja\n- **Luar Jawa**: 3–7 hari kerja\n\nJika produk rusak atau salah kirim, hubungi kami dalam **24 jam** — **penggantian gratis** tanpa repot.",
			}),
			pageFAQ("FAQ pemesanan", []map[string]any{
				{"question": "Ada biaya packing tambahan?"},
				{"question": "Bisa pilih ekspedisi sendiri?"},
				{"question": "Kalau alamat salah?"},
				{"question": "Bisa refund kalau tidak sesuai?"},
				{"question": "Apakah bisa kirim ke luar negeri?"},
			}),
			simpleCTA("Siap coba produk kami?",
				"Order pertama? Pakai kode WELCOME10 untuk diskon 10% pembelian pertama.",
				"Chat WhatsApp CS",
				"https://wa.me/6281234567890"),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Hubungi Toko Bahagia", "description": "Chat WA, DM Instagram, atau kunjungi workshop kami."},
		[]map[string]any{
			nav,
			subHero("Hubungi kami",
				"Punya pertanyaan? Tim kami siap membantu setiap hari. Rata-rata respon <5 menit di jam kerja."),
			block("IconList", map[string]any{
				"title": "Cara menghubungi",
				"items": []map[string]any{
					{"icon": "📱", "text": "WhatsApp: 0812-3456-7890 (respon ~5 menit)"},
					{"icon": "📸", "text": "Instagram: @tokobahagia — DM aktif"},
					{"icon": "✉", "text": "Email: halo@tokobahagia.id (partnership & grosir)"},
					{"icon": "📞", "text": "Telepon: (021) 1234-5678 · Sen-Jum 09.00–17.00"},
					{"icon": "📍", "text": "Workshop: Jl. UMKM Maju No. 88, Bekasi (kunjungan by appt)"},
					{"icon": "🕒", "text": "Jam operasional: Sen–Sab 08.00–21.00 · Min 10.00–18.00"},
				},
			}),
			contactBlock("Kirim pesan langsung",
				"Untuk pertanyaan non-urgent — kami balas via email dalam 3 jam kerja."),
			mapBlock("Workshop kami di Bekasi"),
			socialBlock([]map[string]any{
				{"platform": "WhatsApp"},
				{"platform": "Instagram"},
				{"platform": "TikTok"},
				{"platform": "Shopee"},
				{"platform": "Tokopedia"},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Program Reseller",
				"subtitle": "Margin sampai 35% · dukungan marketing lengkap",
				"price":    "Modal awal Rp 500rb",
				"period":   "· starter kit + akun reseller",
				"ctaLabel": "Info program reseller",
				"ctaHref":  "https://wa.me/6281234567890?text=Halo,%20saya%20mau%20info%20reseller",
				"bullets": []map[string]any{
					{"text": "Margin 25–35% dari setiap produk"},
					{"text": "Free training marketing + copywriting"},
					{"text": "Foto produk siap posting (100+ asset)"},
					{"text": "Dropship — nggak perlu stock produk sendiri"},
					{"text": "Support group WhatsApp aktif reseller lain"},
				},
			}),
			footer,
		},
	)

	return []map[string]any{home, produk, tentang, caraPesan, kontak}
}

// ---------------- Portofolio ----------------

func portfolioPages(cv variantCopy, variant string) []map[string]any {
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
			proHero(variant, heroCopy{
				Eyebrow:    "Tersedia untuk project baru · Q3 2025",
				Title:      "Saya bantu bisnis Anda",
				Highlight:  "tumbuh lewat produk digital",
				TitleAfter: "yang benar-benar dipakai.",
				Subtitle:   "Web Developer & Designer dari Jakarta. 5+ tahun membangun aplikasi web yang cepat, indah, dan mudah dipakai — untuk startup hingga enterprise.",
				CTA:        "Lihat project saya",
				CTAHref:    "/project",
			}),
			trustBar("Klien saya termasuk:", []string{
				"Arunika Studio", "PayNusa", "Lentera Analytics", "EduPintar",
				"SehatDiri", "Nusantara Logistik", "RuangArsip", "Kopi Tetangga", "TaniMaju",
			}),
			statsRow("5 tahun · angka yang saya banggakan", []map[string]any{
				{"value": "37", "label": "Project shipped"},
				{"value": "24", "label": "Klien puas"},
				{"value": "12M+", "label": "Users menggunakan"},
				{"value": "100%", "label": "On-time delivery"},
			}),
			proFeatureGrid(variant, "Apa yang saya kerjakan", []map[string]any{
				{"title": "Frontend Development", "desc": "Aplikasi React/Next.js dengan UI modern, performa optimal (Lighthouse >95), dan accessible."},
				{"title": "Backend Development", "desc": "REST API dengan Go/Node.js, integrasi database Postgres/Redis, autentikasi JWT/OAuth, deployment Docker+K8s."},
				{"title": "UI/UX Design", "desc": "Desain interface yang clean, intuitif, dan memprioritaskan kebutuhan user. Figma → code seamless."},
				{"title": "Mobile-Responsive", "desc": "Setiap aplikasi dibangun mobile-first — tested di iOS Safari, Chrome Android, dan browser desktop."},
				{"title": "Performance Audit", "desc": "Audit performa aplikasi existing, optimasi bundle size, caching strategy, dan database queries."},
				{"title": "Security Review", "desc": "Review OWASP top-10 vulnerabilities, secure coding practices, dan hardening deployment."},
			}),
			block("BentoGrid", map[string]any{
				"title": "Project pilihan",
				"items": []map[string]any{
					{"title": "Web Builder SaaS", "desc": "Multi-tenant platform · 500+ active users · Next.js + Go", "size": "large"},
					{"title": "E-commerce UMKM", "desc": "50+ merchant · payment gateway · Rp 2M GMV/bulan", "size": "wide"},
					{"title": "Dashboard Analytics", "desc": "Realtime · <100ms latency · ClickHouse"},
					{"title": "LMS", "desc": "5.000+ siswa aktif"},
					{"title": "Klinik Digital", "desc": "Rekam medis + jadwal dokter"},
				},
			}),
			block("Section", map[string]any{
				"title": "Cara saya bekerja",
				"body":  "Saya percaya **komunikasi** adalah 80% keberhasilan project. Alurnya:\n\n1. **Discovery** — diskusi mendalam soal goal, user, dan constraint (waktu, budget, teknis).\n2. **Rapid prototype** — mockup Figma dalam 3–5 hari sebelum sebaris kode ditulis.\n3. **Sprint mingguan** — demo setiap Jumat, feedback loop cepat.\n4. **Ship + monitor** — deploy production, saya standby untuk 2 minggu bug-fix gratis.",
			}),
			proTestimonials("Kata klien saya", []map[string]any{
				{"quote": "Hasil kerjanya melebihi ekspektasi. Komunikasi smooth, deadline tepat, dan kode-nya rapi banget. Kami sudah lanjut ke project ke-3.", "name": "Andi Pratama", "role": "CEO, TechCorp"},
				{"quote": "Sangat profesional. Tidak hanya bisa coding, tapi juga ngerti bisnis dan sering kasih saran strategis yang menghemat kami puluhan juta.", "name": "Rina Setyawan", "role": "Founder, StartupID"},
				{"quote": "Kalau semua developer Indonesia kayak dia, kita nggak perlu hire dari luar. Detail-oriented, on-time, dan proaktif komunikasi kalau ada blocker.", "name": "Dedi Kurniawan", "role": "CTO, PayNusa"},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Paket Fixed-Price MVP",
				"subtitle": "Cocok untuk validasi ide startup",
				"price":    "Rp 45 juta",
				"period":   "· timeline 4–6 minggu",
				"ctaLabel": "Diskusi lebih lanjut",
				"ctaHref":  "/kontak",
				"bullets": []map[string]any{
					{"text": "Discovery workshop + user research (1 minggu)"},
					{"text": "Design system + high-fidelity Figma"},
					{"text": "Full-stack MVP (Next.js + Go + Postgres)"},
					{"text": "Deploy production + custom domain + SSL"},
					{"text": "2 minggu warranty bug-fix pasca launch"},
				},
			}),
			proFinalCTA(variant,
				"Punya ide product yang mau di-eksekusi?",
				"Slot Q3 2025 tinggal 2 project. Diskusi 30 menit gratis untuk explore fit.",
				"Book jadwal diskusi",
				"/kontak",
			),
			footer,
		},
	)

	project := page("project", "Project", false,
		map[string]any{"title": "Project Saya — Portfolio", "description": "Kumpulan project terbaik dari 5 tahun karir sebagai developer."},
		[]map[string]any{
			nav,
			subHero("Project pilihan",
				"Kumpulan project terbaik dari 5 tahun karir sebagai developer. Klik untuk detail studi kasus, tech stack, dan outcome."),
			statsRow("Angka yang saya kerjakan", []map[string]any{
				{"value": "37", "label": "Project shipped"},
				{"value": "12M+", "label": "Users total"},
				{"value": "24", "label": "Klien puas"},
				{"value": "8", "label": "Industri berbeda"},
			}),
			block("BentoGrid", map[string]any{
				"title": "Web Applications — client work",
				"items": []map[string]any{
					{"title": "E-commerce UMKM", "desc": "50+ merchant · Rp 2M GMV/bulan · Next.js + Stripe", "size": "large"},
					{"title": "Dashboard Analytics", "desc": "Realtime · <100ms · React + Go + ClickHouse", "size": "wide"},
					{"title": "LMS Platform", "desc": "5.000+ siswa · Next.js + Node"},
					{"title": "Sistem Klinik", "desc": "Rekam medis · Vue + Laravel"},
					{"title": "Fintech MVP", "desc": "OJK sandbox · Go + Postgres"},
				},
			}),
			proFeatureGrid(variant, "Open source & side projects", []map[string]any{
				{"title": "go-utils", "desc": "Library Go untuk helper umum. 250+ stars di GitHub, dipakai oleh 30+ project."},
				{"title": "Personal Blog Generator", "desc": "Static site generator untuk blog teknis (Markdown → HTML statis, kompilasi <500ms)."},
				{"title": "Tailwind Component Kit", "desc": "Collection 40+ komponen UI siap pakai. 1.000+ downloads NPM."},
				{"title": "Realtime chat starter", "desc": "Full-stack template WebSocket chat dengan presence + typing indicator."},
				{"title": "Landing page templates", "desc": "10+ template SaaS landing gratis — pakai stack Next.js + Tailwind."},
				{"title": "Testing helpers", "desc": "Playwright helpers untuk visual regression testing + auth flow."},
			}),
			proTestimonials("Apa kata klien lama", []map[string]any{
				{"quote": "Detail-oriented, on-time, komunikatif. Saya sudah hire dev freelance banyak, tapi ini yang paling profesional. Direkomendasikan.", "name": "Andi Pratama", "role": "CEO TechCorp · client sejak 2022"},
				{"quote": "Yang paling saya suka: dia tidak asal terima brief. Selalu kasih pushback kalau ada solusi lebih murah/simple. Save budget kami puluhan juta.", "name": "Rina Setyawan", "role": "Founder StartupID"},
				{"quote": "Kualitas kode-nya rapi banget — 2 tahun kemudian tim internal kami masih bisa maintain tanpa kesulitan. Rare untuk freelance dev.", "name": "Dedi Kurniawan", "role": "CTO PayNusa"},
			}),
			simpleCTA("Tertarik berkolaborasi?",
				"Slot Q3 2025 tinggal 2 project. Book call discovery 30-menit gratis.",
				"Book jadwal diskusi",
				"/kontak"),
			footer,
		},
	)

	layanan := page("layanan", "Layanan", false,
		map[string]any{"title": "Layanan — Nama Saya", "description": "Web development, aplikasi custom, e-commerce, dan konsultasi."},
		[]map[string]any{
			nav,
			subHero("Layanan yang saya tawarkan",
				"Solusi web development untuk berbagai kebutuhan bisnis. Fixed-price untuk scope yang jelas, hourly retainer untuk yang ongoing."),
			proFeatureGrid(variant, "6 paket layanan utama", []map[string]any{
				{"title": "Website Bisnis", "desc": "Landing page + halaman produk + SEO basic. Mulai Rp 5jt · lead time 2 minggu."},
				{"title": "Web Aplikasi Custom", "desc": "Full-stack aplikasi web fungsional dengan database & autentikasi. Mulai Rp 15jt · 1–3 bulan."},
				{"title": "E-commerce", "desc": "Toko online lengkap dengan payment gateway + inventory. Mulai Rp 25jt · 6 minggu."},
				{"title": "Maintenance & fix", "desc": "Update fitur, bug fix, optimasi performa. Per jam Rp 500rb atau retainer bulanan."},
				{"title": "UI/UX Redesign", "desc": "Perbaikan tampilan aplikasi existing. Wireframe → high-fidelity Figma → code."},
				{"title": "Konsultasi & mentoring", "desc": "Sesi 1-on-1 untuk arsitektur, code review, atau career advice. Rp 1jt/jam."},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Paket MVP Fixed-Price",
				"subtitle": "Cocok untuk validasi ide startup",
				"price":    "Rp 45 juta",
				"period":   "· timeline 4–6 minggu · fixed price no surprise",
				"ctaLabel": "Book discovery call",
				"ctaHref":  "/kontak",
				"bullets": []map[string]any{
					{"text": "Discovery workshop + user research (1 minggu)"},
					{"text": "Design system + high-fidelity Figma (1 minggu)"},
					{"text": "Full-stack MVP (Next.js + Go + Postgres, 3 minggu)"},
					{"text": "Deploy production + custom domain + SSL"},
					{"text": "2 minggu warranty bug-fix pasca launch"},
					{"text": "1 bulan support 5 hari/minggu (email + WA)"},
				},
			}),
			processSteps("Cara saya bekerja", []map[string]any{
				{"title": "Discovery", "desc": "Call 30 menit gratis untuk explore fit."},
				{"title": "Sprint mingguan", "desc": "Demo tiap Jumat, feedback loop cepat."},
				{"title": "Ship + warranty", "desc": "Deploy production + 2 minggu bug-fix."},
			}),
			proFeatureGrid(variant, "Stack yang sering saya pakai", []map[string]any{
				{"title": "Frontend", "desc": "React, Next.js, Tailwind, TypeScript, shadcn/ui, Framer Motion."},
				{"title": "Backend", "desc": "Go (Fiber/Gin), Node.js (Express/Fastify), Python (FastAPI)."},
				{"title": "Database", "desc": "PostgreSQL, MySQL, MongoDB, Redis, ClickHouse, SQLite."},
				{"title": "DevOps", "desc": "Docker, Kubernetes, GitHub Actions, AWS, Vercel, Cloudflare."},
			}),
			pageFAQ("Pertanyaan yang sering ditanyakan", []map[string]any{
				{"question": "Bisa kerja on-site atau harus remote?"},
				{"question": "Apakah ada garansi setelah launch?"},
				{"question": "Bagaimana pembayaran?"},
				{"question": "Kalau scope berubah di tengah project?"},
				{"question": "Bisa join tim internal jangka panjang?"},
			}),
			simpleCTA("Punya project yang mau dieksekusi?",
				"Book discovery call 30 menit — gratis, tanpa komitmen.",
				"Book sekarang",
				"/kontak"),
			footer,
		},
	)

	tentang := page("tentang", "Tentang", false,
		map[string]any{"title": "Tentang Saya", "description": "Cerita, pengalaman, dan hal di luar coding."},
		[]map[string]any{
			nav,
			subHero("Tentang saya",
				"Developer, designer, dan eternal learner. Berbasis di Jakarta, kerja dengan klien dari Indonesia sampai Australia."),
			block("Section", map[string]any{
				"title": "Cerita singkat",
				"body":  "Saya mulai ngoding tahun **2018** saat masih kuliah jurusan Teknik Informatika. Dimulai dari hobi bikin website iseng, sekarang sudah 5+ tahun jadi full-time developer di berbagai project remote.\n\nSaya percaya **teknologi terbaik adalah yang membuat hidup orang lebih mudah, bukan lebih rumit**. Karenanya saya selalu fokus pada kesederhanaan dan user experience — bukan showoff tech stack.",
			}),
			timelineBlock("Perjalanan karir", []map[string]any{
				{"date": "2018", "title": "Mulai ngoding sambil kuliah Teknik Informatika"},
				{"date": "2020", "title": "Freelance web dev — websites & tools UMKM"},
				{"date": "2022", "title": "Full-Stack Developer @ Local Startup (E-commerce)"},
				{"date": "2023", "title": "Senior Full-Stack @ Remote (B2B SaaS US company)"},
				{"date": "2025", "title": "Independent consultant — 24 klien puas & berkembang"},
			}),
			proFeatureGrid(variant, "Prinsip kerja", []map[string]any{
				{"title": "Ship > perfect", "desc": "Perfect adalah musuh done. Saya prefer ship v1 lalu iterasi berdasarkan feedback real user."},
				{"title": "Over-communicate", "desc": "Silence itu red flag. Kalau ada blocker, saya kasih tahu HARI ITU juga — bukan Jumat sore."},
				{"title": "Bisnis dulu, tech kedua", "desc": "Saya mikir ROI project sebelum pilih tech stack. Bukan sebaliknya."},
				{"title": "Terus belajar", "desc": "1 jam/hari untuk baca / eksperimen tech baru. Kalau sudah 3 bulan nggak belajar, saya panic."},
			}),
			block("BentoGrid", map[string]any{
				"title": "Selain coding",
				"items": []map[string]any{
					{"title": "Fotografi", "desc": "Street photography weekend — Instagram @namasaya.photo · 40+ kota", "size": "large"},
					{"title": "Gaming", "desc": "RPG & indie games", "size": "wide"},
					{"title": "Membaca", "desc": "Sci-fi, bisnis, psychology"},
					{"title": "Berbagi", "desc": "Mentor komunitas dev lokal"},
					{"title": "Lari", "desc": "5K/week · half-marathon 2024"},
				},
			}),
			simpleCTA("Ingin ngobrol tech / karir?",
				"Saya sesekali buka slot mentoring gratis untuk junior dev. Follow LinkedIn saya untuk update slot.",
				"Follow LinkedIn",
				"https://linkedin.com/in/namasaya"),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak — Nama Saya", "description": "Book jadwal call, kirim email, atau follow di social."},
		[]map[string]any{
			nav,
			subHero("Mari berkolaborasi 🤝",
				"Saya selalu terbuka untuk diskusi project, kerja sama, atau sekadar ngobrol soal teknologi. Rata-rata respon <24 jam."),
			block("IconList", map[string]any{
				"title": "Cara menghubungi",
				"items": []map[string]any{
					{"icon": "✉", "text": "hello@namasaya.com — respon dalam 24 jam"},
					{"icon": "💼", "text": "linkedin.com/in/namasaya — profile + endorsement + article"},
					{"icon": "🐙", "text": "github.com/namasaya — 30+ open source contributions"},
					{"icon": "🐦", "text": "@namasaya di X — thoughts & tech updates"},
					{"icon": "📱", "text": "0812-3456-7890 (WA — urgent only please)"},
					{"icon": "📍", "text": "Jakarta, Indonesia · remote & onsite (Jabodetabek)"},
				},
			}),
			contactBlock("Mulai project? Isi form ini",
				"Berikan brief singkat + timeline + budget range. Saya reply dengan proposal + jadwal discovery call dalam 24 jam."),
			socialBlock([]map[string]any{
				{"platform": "LinkedIn"},
				{"platform": "GitHub"},
				{"platform": "Twitter"},
				{"platform": "Instagram"},
				{"platform": "YouTube"},
			}),
			pageFAQ("FAQ collab", []map[string]any{
				{"question": "Bisa kerja sebagai part-time?"},
				{"question": "Rate/jam berapa?"},
				{"question": "Ada NDA/kontrak yang formal?"},
				{"question": "Bisa remote lintas timezone?"},
				{"question": "Bagaimana dengan IP ownership project?"},
			}),
			footer,
		},
	)

	return []map[string]any{home, project, layanan, tentang, kontak}
}

// ---------------- Guru ----------------

func teacherPages(cv variantCopy, variant string) []map[string]any {
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
			proHero(variant, heroCopy{
				Eyebrow:    "Slot kelas privat semester baru dibuka",
				Title:      "Matematika SMA yang",
				Highlight:  "akhirnya masuk akal",
				TitleAfter: "buat kamu.",
				Subtitle:   "15 tahun mengajar matematika, ratusan siswa dari nilai 60 naik ke 90+. Belajar step-by-step dengan analogi sederhana yang bikin kamu ngerti — bukan hafal rumus.",
				CTA:        "Lihat materi gratis",
				CTAHref:    "/materi",
			}),
			// Bidang studi, bukan nama kampus: sampel tidak mengklaim alumni
			// di institusi nyata, dan kampus fiktif justru terlihat palsu.
			trustBar("Alumni saya sekarang di:", []string{
				"Kedokteran", "Teknik Informatika", "Teknik Elektro", "Farmasi",
				"Sekolah Kedinasan", "Politeknik Negeri", "Arsitektur",
				"Kampus Luar Negeri", "Fakultas Hukum",
			}),
			statsRow("15 tahun ngajar — rekapnya:", []map[string]any{
				{"value": "1.200+", "label": "Siswa privat"},
				{"value": "94%", "label": "Lolos PTN top"},
				{"value": "300+", "label": "Materi gratis"},
				{"value": "4.9/5", "label": "Rating siswa"},
			}),
			proFeatureGrid(variant, "Yang akan kamu pelajari", []map[string]any{
				{"title": "Aljabar", "desc": "Dari konsep dasar persamaan linear hingga persiapan Olimpiade OSN/OSP. 25 modul + 100 soal."},
				{"title": "Statistika", "desc": "Probabilitas, distribusi, dan aplikasi di kehidupan nyata (bukan cuma untuk ujian)."},
				{"title": "Kalkulus", "desc": "Limit, turunan, integral — dijelaskan dengan analogi sederhana yang bikin kamu ngerti bukan hafal."},
				{"title": "Geometri", "desc": "Geometri datar, ruang, dan transformasi dengan visualisasi interaktif (bukan cuma gambar 2D di papan)."},
				{"title": "Trigonometri", "desc": "Identitas, persamaan, dan aplikasi di fisika & engineering — cocok yang mau lanjut STEM."},
				{"title": "Soal Olimpiade", "desc": "Latihan soal tingkat OSN/OSP dengan strategi penyelesaian step-by-step."},
			}),
			proTestimonials("Cerita siswa Pak Budi", []map[string]any{
				{"quote": "Awalnya benci matematika, sekarang nilai saya naik dari 60 ke 92 dalam 1 semester. Pak Budi pinter banget jelasinnya step by step — nggak asal kasih rumus.", "name": "Maya Rachman", "role": "Kelas 12 · SMA 8 Jakarta"},
				{"quote": "Berkat Pak Budi, saya lulus SNBT jurusan Teknik Informatika UI. Trik-trik soal PTN yang diajarin bener-bener kepake pas hari-H.", "name": "Andi Wijaya", "role": "Alumni 2023 · Teknik UI"},
				{"quote": "Anak saya jadi lebih percaya diri menghadapi matematika, dan hubungan komunikasi kami membaik karena dia nggak lagi frustrasi tiap PR. Terima kasih, Pak!", "name": "Ibu Rini Sutanto", "role": "Orang tua siswa"},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Kelas Privat 1-on-1",
				"subtitle": "Slot semester baru · terbatas 8 siswa",
				"price":    "Rp 350.000",
				"period":   "/sesi 90 menit · min. 4 sesi/bulan",
				"ctaLabel": "Daftar slot",
				"ctaHref":  "/kontak",
				"bullets": []map[string]any{
					{"text": "Kurikulum dipersonalisasi berdasarkan target & gap"},
					{"text": "Latihan soal dari bank soal 5.000+ (SBMPTN, olimpiade, UN)"},
					{"text": "Recording tiap sesi — bisa diulang kapan saja"},
					{"text": "WhatsApp 24/7 untuk tanya PR di luar jadwal"},
					{"text": "Progress report bulanan dikirim ke orang tua"},
				},
			}),
			block("Section", map[string]any{
				"title": "Materi gratis untuk kamu",
				"body":  "Saya menyediakan **300+ materi belajar GRATIS** untuk siswa SMA:\n\n- Video penjelasan (rata-rata 8 menit — tidak bertele-tele)\n- PDF ringkasan siap-cetak\n- Bank soal dengan pembahasan step-by-step\n- Quiz mini untuk cek pemahaman\n\nKlik halaman **Materi** untuk mulai belajar sekarang!",
			}),
			proFinalCTA(variant,
				"Siap upgrade nilai matematika kamu?",
				"Slot kelas privat semester ini tinggal 3. Booking konsultasi 20 menit gratis dulu — nggak cocok, nggak lanjut.",
				"Book konsultasi gratis",
				"/kontak",
			),
			footer,
		},
	)

	materi := page("materi", "Materi", false,
		map[string]any{"title": "Materi Belajar — Pak Budi"},
		[]map[string]any{
			nav,
			subHero(
				"300+ materi matematika SMA — gratis semua",
				"PDF ringkasan · video 8-menit · latihan soal + pembahasan step-by-step. Dipakai 12.000+ siswa dari seluruh Indonesia setiap bulan.",
			),
			statsRow("Isi library saat ini", []map[string]any{
				{"value": "300+", "label": "Materi PDF"},
				{"value": "180+", "label": "Video penjelasan"},
				{"value": "5.000", "label": "Soal + pembahasan"},
				{"value": "12rb", "label": "Siswa aktif/bulan"},
			}),
			proFeatureGrid(variant, "Materi berdasarkan kelas & topik", []map[string]any{
				{"title": "Aljabar (Kelas 10)", "desc": "Persamaan linear, kuadrat, pertidaksamaan, sistem persamaan. 25 modul + 100 soal dengan pembahasan animasi."},
				{"title": "Trigonometri (Kelas 11)", "desc": "Identitas, persamaan, grafik + aplikasi ke fisika. 20 modul + 80 soal — cocok yang mau lanjut STEM."},
				{"title": "Kalkulus (Kelas 11–12)", "desc": "Limit, turunan, integral. 30 modul + 120 soal. Analogi kehidupan sehari-hari, bukan cuma rumus."},
				{"title": "Statistika & Peluang", "desc": "Distribusi, probabilitas, kombinatorik. 15 modul + 60 soal — sering muncul di UTBK & OSN."},
				{"title": "Geometri Analitik", "desc": "Persamaan garis, lingkaran, parabola, ellips. 18 modul dengan visualisasi Desmos interaktif."},
				{"title": "Persiapan Olimpiade", "desc": "Bank soal OSN/OSP 10 tahun terakhir + strategi penyelesaian dari tim IMO Indonesia."},
			}),
			block("BentoGrid", map[string]any{
				"title": "Learning path yang saya rekomendasikan",
				"items": []map[string]any{
					{"title": "Kelas 10 — Fondasi", "desc": "Aljabar → persamaan → fungsi. 3 bulan konsisten cukup untuk fondasi solid.", "size": "lg"},
					{"title": "Kelas 11 — Trigonometri + Limit", "desc": "Fase transisi yang bikin banyak siswa kesulitan. Wajib pelan-pelan.", "size": "md"},
					{"title": "Kelas 12 — Kalkulus + UTBK", "desc": "Latihan soal HOTS 200+ dengan target skor UTBK 700+.", "size": "md"},
					{"title": "Olimpiade — Extra Track", "desc": "Untuk yang serius kompetisi. Sesi tambahan tiap Sabtu.", "size": "lg"},
				},
			}),
			proTestimonials("Cerita siswa yang pakai materi gratis", []map[string]any{
				{"quote": "Awalnya cuma download PDF gratis Pak Budi buat UTBK. 3 bulan konsisten latihan, skor matematika saya naik dari 480 ke 720. Lulus PTN pilihan pertama!", "name": "Fira Ananda", "role": "Alumni 2024 · Teknik Kimia UGM"},
				{"quote": "Video penjelasannya to-the-point banget. 8 menit tuntas, ga bertele-tele kayak channel lain. Anak saya lebih rajin nonton materi Pak Budi daripada TikTok 😅", "name": "Bapak Herman", "role": "Orang tua siswa kelas 11"},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "Butuh bimbingan lebih personal?",
				"subtitle": "Kelas privat 1-on-1 · slot terbatas",
				"price":    "Rp 350.000",
				"period":   "/sesi 90 menit · min. 4 sesi/bulan",
				"ctaLabel": "Cek jadwal & booking",
				"ctaHref":  "/jadwal",
				"bullets": []map[string]any{
					{"text": "Materi disesuaikan gap & target kamu"},
					{"text": "WhatsApp support 24/7 untuk PR"},
					{"text": "Recording sesi untuk review ulang"},
					{"text": "Progress report bulanan ke orang tua"},
				},
			}),
			pageFAQ("Pertanyaan seputar materi", []map[string]any{
				{"q": "Materinya benar-benar gratis?", "a": "Ya, 100% gratis. Kamu bisa download PDF & akses video YouTube tanpa daftar/bayar. Yang berbayar hanya kelas privat 1-on-1."},
				{"q": "Bagaimana cara download PDF-nya?", "a": "Klik salah satu kategori di atas → pilih modul → tombol Download PDF ada di pojok kanan atas halaman modul."},
				{"q": "Video-nya bahasa apa?", "a": "Semua materi & video 100% berbahasa Indonesia. Sengaja untuk siswa SMA Indonesia yang lebih nyaman belajar dengan bahasa ibu."},
				{"q": "Update materinya seberapa sering?", "a": "Setiap Sabtu saya upload 1 modul baru + 1 video pembahasan soal. Follow Instagram @pakbudi.math untuk notifikasi."},
			}),
			simpleCTA(
				"Mulai belajar sekarang — gratis, tanpa daftar",
				"Klik salah satu kategori di atas, atau follow saya di Instagram untuk update materi mingguan.",
				"Follow @pakbudi.math",
				"#",
			),
			footer,
		},
	)

	jadwal := page("jadwal", "Jadwal Kelas", false,
		map[string]any{"title": "Jadwal Kelas Privat — Pak Budi"},
		[]map[string]any{
			nav,
			subHero(
				"Jadwal kelas semester Ganjil 2026",
				"Pilih tipe kelas + jam yang cocok. Online via Zoom (nasional) atau offline di Jakarta Selatan. Trial gratis 1 sesi untuk siswa baru.",
			),
			statsRow("Kapasitas semester ini", []map[string]any{
				{"value": "8", "label": "Slot privat tersisa"},
				{"value": "3", "label": "Kelas reguler dibuka"},
				{"value": "1", "label": "Kelas olimpiade"},
				{"value": "94%", "label": "Repeat rate siswa"},
			}),
			proFeatureGrid(variant, "Tipe kelas yang tersedia", []map[string]any{
				{"title": "Privat 1-on-1", "desc": "Rp 350.000/sesi 90 menit. Materi & pace disesuaikan 100% kebutuhan kamu. Ideal untuk yang gap-nya spesifik."},
				{"title": "Kelas Reguler (3–5 siswa)", "desc": "Rp 450.000/bulan (8× pertemuan). Belajar bareng teman + latihan soal grup. Value terbaik untuk sekolah reguler."},
				{"title": "Kelas Olimpiade", "desc": "Rp 750.000/bulan (4× pertemuan). Khusus persiapan OSN/OSP + KSN. Kurikulum dari tim IMO."},
				{"title": "Crash Course UTBK", "desc": "Rp 2.500.000 (8× pertemuan intensif). Skor rata-rata siswa naik 150 poin dalam 2 bulan."},
				{"title": "Kelas PR & Konsultasi", "desc": "Rp 200.000/sesi 60 menit. Bahas PR sekolah + persiapan ulangan. Bisa spontan booking H-1."},
				{"title": "Trial Gratis", "desc": "Untuk siswa baru — 1 sesi gratis 60 menit untuk kenalan & assessment awal. Klik kontak untuk booking."},
			}),
			block("BentoGrid", map[string]any{
				"title": "Jadwal reguler mingguan",
				"items": []map[string]any{
					{"title": "Senin/Rabu/Jumat sore", "desc": "16.00–17.30 Kelas 10 · 18.00–19.30 Kelas 11 · 19.30–21.00 Kelas 12", "size": "lg"},
					{"title": "Selasa/Kamis siang", "desc": "09.00–10.30 & 13.00–14.30 slot privat 1-on-1", "size": "md"},
					{"title": "Sabtu pagi", "desc": "08.00–10.00 Kelas Olimpiade · 10.30–12.00 Pembahasan Soal Sulit", "size": "md"},
					{"title": "Minggu libur", "desc": "Family day — WhatsApp masih standby untuk emergency PR", "size": "lg"},
				},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "🎯 Crash Course UTBK 2026",
				"subtitle": "Batch terbatas 6 siswa · mulai Januari 2026",
				"price":    "Rp 2.500.000",
				"period":   "/paket 8× pertemuan intensif",
				"ctaLabel": "Booking slot sekarang",
				"ctaHref":  "/kontak",
				"bullets": []map[string]any{
					{"text": "Bank soal HOTS 800+ soal UTBK 5 tahun terakhir"},
					{"text": "Try-out 3× dengan simulasi CBT + analisis skor"},
					{"text": "Recording setiap pertemuan — bisa diulang bebas"},
					{"text": "WhatsApp support unlimited sampai hari-H"},
					{"text": "Garansi skor naik 100+ atau uang kembali"},
				},
			}),
			processSteps("Cara daftar & mulai kelas", []map[string]any{
				{"title": "1. WhatsApp / isi form", "desc": "Kirim info: nama, kelas, target belajar, jadwal preferred."},
				{"title": "2. Trial 60 menit gratis", "desc": "Kita ngobrol + assessment level saat ini. Cocok? Lanjut. Nggak? Nggak apa-apa."},
				{"title": "3. Bayar + mulai kelas", "desc": "Bayar per bulan (reguler/olimpiade) atau per sesi (privat). Materi & recording langsung diakses."},
			}),
			block("IconList", map[string]any{
				"title": "Informasi penting",
				"items": []map[string]any{
					{"icon": "📍", "title": "Alamat offline", "desc": "Ruko Bahagia Blok B-12, Jl. Pendidikan Raya, Jakarta Selatan (dekat SMA 8)"},
					{"icon": "💻", "title": "Kelas online", "desc": "Via Zoom · link dikirim H-1 · rekaman tersimpan di Google Drive khusus siswa"},
					{"icon": "💳", "title": "Pembayaran", "desc": "Transfer BCA/Mandiri, DANA, GoPay, OVO — atau tunai di lokasi"},
					{"icon": "🔄", "title": "Kebijakan reschedule", "desc": "Boleh reschedule max 2× per bulan dengan pemberitahuan H-1"},
				},
			}),
			pageFAQ("Pertanyaan seputar jadwal", []map[string]any{
				{"q": "Kalau saya di luar Jakarta, bisa ikut kelas?", "a": "Bisa. 60% siswa saya sekarang dari luar Jakarta (Bandung, Surabaya, Makassar, Balikpapan). Semua bisa via Zoom + akses recording."},
				{"q": "Kalau saya berhalangan hadir, sesinya hangus?", "a": "Tidak. Setiap sesi ada recording. Kalau kelas reguler & kamu ijin H-1, sesinya bisa diganti minggu berikutnya."},
				{"q": "Bisa gabung di tengah semester?", "a": "Bisa untuk kelas privat & konsultasi. Kelas reguler harus mulai batch baru (Januari, April, Juli, Oktober)."},
				{"q": "Apakah ada garansi hasil?", "a": "Untuk Crash Course UTBK: garansi skor naik minimal 100 poin atau uang kembali. Untuk kelas lain: tidak ada garansi angka, tapi 94% siswa saya tetap lanjut ke semester berikutnya."},
			}),
			simpleCTA(
				"Slot semester ini tinggal 8 — buruan booking",
				"Trial gratis 1 sesi 60 menit sebelum kamu commit. Nggak cocok? Nggak masalah, tetap dapat 1 sesi gratis.",
				"Booking trial gratis",
				"/kontak",
			),
			footer,
		},
	)

	tentang := page("tentang", "Tentang", false,
		map[string]any{"title": "Tentang Pak Budi"},
		[]map[string]any{
			nav,
			subHero(
				"Halo, saya Budi Santoso, S.Pd., M.Si.",
				"15 tahun mengajar matematika SMA — misi saya sederhana: nggak ada anak yang bodoh matematika, cuma cara mengajar yang belum cocok.",
			),
			block("Section", map[string]any{
				"title": "Kenapa saya jadi guru matematika?",
				"body":  "Waktu SMA saya sendiri **hampir kena remedi matematika di kelas 10**. Rasanya frustrasi — semua orang di sekitar tampak paham, saya nggak.\n\nSampai satu guru les pribadi mengubah cara saya melihat matematika: pakai analogi keseharian, mecah soal jadi langkah kecil, dan yang paling penting — sabar mengulang sampai saya benar-benar 'klik'.\n\nSekarang saya melakukan hal yang sama untuk siswa saya. Bukan drilling rumus. Bukan meme belajar. Tapi bikin siswa **paham konsep** — sisanya (nilai bagus, PTN, dst) akan mengikuti dengan sendirinya.",
			}),
			timelineBlock("Perjalanan karir mengajar", []map[string]any{
				{"year": "2007", "title": "Lulus S1 Pendidikan Matematika UPI", "desc": "Skripsi soal miskonsepsi siswa dalam limit fungsi. Cikal bakal pendekatan mengajar saya."},
				{"year": "2009", "title": "Lulus S2 Matematika ITB (cumlaude)", "desc": "Fokus di teori bilangan. Riset kecil-kecilan tapi cukup untuk memperdalam pemahaman."},
				{"year": "2011", "title": "Guru SMA 8 Jakarta", "desc": "5 tahun mengajar reguler. Belajar bahwa 1 metode nggak cocok untuk 30 siswa berbeda."},
				{"year": "2015", "title": "Pelatih Tim OSN Provinsi DKI", "desc": "8 tahun jadi pelatih olimpiade. 12 murid dapat medali OSN nasional."},
				{"year": "2016", "title": "Mulai bimbel privat 'Pak Budi Math'", "desc": "Full-time fokus di 1-on-1 & kelas kecil. Siswa pertama saya sekarang sudah S2."},
				{"year": "2020", "title": "YouTube Pak Budi Math", "desc": "Materi gratis di YouTube — sekarang 180+ video, 45.000 subscriber."},
				{"year": "2026", "title": "1.200+ siswa · 94% masuk PTN", "desc": "Hitungan kumulatif sepanjang 15 tahun. Yang terpenting: sebagian besar tetap suka matematika sampai sekarang."},
			}),
			proFeatureGrid(variant, "Pendidikan & sertifikasi resmi", []map[string]any{
				{"title": "S2 Matematika ITB", "desc": "Lulus 2009 cumlaude, IPK 3.87. Tesis di teori bilangan dengan Prof. Iwan Pranoto."},
				{"title": "S1 Pendidikan Matematika UPI", "desc": "Lulus 2007. Sudah aktif mengajar les sejak semester 3."},
				{"title": "Sertifikasi Guru Profesional", "desc": "Kemendikbud RI · nomor sertifikat: 15.2011.MT.045."},
				{"title": "Pelatih OSN Terakreditasi", "desc": "Sertifikat dari Kemendikbud Puspresnas — pelatih tingkat provinsi sejak 2015."},
				{"title": "Author 3 buku SMA", "desc": "\"Matematika SMA Rasa Cerita\" (2019), \"Bank Soal UTBK Matematika\" (2021), \"Olimpiade Untuk Pemula\" (2023)."},
				{"title": "Pembicara nasional", "desc": "Rutin diundang MGMP Matematika DKI · kanal Ruangguru · webinar SMA se-Indonesia."},
			}),
			block("BentoGrid", map[string]any{
				"title": "Pencapaian yang paling saya syukuri",
				"items": []map[string]any{
					{"title": "1.200+ siswa lulus PTN", "desc": "94% masuk pilihan pertama. Yang paling berkesan: siswa dari Papua yang nggak pernah les online sebelumnya, akhirnya masuk FKG UGM.", "size": "lg"},
					{"title": "12 medali OSN Nasional", "desc": "3 emas · 5 perak · 4 perunggu. Semua siswa reguler yang saya coach.", "size": "md"},
					{"title": "Kenaikan rata-rata 30 poin", "desc": "Dalam 3 bulan kelas reguler. Diverifikasi dari 200+ data siswa 2023–2025.", "size": "md"},
					{"title": "700+ siswa 'lifetime'", "desc": "Siswa yang tetap chat WhatsApp minta saran karir bahkan setelah lulus PTN. Ini yang paling bikin bangga.", "size": "lg"},
				},
			}),
			proTestimonials("Kata orang-orang yang kenal saya", []map[string]any{
				{"quote": "Pak Budi bukan sekedar 'guru pinter matematika'. Dia guru yang mau download Discord biar bisa jawab pertanyaan siswa lebih cepat. Karakter guru yang saya kagumi.", "name": "Ibu Rina Susanti", "role": "Kepala SMA 8 Jakarta"},
				{"quote": "Saya alumni 2015. Sekarang Ph.D. di NUS. Foundation matematika saya dari Pak Budi — dia yang bikin saya jatuh cinta sama analisis real.", "name": "Dr. Firman Nurhakim", "role": "Postdoc Mathematics, NUS Singapore"},
			}),
			simpleCTA(
				"Ingin ikut belajar sama Pak Budi?",
				"Trial gratis 1 sesi 60 menit — kita ngobrol dulu, lihat cocok atau nggak. Nggak ada tekanan untuk lanjut.",
				"Booking trial gratis",
				"/kontak",
			),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak Pak Budi"},
		[]map[string]any{
			nav,
			subHero(
				"Yuk ngobrol dulu",
				"Ada pertanyaan tentang materi, jadwal kelas, atau mau booking trial gratis? WhatsApp reply max 4 jam · email max 1×24 jam.",
			),
			block("IconList", map[string]any{
				"title": "Cara menghubungi",
				"items": []map[string]any{
					{"icon": "📱", "title": "WhatsApp (paling cepat)", "desc": "0812-0000-0000 · reply 09.00–21.00 · reservasi + tanya PR"},
					{"icon": "✉", "title": "Email (diskusi panjang)", "desc": "budi@pakbudi.math.id · reply max 24 jam · kerja sama sekolah"},
					{"icon": "📸", "title": "Instagram", "desc": "@pakbudi.math · tips harian + quiz mingguan · 28.000 followers"},
					{"icon": "▶️", "title": "YouTube", "desc": "Pak Budi Math · 180+ video materi gratis · 45.000 subscriber"},
					{"icon": "📍", "title": "Lokasi offline", "desc": "Ruko Bahagia Blok B-12, Jl. Pendidikan Raya, Jakarta Selatan"},
					{"icon": "🕒", "title": "Jam operasional", "desc": "Senin–Sabtu 09.00–21.00 WIB · Minggu family day (WA emergency only)"},
				},
			}),
			contactBlock(
				"Booking trial gratis 60 menit",
				"Isi form ini — saya akan reply via WhatsApp max 4 jam. Sertakan nama, kelas, & topik yang ingin dipelajari.",
			),
			socialBlock([]map[string]any{
				{"platform": "WhatsApp", "href": "https://wa.me/62812000000"},
				{"platform": "Instagram", "href": "https://instagram.com/pakbudi.math"},
				{"platform": "YouTube", "href": "https://youtube.com/@pakbudimath"},
				{"platform": "TikTok", "href": "https://tiktok.com/@pakbudi.math"},
				{"platform": "Email", "href": "mailto:budi@pakbudi.math.id"},
			}),
			mapBlock("Lokasi kelas offline (dekat SMA 8 Jakarta)"),
			block("BorderBeamCard", map[string]any{
				"title":    "🎁 Trial Gratis 1 Sesi 60 Menit",
				"subtitle": "Untuk siswa baru — no strings attached",
				"price":    "Rp 0",
				"period":   "sesi assessment + kenalan",
				"ctaLabel": "WhatsApp untuk booking",
				"ctaHref":  "https://wa.me/62812000000",
				"bullets": []map[string]any{
					{"text": "Assessment level matematika kamu saat ini"},
					{"text": "Rekomendasi tipe kelas yang paling cocok"},
					{"text": "1 sesi 60 menit pembahasan topik pilihan kamu"},
					{"text": "Kalau cocok — lanjut. Kalau nggak — nggak apa-apa, tetap dapat sesi gratis"},
				},
			}),
			pageFAQ("Pertanyaan yang sering ditanya", []map[string]any{
				{"q": "Berapa lama reply WhatsApp?", "a": "Max 4 jam di jam kerja (09.00–21.00). Kalau kirim di luar jam kerja, saya reply besok pagi."},
				{"q": "Bisa cancel booking trial?", "a": "Bisa, tapi tolong info H-1 supaya saya bisa alokasikan slot ke calon siswa lain."},
				{"q": "Saya di luar kota, tetap bisa trial?", "a": "Bisa. Trial online via Zoom sama seperti kelas reguler. 60% siswa saya sekarang dari luar Jakarta."},
				{"q": "Untuk kerja sama sekolah / meetup, kontak kemana?", "a": "Email langsung ke budi@pakbudi.math.id dengan detail acara + audience. Reply max 3 hari."},
			}),
			footer,
		},
	)

	return []map[string]any{home, materi, jadwal, tentang, kontak}
}

// ---------------- Blog ----------------

func blogPages(cv variantCopy, variant string) []map[string]any {
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
			proHero(variant, heroCopy{
				Eyebrow:    "Newsletter mingguan · 12.400+ pembaca",
				Title:      "Tulisan panjang tentang",
				Highlight:  "teknologi, produktivitas & hidup",
				TitleAfter: "yang sengaja pelan.",
				Subtitle:   "Setiap Jumat saya kirim 1 essay 800-kata via email. Tidak clickbait, tidak listicle 3-menit — cerita, framework, atau refleksi yang saya sendiri butuhkan minggu itu.",
				CTA:        "Subscribe gratis",
				CTAHref:    "#newsletter",
			}),
			block("Newsletter", map[string]any{
				"title":       "Bergabung dengan 12.400+ pembaca setia",
				"subtitle":    "1 essay mingguan · dikirim Jumat pagi · unsubscribe kapan saja",
				"placeholder": "nama@email.com",
				"ctaLabel":    "Subscribe",
			}),
			block("BlogListDynamic", map[string]any{
				"title": "Artikel terbaru",
				"limit": 6,
			}),
			statsRow("3 tahun · nilai yang saya buat", []map[string]any{
				{"value": "180+", "label": "Essay published"},
				{"value": "12.400", "label": "Subscribers"},
				{"value": "42%", "label": "Open rate email"},
				{"value": "8/10", "label": "Rekomendasi baca"},
			}),
			proFeatureGrid(variant, "Topik yang sering saya bahas", []map[string]any{
				{"title": "Teknologi", "desc": "Tutorial coding, review tools, dan tren web development yang benar-benar berguna — bukan hype."},
				{"title": "Produktivitas", "desc": "Workflow, habit, dan tools yang saya pakai untuk deep work. Sudah tested, bukan sekedar teori."},
				{"title": "Buku & belajar", "desc": "Review buku non-fiksi (bisnis, sains, filosofi) dengan takeaway yang bisa langsung dieksekusi."},
				{"title": "Refleksi", "desc": "Pelajaran dari perjalanan karir, keputusan bisnis, dan keputusan hidup yang tidak selalu benar."},
				{"title": "Karir tech", "desc": "Cara negosiasi salary, memilih company, cari mentor, dan naik jenjang tanpa politik kantor."},
				{"title": "Mental model", "desc": "Framework berpikir dari Munger, Kahneman, dan Taleb — diterapkan ke keputusan sehari-hari."},
			}),
			proTestimonials("Kata pembaca setia", []map[string]any{
				{"quote": "Tulisannya bermanfaat dan mudah dicerna — jarang saya ketemu blog Indonesia yang sekelas Farnam Street. Wajib follow untuk yang lagi belajar coding atau career development.", "name": "Rani Pratiwi", "role": "Software Engineer, Lentera Analytics"},
				{"quote": "Konten teknologinya selalu update dan disertai contoh nyata. Yang paling saya suka: dia berani bilang 'saya salah' kalau essay lama sudah tidak relevan.", "name": "Doni Kurniawan", "role": "Product Manager, Arunika Studio"},
				{"quote": "Newsletter Jumat pagi adalah highlight minggu saya. Selalu ada 1 kalimat yang saya screenshot atau kirim ke tim. Recommended banget.", "name": "Sari Wijaya", "role": "Founder, DesignStudio"},
			}),
			block("Section", map[string]any{
				"title": "Kenapa newsletter, bukan cuma blog?",
				"body":  "Blog itu passive — kamu harus datang. Newsletter itu active — sampai ke inbox kamu, konsisten setiap minggu.\n\nDan jujur: **email inbox** adalah salah satu media paling personal yang masih tersisa di internet 2025. Saya nggak mau nulis untuk algoritma feed, saya mau nulis untuk **kamu** — 1 orang membaca 1 email di pagi Jumat sambil minum kopi.",
			}),
			proFinalCTA(variant,
				"Baca lebih fokus. Konsumsi lebih sedikit. Pikir lebih dalam.",
				"Gabung dengan 12.400+ pembaca yang menerima 1 essay panjang setiap Jumat pagi. Gratis. Kapan saja bisa unsubscribe.",
				"Subscribe newsletter",
				"#newsletter",
			),
			footer,
		},
	)

	artikel := page("artikel", "Artikel", false,
		map[string]any{"title": "Semua Artikel — Blog Saya"},
		[]map[string]any{
			nav,
			subHero(
				"Semua tulisan · 180+ essay",
				"Arsip lengkap sejak 2023. Rata-rata 800–1.500 kata per essay — untuk dibaca pelan, sambil kopi.",
			),
			statsRow("Yang bakal kamu temukan", []map[string]any{
				{"value": "180+", "label": "Essay panjang"},
				{"value": "12rb", "label": "Subscribers"},
				{"value": "8 min", "label": "Rata-rata baca"},
				{"value": "6", "label": "Kategori topik"},
			}),
			block("Newsletter", map[string]any{
				"title":       "Nggak sempat baca semuanya? Terima 1 essay/minggu via email",
				"subtitle":    "Setiap Jumat pagi · 1 essay pilihan · unsubscribe kapan saja",
				"placeholder": "nama@email.com",
				"ctaLabel":    "Subscribe gratis",
			}),
			block("BlogListDynamic", map[string]any{
				"title": "Semua essay (terbaru dulu)",
				"limit": 50,
			}),
			proFeatureGrid(variant, "Kenapa nulis essay panjang di era listicle?", []map[string]any{
				{"title": "Deep, bukan skim", "desc": "Listicle 3-menit bikin kamu merasa produktif, tapi nggak nempel. Essay 800-kata memaksa mikir — dan yang mikir yang berubah."},
				{"title": "Tulisan = proses berpikir", "desc": "Saya nulis untuk mengklarifikasi pikiran saya sendiri. Kamu kebetulan ikut baca hasil pemikirannya."},
				{"title": "Konsistensi 3 tahun", "desc": "Rutin publish sejak 2023 tiap Jumat. Ini bukan side project — ini kebiasaan berpikir yang saya jaga."},
				{"title": "Anti-clickbait", "desc": "Judul deskriptif, bukan 'You won't believe...'. Kamu berhak tahu isi essay sebelum klik."},
				{"title": "Cross-link antar essay", "desc": "Setiap essay merefer ke essay lain yang relevan. Kamu bisa menyelam ke rabbit hole yang bermakna."},
				{"title": "Reply-friendly", "desc": "Kalau kamu subscribe newsletter, kamu bisa reply email saya langsung. Saya baca semua, meski nggak selalu bisa reply."},
			}),
			simpleCTA(
				"Baru pertama kesini? Mulai dari 5 essay favorit saya",
				"Saya sudah kurasi 5 tulisan yang paling representatif — cocok untuk pembaca baru yang mau ngerti 'suara' saya.",
				"Lihat kategori",
				"/kategori",
			),
			footer,
		},
	)

	kategori := page("kategori", "Kategori", false,
		map[string]any{"title": "Kategori Artikel — Blog Saya"},
		[]map[string]any{
			nav,
			subHero(
				"6 topik, 1 sudut pandang",
				"Semua essay saya berputar di sekitar 6 topik ini. Pilih yang paling relevan sama fase hidup kamu sekarang.",
			),
			block("BentoGrid", map[string]any{
				"title": "Peta topik blog",
				"items": []map[string]any{
					{"title": "Teknologi & Coding", "desc": "42 essay. Bukan tutorial 'how-to' — lebih ke 'kapan dipakai, kapan jangan'. Contoh: kenapa saya berhenti pakai TypeScript untuk side project.", "size": "lg"},
					{"title": "Produktivitas", "desc": "38 essay. Workflow yang tested, bukan hype. Contoh: cara saya baca 40 buku setahun tanpa jadi Goodreads slave.", "size": "md"},
					{"title": "Buku & Belajar", "desc": "32 essay. Review buku + framework belajar. Contoh: 5 buku non-fiksi wajib untuk software engineer 2026.", "size": "md"},
					{"title": "Karir Tech", "desc": "28 essay. Negosiasi salary, memilih company, cari mentor. Contoh: kapan resign — dan kapan bertahan.", "size": "lg"},
					{"title": "Refleksi Pribadi", "desc": "22 essay. Pelajaran dari kegagalan, keputusan salah, dan momen 'aha' yang lucu-nya baru datang setahun kemudian.", "size": "md"},
					{"title": "Mental Model", "desc": "18 essay. Framework berpikir dari Munger, Kahneman, Taleb — diterapkan ke keputusan nyata (bukan cuma diquote).", "size": "md"},
				},
			}),
			proFeatureGrid(variant, "Baru pertama kali? Mulai dari 5 essay favorit saya", []map[string]any{
				{"title": "Berhenti Baca Buku Bisnis", "desc": "Kenapa saya nggak lagi baca buku bisnis best-seller — dan apa yang saya baca sebagai gantinya. (Kategori: Buku & Belajar)"},
				{"title": "Anti-goal 2026", "desc": "Daftar hal yang saya PASTIKAN nggak akan saya kerjakan tahun ini — lebih penting dari daftar goal. (Kategori: Produktivitas)"},
				{"title": "Kapan Resign", "desc": "Framework 4-pertanyaan yang saya pakai sebelum keluar dari 3 pekerjaan terakhir. (Kategori: Karir Tech)"},
				{"title": "Silent Meeting", "desc": "Kenapa tim engineering saya wajib silent meeting 15 menit sebelum diskusi. Hasil: keputusan 3× lebih cepat. (Kategori: Produktivitas)"},
				{"title": "TypeScript Fatigue", "desc": "Kapan TypeScript worth-it, kapan cuma bikin ribet. Bahas dari sisi tim junior + solo dev. (Kategori: Teknologi)"},
				{"title": "Second Brain Setup", "desc": "Setup Obsidian + Readwise saya — 3 tahun konsisten. Bukan tutorial, tapi *kenapa* tiap keputusan setup dibuat. (Kategori: Buku & Belajar)"},
			}),
			block("BlogListDynamic", map[string]any{
				"title": "Essay terbaru dari semua kategori",
				"limit": 6,
			}),
			proTestimonials("Yang pembaca bilang", []map[string]any{
				{"quote": "Kategori 'Karir Tech' bikin saya berani negosiasi salary 30% naik saat pindah kerja tahun lalu. Framework 4-pertanyaannya beneran kepake.", "name": "Angga Putra", "role": "Backend Engineer, Nusantara Logistik"},
				{"quote": "Saya subscribe 100+ newsletter. Cuma 3 yang saya baca kata-per-kata. Blog ini salah satunya. Perbandingannya: substack Farnam Street & Ness Labs.", "name": "Dita Ramadhani", "role": "Product Designer, EduPintar"},
			}),
			simpleCTA(
				"Sudah tahu topik favorit? Baca essay-nya",
				"Klik kategori manapun di atas untuk melihat semua essay di topik tersebut, atau langsung ke arsip lengkap.",
				"Buka arsip lengkap",
				"/artikel",
			),
			footer,
		},
	)

	tentang := page("tentang", "Tentang", false,
		map[string]any{"title": "Tentang Penulis — Blog Saya"},
		[]map[string]any{
			nav,
			subHero(
				"Halo, saya penulis blog ini",
				"Software engineer, essayist, lifelong learner. Berbasis di Yogyakarta. Menulis pelan supaya bisa mikir pelan.",
			),
			block("Section", map[string]any{
				"title": "Kenapa saya nulis blog ini",
				"body":  "Saya mulai blog ini di 2020 sebagai jurnal privat — literally cuma untuk saya sendiri. Rasanya kepala saya terlalu berisik, dan menulis adalah satu-satunya cara saya bisa mengurut isinya.\n\nPertengahan 2023 saya bikin newsletter version — kirim 1 essay per minggu ke email siapa saja yang mau baca. Nggak nyangka 3 tahun kemudian ada 12.400 orang di list. Tapi angka itu bukan poin-nya. Poin-nya: saya menemukan orang-orang yang berpikir mirip, dan itu yang bikin nulis rasanya nggak sendirian.\n\nBlog ini bukan bisnis. Nggak ada affiliate, nggak jualan course. Kalau nanti ada — saya akan sangat eksplisit soal itu. Sampai kapan pun, prioritas utama saya: **essay yang saya sendiri bakal ingin baca lagi 5 tahun kemudian.**",
			}),
			timelineBlock("Journey menulis (yang penting)", []map[string]any{
				{"year": "2020", "title": "Blog privat pertama", "desc": "Ditulis di Notion. 43 essay di tahun pertama. Nggak ada yang baca kecuali saya + istri."},
				{"year": "2021", "title": "Publish pertama di publik", "desc": "Move ke Ghost. 12 essay diseleksi ulang dari draft privat. Reader pertama: 8 orang."},
				{"year": "2022", "title": "Fokus di essay panjang", "desc": "Berhenti nulis listicle & tutorial. Full commit ke essay 800+ kata. Traffic turun 50% — tapi retention naik."},
				{"year": "2023", "title": "Newsletter launch", "desc": "Kirim 1 essay/minggu via email. 300 subscriber di bulan pertama."},
				{"year": "2024", "title": "10.000 subscribers", "desc": "Milestone. Sisipin donation link opsional — 47 pembaca ikut donate sukarela. Blog jadi 'sustainable hobby'."},
				{"year": "2026", "title": "12.400 subscribers, 180 essay", "desc": "Konsisten Jumat pagi 3 tahun berturut-turut. Belum pernah miss 1 minggu pun."},
			}),
			proFeatureGrid(variant, "Kehidupan sehari-hari saya", []map[string]any{
				{"title": "Pekerjaan utama", "desc": "Senior Software Engineer di startup fintech remote. 4 hari kerja/minggu — 1 hari saya sengaja kosong untuk deep read + nulis."},
				{"title": "Lokasi", "desc": "Yogyakarta, Indonesia. Rumah kecil di pinggir sawah. Kopi bikin sendiri pakai V60."},
				{"title": "Rutinitas nulis", "desc": "Setiap pagi 5.30–7.00 nulis draft. Rabu edit. Kamis proofread. Jumat 5.00 pagi publish."},
				{"title": "Membaca", "desc": "40 buku setahun (target 2026). Rasio: 60% non-fiksi (bisnis, sains, filosofi), 40% fiksi (klasik & sastra Indonesia)."},
				{"title": "Podcast rutin", "desc": "Huberman Lab, Acquired, Farnam Street, dan Podcast Kuliner Bumi (untuk fun aja)."},
				{"title": "Off-screen", "desc": "Weekend hiking sekitar Merapi/Merbabu. Sabtu pagi coffeeshop. Minggu family day full — no laptop."},
			}),
			block("BentoGrid", map[string]any{
				"title": "Setup & tools yang saya pakai (jujur)",
				"items": []map[string]any{
					{"title": "Hardware", "desc": "MacBook Air M3 2024 · monitor Dell U2723QE · keyboard Keychron Q1 Pro · headphone Sony WH-1000XM5", "size": "lg"},
					{"title": "Menulis", "desc": "Draft: Obsidian · Editing: iA Writer · Publish: Ghost (self-hosted)", "size": "md"},
					{"title": "Second brain", "desc": "Obsidian + Readwise + Zotero · 3.400 highlights sync-ed", "size": "md"},
					{"title": "Productivity", "desc": "Task: Things 3 · Calendar: Fantastical · Kanban: Linear (kerja)", "size": "lg"},
				},
			}),
			statsRow("Yang bikin saya bangga (bukan angka pembaca)", []map[string]any{
				{"value": "180+", "label": "Essay konsisten"},
				{"value": "156", "label": "Minggu berturut-turut publish"},
				{"value": "47", "label": "Pembaca yang donate sukarela"},
				{"value": "1.200+", "label": "Email reply dari pembaca"},
			}),
			simpleCTA(
				"Mau ikut serta di journey ini?",
				"Subscribe newsletter — 1 essay Jumat pagi. Kalau nggak cocok, unsubscribe 1 klik dari email pertama.",
				"Subscribe gratis",
				"#newsletter",
			),
			footer,
		},
	)

	kontak := page("kontak", "Kontak", false,
		map[string]any{"title": "Kontak — Blog Saya"},
		[]map[string]any{
			nav,
			subHero(
				"Mari terhubung",
				"Saya baca semua email dari pembaca. Reply mungkin lambat (kadang 2 minggu untuk email panjang), tapi pasti dibaca.",
			),
			block("IconList", map[string]any{
				"title": "Cara menghubungi",
				"items": []map[string]any{
					{"icon": "✉", "title": "Email (prefer)", "desc": "halo@blogsaya.id · reply 1–7 hari · media terbaik untuk diskusi mendalam"},
					{"icon": "🐦", "title": "Twitter / X", "desc": "@blogsaya · reply 1–3 hari · cocok untuk sapa singkat & komentar essay"},
					{"icon": "💼", "title": "LinkedIn", "desc": "linkedin.com/in/blogsaya · reply 3–7 hari · undangan speaking/workshop"},
					{"icon": "📸", "title": "Instagram", "desc": "@blogsaya.id · rarely reply · behind-the-scene + foto kopi + kutipan buku"},
					{"icon": "🐙", "title": "GitHub", "desc": "github.com/blogsaya · issue di repo essay boleh — untuk saran topik open source"},
					{"icon": "📮", "title": "Reply email newsletter", "desc": "Kalau kamu subscriber — reply email Jumat langsung. Ini cara paling personal & tercepat."},
				},
			}),
			contactBlock(
				"Kirim pesan langsung",
				"Isi form ini — email masuk ke inbox pribadi saya. Sebutkan konteks (essay mana yang bikin kamu kontak, atau topik apa yang mau kamu diskusikan) supaya reply saya lebih tepat sasaran.",
			),
			socialBlock([]map[string]any{
				{"platform": "Email", "href": "mailto:halo@blogsaya.id"},
				{"platform": "Twitter", "href": "https://twitter.com/blogsaya"},
				{"platform": "LinkedIn", "href": "https://linkedin.com/in/blogsaya"},
				{"platform": "Instagram", "href": "https://instagram.com/blogsaya.id"},
				{"platform": "GitHub", "href": "https://github.com/blogsaya"},
				{"platform": "RSS", "href": "/rss.xml"},
			}),
			block("BorderBeamCard", map[string]any{
				"title":    "🎤 Speaking, workshop, atau podcast?",
				"subtitle": "Available untuk 4 event per tahun",
				"price":    "Custom",
				"period":   "sesuai lingkup & audience",
				"ctaLabel": "Email dengan detail acara",
				"ctaHref":  "mailto:halo@blogsaya.id?subject=Speaking%20Invitation",
				"bullets": []map[string]any{
					{"text": "Talk 30–60 menit di meetup/konferensi (offline Jakarta/Bandung/Jogja/Surabaya, online nasional)"},
					{"text": "Workshop 3–4 jam untuk perusahaan/komunitas (topic: writing, deep work, engineering culture)"},
					{"text": "Podcast interview (in-person di Jogja, atau remote via Riverside/Zencastr)"},
					{"text": "Fee: pro-bono untuk komunitas & universitas, invoice untuk perusahaan (mendukung sustainable writing)"},
				},
			}),
			pageFAQ("Yang sering ditanya", []map[string]any{
				{"q": "Berapa lama biasanya reply email?", "a": "Rata-rata 3–5 hari. Kadang lebih lama kalau email panjang & butuh mikir. Kalau 2 minggu belum reply, feel free follow-up — mungkin ke-lewat."},
				{"q": "Menerima guest post?", "a": "Sangat jarang. Setahun terakhir cuma 1 guest post. Kriteria ketat: topik sesuai + tulisan 800+ kata + original + kualitas sekelas essay saya sendiri. Pitch dulu sebelum nulis full."},
				{"q": "Bisa mentoring pribadi?", "a": "Saya sedang batasi mentoring privat (max 3 orang aktif). Kalau slot buka, saya announce di newsletter. Sementara: coba subscribe newsletter dulu — banyak topik career tech saya bahas di sana."},
				{"q": "Bisa reprint / translate essay?", "a": "Ya, dengan syarat: (1) attribution jelas ke blog original, (2) link balik ke essay asli, (3) tidak commercial tanpa izin tertulis. Untuk translate ke bahasa lain: email dulu ya."},
				{"q": "Kenapa blog nggak ada komentar?", "a": "Sengaja. Discussion terbaik happen via reply email newsletter — lebih personal, kurang noise. Kalau publik discussion, taruh di Twitter/LinkedIn dengan tag saya."},
			}),
			footer,
		},
	)

	return []map[string]any{home, artikel, kategori, tentang, kontak}
}
