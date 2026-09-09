package templates

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/articles"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/banners"
	"github.com/webbuilder/api/internal/learning"
)

// seedSampleGuru inserts sample articles + materials + banners so the
// guru-pandi-upi template renders with realistic content immediately after
// site creation. Failures are logged, never fail the request. Content is a
// port of the hardcoded strings from the previous static template blocks.
func (h *Handler) seedSampleGuru(ctx context.Context, siteID, ownerID uuid.UUID) {
	if h.articles != nil {
		for _, a := range sampleGuruArticles() {
			if _, err := h.articles.Create(ctx, siteID, a); err != nil {
				slog.Warn("seed guru article failed", "site_id", siteID, "slug", a.Slug, "error", err)
			}
		}
	}
	if h.learning != nil {
		for _, m := range sampleGuruLearning() {
			if _, err := h.learning.Create(ctx, siteID, m); err != nil {
				slog.Warn("seed guru material failed", "site_id", siteID, "slug", m.Slug, "error", err)
			}
		}
	}
	if h.banners != nil {
		for _, b := range sampleGuruBanners(siteID, ownerID) {
			if _, err := h.banners.Create(ctx, b); err != nil {
				slog.Warn("seed guru banner failed", "site_id", siteID, "title", b.InternalTitle, "error", err)
			}
		}
	}
	// Seed profil guru default — hanya field yang masih kosong (non-destructive).
	// Kalau user sudah edit profil sebelumnya, seed skip field itu.
	if h.auth != nil {
		if err := h.auth.SeedGuruProfileIfEmpty(ctx, ownerID, sampleGuruProfile()); err != nil {
			slog.Warn("seed guru profile failed", "user_id", ownerID, "error", err)
		}
	}
}

// sampleGuruProfile — default profil guru starter. Copy dari template
// `guruProfilPage` yang mengasumsikan persona "Ratna Prameswari — Guru Bahasa
// Indonesia". Fungsi seed hanya mengisi field kosong; kalau user sudah punya
// nilai, tidak diganti.
func sampleGuruProfile() auth.GuruProfileDefaults {
	socialLinks, _ := json.Marshal([]map[string]string{
		{"platform": "twitter", "url": "https://twitter.com/username"},
		{"platform": "instagram", "url": "https://instagram.com/username"},
	})
	return auth.GuruProfileDefaults{
		SubjectOrField: "Guru Bahasa Indonesia",
		ProfileImage:   "", // biarkan kosong — dorong user upload asli
		BioShort:       "Guru Bahasa Indonesia yang mendokumentasikan proses belajar-mengajar sebagai rekam jejak pribadi.",
		BioLong:        "Selama lebih dari satu dekade, saya belajar bahwa mengajar bukan hanya memindahkan pengetahuan. Ia juga tentang mendengar, memberi ruang, dan membantu siswa menemukan bahasa untuk menjelaskan apa yang mereka pikirkan.\n\nWebsite ini saya gunakan untuk mendokumentasikan proses itu: praktik yang berhasil, hal yang tidak berjalan sesuai rencana, bacaan yang mengubah cara pandang, dan pertanyaan yang belum saya temukan jawabannya.",
		HeroStatement:  "Mengajar adalah cara saya terus belajar.",
		Quote:          "Saya tidak ingin website ini hanya menjadi etalase. Saya ingin ia menjadi tempat untuk mengingat apa yang sudah dipelajari — dan apa yang masih perlu diperbaiki.",
		SocialLinksJSON: socialLinks,
	}
}

func tagsJSON(ts ...string) json.RawMessage {
	b, _ := json.Marshal(ts)
	return b
}

// sampleGuruArticles — 8 tulisan (2 forum-diskusi, sisanya menyebar di 5
// rubrik). Copy dari string hardcoded di guru_pandi_upi.go sebelum
// migration ke dynamic. Semua published supaya langsung tampil.
func sampleGuruArticles() []articles.CreateInput {
	return []articles.CreateInput{
		// ---- Ceritaku ----
		{
			Rubric:          "ceritaku",
			Slug:            "hati-hati-dengan-spasi",
			Title:           "Hati-hati dengan Spasi",
			Excerpt:         "Berawal dari kesalahan kecil pada sebuah kalimat, kelas Bahasa Indonesia berubah menjadi percakapan tentang makna.",
			BodyMD:          "Sebuah spasi yang salah menjadi pintu masuk untuk membicarakan bagaimana tanda kecil dapat mengubah cara kita membaca dan memahami kalimat.\n\nKetika saya menulis judul di papan tulis, seorang siswa menunjuk dan tertawa. Saya salah menempatkan spasi — bukan hanya salah ketik, tapi salah tempat yang membuat kata mengubah makna. Dari sana, satu jam pelajaran berubah dari tata bahasa formal menjadi obrolan tentang **ketelitian**, **konteks**, dan **cara kita memahami pesan**.\n\nKadang, pelajaran paling berkesan justru datang dari kesalahan.",
			CoverImageURL:   "",
			Tags:            tagsJSON("Pendidikan", "Literasi", "Refleksi"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  3,
		},
		{
			Rubric:          "ceritaku",
			Slug:            "ketika-siswa-menemukan-makna-dalam-cerpen",
			Title:           "Ketika Siswa Menemukan Makna dalam Cerpen",
			Excerpt:         "Dari jawaban yang berbeda-beda, kami belajar bahwa membaca bukan sekadar mencari satu jawaban yang dianggap paling benar.",
			BodyMD:          "Saya minta siswa membaca satu cerpen pendek. Setelah itu, saya bertanya: *apa yang paling menarik dari cerita ini?*\n\nJawaban mereka berbeda-beda. Ada yang tertarik pada tokoh, ada yang tertarik pada latar, ada yang bahkan menangkap detail kecil yang tidak saya duga. Momen itu mengajarkan saya bahwa **membaca adalah aktivitas personal** — bukan pencarian jawaban tunggal.",
			Tags:            tagsJSON("Cerpen", "Kelas", "Literasi"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  2,
		},
		// ---- Bacaanku ----
		{
			Rubric:          "bacaanku",
			Slug:            "membaca-lagi-laskar-pelangi",
			Title:           "Membaca Lagi Laskar Pelangi",
			Excerpt:         "Apa yang berubah ketika buku ini dibaca dari sudut pandang guru, bukan pembaca umum?",
			BodyMD:          "Belasan tahun setelah pertama kali membaca Laskar Pelangi, saya membacanya lagi — kali ini sebagai guru. Halaman yang dulu terasa hangat kini terasa **penuh tanggung jawab**.\n\nBu Mus, Pak Harfan, dan sepuluh siswa Sekolah Muhammadiyah bukan lagi sekadar karakter. Mereka menjadi cermin — apakah saya sudah cukup hadir untuk siswa saya?",
			Tags:            tagsJSON("Novel", "Andrea Hirata", "Refleksi"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  4,
		},
		// ---- Inspirasiku ----
		{
			Rubric:          "inspirasiku",
			Slug:            "kelas-kecil-perubahan-besar",
			Title:           "Kelas Kecil, Perubahan Besar",
			Excerpt:         "Cerita tentang guru desa yang mengubah cara siswa memandang buku, bermodal satu rak dan konsistensi.",
			BodyMD:          "Saya bertemu Pak Rahmat di sebuah pelatihan. Dia bercerita tentang muridnya yang tidak pernah menyentuh buku di luar pelajaran wajib. Dia tidak marah, tidak menceramahi. Dia hanya menempatkan **satu rak buku** di sudut kelas dan membiarkan siswa memilih apa yang mau dibaca.\n\nDalam satu semester, rak itu kosong bukan karena hilang — tapi karena selalu ada buku yang berpindah tangan.",
			Tags:            tagsJSON("Praktik Baik", "Literasi", "Motivasi"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  3,
		},
		// ---- Bangsaku ----
		{
			Rubric:          "bangsaku",
			Slug:            "gotong-royong-yang-bukan-slogan",
			Title:           "Gotong Royong yang Bukan Slogan",
			Excerpt:         "Contoh kecil dari kelas: bagaimana pembagian tugas yang adil membuat proyek kelompok terasa milik semua orang.",
			BodyMD:          "Gotong royong sering diulang dalam pelajaran kewargaan. Tapi bagaimana membuatnya terasa nyata untuk siswa?\n\nSaya coba pendekatan sederhana: **pembagian tugas eksplisit** di setiap proyek kelompok. Setiap orang tahu apa yang menjadi tanggung jawabnya, dan tahu bahwa hasil kelompok bergantung pada kontribusi setiap orang. Perlahan, kata 'kita' mulai lebih sering muncul daripada 'saya'.",
			Tags:            tagsJSON("Kewargaan", "Gotong Royong", "Kelas"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  3,
		},
		// ---- Peradaban ----
		{
			Rubric:          "peradaban",
			Slug:            "jejak-aksara-nusantara",
			Title:           "Jejak Aksara dalam Perjalanan Nusantara",
			Excerpt:         "Membaca aksara sebagai ingatan yang hidup — bukan sekadar simbol di halaman buku sejarah.",
			BodyMD:          "Aksara Nusantara bukan hanya artefak. Aksara Jawa, Bali, Batak, Lontara — semuanya masih hidup dalam ritual, upacara, dan komunitas tertentu.\n\nKetika saya membawa contoh aksara Jawa ke kelas, siswa lebih tertarik pada **bentuknya** daripada arti kata. Dari sana, kami mulai bertanya: apa yang membuat manusia menciptakan sistem tulis? Apa yang hilang ketika aksara berhenti dipakai?",
			Tags:            tagsJSON("Sejarah", "Aksara", "Nusantara"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  4,
		},
		// ---- Forum Diskusi (2 topik) ----
		{
			Rubric:          "forum-diskusi",
			Slug:            "apakah-pr-masih-relevan",
			Title:           "Apakah PR Masih Relevan?",
			Excerpt:         "Daripada bertanya perlu atau tidak, mari membahas: untuk siapa, untuk tujuan apa, dan dalam kondisi apa?",
			BodyMD:          "Pertanyaan tentang PR sudah lama diperdebatkan. Ada yang bilang PR memperkuat pembelajaran; ada yang bilang PR membebani siswa dan keluarga.\n\nSaya rasa jawaban tidak hitam-putih. **Konteks penting**:\n- Berapa lama waktu siswa di sekolah?\n- Bagaimana kondisi belajar di rumah?\n- Apa tujuan PR — latihan, refleksi, atau sekadar formalitas?\n\nBagaimana pendapat Anda?",
			Tags:            tagsJSON("Pembelajaran", "Kebijakan", "Diskusi"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  2,
		},
		{
			Rubric:          "forum-diskusi",
			Slug:            "menumbuhkan-budaya-membaca",
			Title:           "Bagaimana Menumbuhkan Budaya Membaca di Sekolah?",
			Excerpt:         "Apakah yang paling dibutuhkan adalah koleksi buku, waktu membaca, teladan, atau ruang untuk membicarakan bacaan?",
			BodyMD:          "Program literasi datang dan pergi. Yang tersisa biasanya adalah **rutinitas** dan **teladan**.\n\nDi sekolah saya, kami coba 15 menit membaca senyap setiap pagi. Hasilnya tidak instan — perlu satu semester sebelum siswa terlihat 'menikmati' aktivitasnya.\n\nApa yang bekerja di sekolah Anda?",
			Tags:            tagsJSON("Literasi", "Sekolah", "Budaya"),
			Status:          "published",
			CommentsEnabled: true,
			ReadingTimeMin:  2,
		},
	}
}

// sampleGuruLearning — 4 materi pembelajaran (spec §19: tanpa views/comments).
func sampleGuruLearning() []learning.CreateInput {
	return []learning.CreateInput{
		{
			Slug:          "mengenal-teks-cerpen",
			Title:         "Mengenal Teks Cerpen",
			Excerpt:       "Mengenali unsur, struktur, dan cara membaca cerpen agar kita tidak hanya mengikuti alur, tetapi juga menangkap makna di balik cerita.",
			BodyMD:        "## Apa itu cerpen?\n\nCerpen adalah karya sastra pendek yang menceritakan satu peristiwa utuh dengan tokoh, latar, dan alur yang padat.\n\n## Unsur intrinsik\n\n- **Tema** — gagasan utama\n- **Tokoh** — pelaku cerita\n- **Alur** — rangkaian peristiwa\n- **Latar** — waktu, tempat, dan suasana\n- **Sudut pandang** — cara penulis bercerita\n- **Amanat** — pesan yang ingin disampaikan\n\n## Latihan\n\nBaca satu cerpen pilihan. Tuliskan 3 unsur intrinsik yang paling menonjol menurut Anda.",
			Summary:       "Materi pengantar untuk memahami cerpen: unsur, struktur, dan cara membaca yang lebih peka.",
			Tags:          tagsJSON("Cerpen", "Sastra", "SMP"),
			Status:        "published",
		},
		{
			Slug:          "menyusun-teks-eksposisi",
			Title:         "Menyusun Teks Eksposisi",
			Excerpt:       "Memahami bagaimana gagasan, alasan, dan fakta disusun menjadi tulisan yang jelas, runtut, dan meyakinkan.",
			BodyMD:        "## Struktur teks eksposisi\n\n1. **Tesis** — pernyataan utama\n2. **Argumen** — alasan pendukung\n3. **Penegasan ulang** — kesimpulan\n\n## Ciri bahasa\n\n- Kalimat lugas dan tidak berbelit\n- Menggunakan kata-kata denotatif\n- Menyertakan fakta atau data\n\n## Contoh\n\n*Membiasakan Membaca Sejak Dini* — Membaca sejak kecil membantu perkembangan kosa kata dan kemampuan berpikir kritis. Penelitian menunjukkan bahwa anak yang terpapar buku sejak usia 3 tahun cenderung memiliki daya baca lebih tinggi. Oleh karena itu, membiasakan membaca sejak dini adalah investasi penting.",
			Summary:       "Panduan singkat untuk menyusun teks eksposisi: struktur, ciri bahasa, dan contoh.",
			Tags:          tagsJSON("Eksposisi", "Menulis", "SMP"),
			Status:        "published",
		},
		{
			Slug:          "memahami-teks-deskripsi",
			Title:         "Memahami Teks Deskripsi",
			Excerpt:       "Belajar memilih detail dan kata yang tepat agar pembaca dapat membayangkan objek, tempat, atau suasana yang sedang dijelaskan.",
			BodyMD:        "## Tujuan teks deskripsi\n\nMembuat pembaca **melihat, mendengar, merasakan** apa yang penulis alami.\n\n## Kunci teks deskripsi yang kuat\n\n- Gunakan panca indera: penglihatan, pendengaran, penciuman, perabaan, pengecapan\n- Pilih kata yang spesifik (bukan hanya \"bunga\", tapi \"melati putih yang mekar semalam\")\n- Susun urutan yang logis (dari luar ke dalam, dari umum ke khusus)\n\n## Contoh\n\n*Pasar Pagi* — Sebelum matahari terbit, pasar sudah ramai. Aroma kopi tubruk bercampur dengan bau ikan segar. Suara pedagang menawarkan dagangan berbaur dengan tawa pengunjung. Lantai basah oleh air dan minyak, membuat langkah harus lebih hati-hati.",
			Summary:       "Cara menyusun teks deskripsi: pemilihan detail, penggunaan panca indera, dan urutan penyajian.",
			Tags:          tagsJSON("Deskripsi", "Menulis", "SMP"),
			Status:        "published",
		},
		{
			Slug:          "menyunting-kalimat-dan-ejaan",
			Title:         "Menyunting Kalimat dan Ejaan",
			Excerpt:       "Latihan sederhana untuk melihat kembali pilihan kata, tanda baca, ejaan, dan susunan kalimat agar tulisan lebih mudah dipahami.",
			BodyMD:        "## Kenapa perlu menyunting?\n\nTulisan yang baik bukan yang selesai sekali tulis, tapi yang **dibaca ulang** dan **diperbaiki**.\n\n## Empat hal untuk dicek\n\n1. **Ejaan** — sesuaikan dengan PUEBI (huruf kapital, tanda hubung, dsb.)\n2. **Tanda baca** — koma, titik, titik dua, tanda kutip pada tempatnya\n3. **Kalimat efektif** — hindari pengulangan kata dan kalimat bertele-tele\n4. **Kesatuan gagasan** — setiap paragraf punya satu ide utama\n\n## Latihan\n\nAmbil tulisan Anda satu minggu lalu. Baca ulang dan tandai satu kalimat yang bisa dipersingkat tanpa mengubah makna.",
			Summary:       "Panduan menyunting: hal-hal yang perlu dicek sebelum tulisan dianggap selesai.",
			Tags:          tagsJSON("Menyunting", "Ejaan", "PUEBI"),
			Status:        "published",
		},
	}
}

// sampleGuruBanners — 3 banner promosi awal yang mereplikasi carousel mockup.
// image_url pakai path static assets bundled dengan renderer (relative-safe
// karena di-serve dari domain guru). Bypass banners.Handler.validURL karena
// dipanggil langsung ke Repo.Create.
func sampleGuruBanners(siteID, ownerID uuid.UUID) []banners.CreateInput {
	baseAssets := "/templates/guru-pandi-upi"
	// Aktif tanpa deadline supaya langsung tampil di beranda.
	now := time.Now()
	_ = now
	return []banners.CreateInput{
		{
			SiteID:        siteID,
			OwnerUserID:   ownerID,
			InternalTitle: "Contoh: Program Pelatihan Guru",
			ImageURL:      baseAssets + "/promo-pelatihan-guru.png",
			TargetURL:     "https://guru.kemdikbud.go.id",
			AltText:       "Program pelatihan pengembangan guru",
			SortOrder:     1,
			TeacherActive: true,
		},
		{
			SiteID:        siteID,
			OwnerUserID:   ownerID,
			InternalTitle: "Contoh: Program Literasi Kelas",
			ImageURL:      baseAssets + "/promo-literasi-kelas.png",
			TargetURL:     "https://guru.kemdikbud.go.id",
			AltText:       "Program literasi kelas",
			SortOrder:     2,
			TeacherActive: true,
		},
		{
			SiteID:        siteID,
			OwnerUserID:   ownerID,
			InternalTitle: "Contoh: Komunitas Guru Berbagi",
			ImageURL:      baseAssets + "/promo-komunitas-guru.png",
			TargetURL:     "https://guru.kemdikbud.go.id",
			AltText:       "Komunitas berbagi praktik baik guru",
			SortOrder:     3,
			TeacherActive: true,
		},
	}
}
