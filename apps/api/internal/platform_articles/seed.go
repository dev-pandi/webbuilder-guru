package platform_articles

import (
	"context"
	"encoding/json"
	"log/slog"
)

// SeedIfEmpty — idempotent seeder. Cek total articles di DB; kalau 0, insert
// 6 sample articles yang menarik untuk demo homepage. Dipanggil dari main.go
// setelah migrate + repo build.
func SeedIfEmpty(ctx context.Context, r *Repo) error {
	n, err := r.CountPublic(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("platform_articles: seed skipped (already populated)", "count", n)
		return nil
	}
	slog.Info("platform_articles: seeding 6 sample articles")
	for _, a := range samples() {
		if _, err := r.Create(ctx, a); err != nil {
			slog.Warn("platform_articles: seed row failed",
				"slug", a.Slug, "error", err)
		}
	}
	return nil
}

func tags(vs ...string) json.RawMessage {
	b, _ := json.Marshal(vs)
	return b
}

func samples() []CreateInput {
	return []CreateInput{
		// ---- Featured: hero ----
		{
			Slug:            "kenapa-guru-indonesia-perlu-website-pribadi",
			Title:           "Kenapa Guru Indonesia Perlu Website Pribadi?",
			Excerpt:         "Website pribadi bukan lagi tren teknologi — ia adalah cara guru merawat rekam jejak pengetahuan dan menjaga identitas digital dari platform milik orang lain.",
			CoverImageURL:   "",
			Category:        "cerita",
			AuthorName:      "Tim PANDI × UPI",
			Tags:            tags("guru", "digital", "identitas", "pendidikan"),
			Status:          "published",
			Featured:        true,
			ReadingTimeMin:  6,
			SEOTitle:        "Kenapa Guru Indonesia Perlu Website Pribadi — Rumah Digital Guru",
			SEODescription:  "Manfaat website pribadi untuk guru: identitas digital, rekam jejak pengetahuan, dan cara terlepas dari algoritma platform besar.",
			BodyMD: `## Antara jejak digital dan platform yang menyewa

Sepuluh tahun terakhir, banyak guru mendokumentasikan proses mengajar mereka
lewat platform yang bukan miliknya sendiri — media sosial, halaman komunitas,
grup pesan. Konten yang dibuat menghilang saat platformnya menghilang.

Website pribadi menawarkan cara berbeda: **rumah digital yang benar-benar milik
Anda**. Alamat sendiri, isi sendiri, arsip yang bisa diekspor dan dipindahkan
kapan saja.

## Empat manfaat konkret

### 1. Identitas Digital yang Konsisten

Nama Anda + domain ` + "`.id`" + ` = kartu nama digital yang profesional.
Bandingkan ` + "`ibu-ratna.pandi.id`" + ` dengan URL panjang di platform lain — mana
yang lebih mudah dibagikan ke wali murid?

### 2. Rekam Jejak yang Terkumpul

Tulisan pertama Anda 3 tahun lalu masih ada. Materi ajar semester lalu masih
bisa dibuka. Tidak seperti feed sosial yang tenggelam, arsip website tetap
tersedia untuk dibaca ulang.

### 3. Kontrol Penuh atas Interaksi

Anda yang memutuskan siapa yang bisa berkomentar, kapan, dan bagaimana
moderasinya. Tidak ada algoritma yang menyaring atau menyembunyikan tulisan
Anda dari pembaca yang butuh.

### 4. Portabilitas Data

Ekspor semua tulisan Anda ke file statis kapan saja. Kalau suatu saat platform
tidak lagi tersedia, konten Anda tetap dapat dipindah ke server manapun.

## Bukan tentang teknologi

Yang paling penting: website pribadi memberi guru **ruang untuk berpikir
panjang**. Media sosial menuntut konten pendek. Blog pribadi mengundang
tulisan yang lebih dalam, refleksi yang tidak terburu-buru, dan percakapan
dengan pembaca yang sungguh tertarik.

Rumah digital guru bukan tren. Ini kebutuhan dasar profesi yang mulai kita
pahami setelah bertahun-tahun bergantung pada milik orang lain.`,
		},
		// ---- Tutorial ----
		{
			Slug:            "cara-memulai-website-guru-dalam-15-menit",
			Title:           "Cara Memulai Website Guru dalam 15 Menit",
			Excerpt:         "Panduan langkah demi langkah untuk membuat website pribadi guru dari nol — pilih domain, pilih template, isi profil, publikasi. Semuanya bisa selesai dalam waktu satu jam istirahat sekolah.",
			CoverImageURL:   "",
			Category:        "tutorial",
			AuthorName:      "Tim Web Builder",
			Tags:            tags("tutorial", "guru", "panduan-cepat"),
			Status:          "published",
			Featured:        true,
			ReadingTimeMin:  8,
			SEOTitle:        "Tutorial: Bikin Website Guru dalam 15 Menit dari Nol",
			SEODescription:  "Langkah demi langkah membuat website pribadi guru: beli domain .id, pilih template guru, isi profil, publish. Cocok untuk pemula.",
			BodyMD: `## Yang Anda butuhkan

- Alamat email aktif
- Nomor HP (untuk verifikasi domain .id kalau relevan)
- 15 menit fokus

## Langkah 1: Daftar & Verifikasi Akun

Buka [halaman utama](/) → klik **"Buat Website Saya"**. Isi nama, email,
password minimal 8 karakter. Cek email untuk link verifikasi.

## Langkah 2: Cari & Beli Domain

Di wizard **Beli Domain**, ketik nama Anda atau frasa yang mewakili identitas
Anda. Contoh:

- ` + "`ibu-siti.id`" + ` — nama pribadi
- ` + "`gurumatematika.id`" + ` — mata pelajaran
- ` + "`kelas-bahasa.id`" + ` — nama kelas / program

Sistem cek ketersediaan real-time. Kalau tersedia, klik **Beli** — bayar via
transfer bank / e-wallet / kartu kredit. Domain aktif 1–5 menit setelah bayar.

## Langkah 3: Pilih Template Guru PANDI × UPI

Setelah domain aktif, template picker akan muncul. Pilih **Guru PANDI × UPI**.
Template ini otomatis membuat:

- 9 halaman lengkap (Beranda, Profil, 5 rubrik, Forum Diskusi, Pembelajaran)
- 8 sample tulisan (siap diedit / dihapus)
- 4 sample materi pembelajaran
- 3 sample banner promosi

## Langkah 4: Isi Profil Guru

Buka menu **Guru → Profil** di dashboard site. Isi:

- **Mata Pelajaran**: contoh "Guru Bahasa Indonesia"
- **Foto Profil**: upload dulu di menu Aset, lalu salin URL
- **Hero Statement**: kalimat 1–2 baris tentang Anda
- **Bio**: perjalanan singkat sebagai guru

Klik **Simpan**. Data ini akan otomatis muncul di direktori guru portal.

## Langkah 5: Publikasi

Kembali ke dashboard site → klik **Publikasikan** di kanan atas. Situs Anda
sekarang live di domain yang Anda beli.

## Selesai! Apa selanjutnya?

- Edit sample tulisan → ganti dengan cerita Anda sendiri
- Tambah materi pembelajaran di menu **Pembelajaran**
- Cek statistik pengunjung di **Ringkasan**

Kalau ada kendala, buka [Bantuan](/artikel?category=panduan).`,
		},
		// ---- Tips ----
		{
			Slug:            "5-tips-menulis-konten-yang-menginspirasi",
			Title:           "5 Tips Menulis Konten yang Menginspirasi di Website Anda",
			Excerpt:         "Menulis untuk pembaca online berbeda dengan menulis untuk kertas. Berikut lima prinsip yang membuat tulisan Anda dibaca sampai selesai — bukan cuma di-scroll.",
			CoverImageURL:   "",
			Category:        "tips",
			AuthorName:      "Tim Web Builder",
			Tags:            tags("menulis", "konten", "seo", "tips"),
			Status:          "published",
			Featured:        false,
			ReadingTimeMin:  5,
			SEOTitle:        "5 Tips Menulis Konten Web yang Menginspirasi Pembaca",
			SEODescription:  "Prinsip menulis konten online: judul yang menarik, paragraf pendek, cerita spesifik, CTA yang jelas, dan revisi setelah jeda.",
			BodyMD: `## 1. Judul Menjelaskan Manfaat, Bukan Sekadar Topik

**Kurang bagus**: "Tentang Pendidikan Karakter"

**Lebih bagus**: "Cara Mengajarkan Empati Lewat Cerita Sederhana"

Pembaca datang dengan pertanyaan. Judul yang bagus menjawab "apa yang saya
dapat kalau membaca ini?"

## 2. Paragraf Maksimal 3 Kalimat

Di layar HP, blok teks panjang terasa berat. Pecah paragraf jadi unit kecil.

Kalau satu paragraf punya 5 kalimat, pikir ulang — apakah ada 2 ide yang
sebenarnya perlu dipisah?

## 3. Mulai dari Kejadian Spesifik

**Kurang bagus**: "Motivasi belajar siswa sering menurun di semester genap."

**Lebih bagus**: "Kamis lalu, Farhan mengangkat tangan pertama kali dalam satu
bulan. Bukan karena dia tahu jawabannya — karena pertanyaan gurunya berubah."

Detail spesifik = trust. Generalisasi = pembaca skip.

## 4. Setiap Tulisan Punya CTA

Setelah pembaca selesai baca, apa yang Anda ingin mereka lakukan?

- Baca artikel lain? → tautkan
- Bagikan? → sediakan tombol share
- Kirim tanggapan? → aktifkan komentar
- Berlangganan? → email form

Tanpa CTA, pembaca sekadar closer tab.

## 5. Tulis, Tinggalkan 24 Jam, Baru Publish

Draft yang baru selesai selalu terasa sempurna. Dua puluh empat jam kemudian,
Anda akan melihat kalimat yang belibet, transisi yang kaku, atau argumen yang
sebenarnya bisa dipertajam.

Jeda ini yang membedakan tulisan biasa dan tulisan yang layak dibaca berulang.

## Ringkasan

1. Judul menjelaskan manfaat
2. Paragraf pendek
3. Kejadian spesifik dulu
4. Selalu ada CTA
5. Endapkan sebelum publish

Selamat menulis!`,
		},
		// ---- Panduan ----
		{
			Slug:            "memilih-domain-id-untuk-guru-dan-umkm",
			Title:           "Memilih Domain .id untuk Guru dan UMKM",
			Excerpt:         "Domain .id, .co.id, .my.id — apa bedanya, siapa yang boleh pakai, dan bagaimana memilih yang paling cocok untuk profesi Anda. Panduan lengkap plus perbandingan harga.",
			CoverImageURL:   "",
			Category:        "panduan",
			AuthorName:      "Tim PANDI",
			Tags:            tags("domain", "pandi", ".id", "identitas"),
			Status:          "published",
			Featured:        true,
			ReadingTimeMin:  7,
			SEOTitle:        "Panduan Memilih Domain .id — Guru, UMKM, Perusahaan",
			SEODescription:  "Perbandingan .id, .co.id, .my.id, .biz.id: syarat, harga, dan kecocokan untuk berbagai profesi.",
			BodyMD: `## Kenapa .id?

Domain ` + "`.id`" + ` adalah TLD (Top-Level Domain) resmi Indonesia. Dikelola oleh
**PANDI** (Pengelola Nama Domain Internet Indonesia). Menggunakan ` + "`.id`" + `
berarti secara eksplisit menunjukkan identitas Indonesia — cocok untuk
audiens lokal.

## Varian Domain .id

| Domain | Untuk Siapa | Syarat Verifikasi |
|---|---|---|
| ` + "`.id`" + ` | Personal / bebas | NIK / KTP |
| ` + "`.co.id`" + ` | Perusahaan (PT) | Akta perusahaan + NPWP |
| ` + "`.web.id`" + ` | Personal / komunitas | KTP saja |
| ` + "`.my.id`" + ` | Personal / minor edit | KTP saja |
| ` + "`.biz.id`" + ` | Bisnis kecil | KTP + bukti usaha |
| ` + "`.or.id`" + ` | Organisasi non-profit | Akta pendirian |
| ` + "`.sch.id`" + ` | Sekolah | Surat rekomendasi Dinas |

## Rekomendasi per Profesi

### Guru
- **Pilihan utama**: ` + "`namaanda.id`" + ` — pendek, mudah diingat, kesan personal profesional
- **Alternatif**: ` + "`namaanda.web.id`" + ` — lebih murah, tetap ` + "`.id`" + `

### UMKM
- **Pilihan utama**: ` + "`namatoko.biz.id`" + ` — dirancang khusus bisnis kecil, syarat mudah
- **Alternatif**: ` + "`namatoko.id`" + ` — kesan lebih established, harga premium

### Perusahaan / PT
- **Wajib**: ` + "`.co.id`" + ` — legal recognition, kredibilitas B2B tinggi

### Sekolah / Yayasan
- ` + "`.sch.id`" + ` (sekolah) atau ` + "`.or.id`" + ` (yayasan) — subsidi negara,
  kredibilitas institusional

## Cara Cek Ketersediaan

Buka [wizard beli domain](/sites/new-with-domain) → ketik nama yang Anda
mau. Sistem cek ke registry PANDI secara real-time. Kalau tersedia, langsung
lanjut ke pembayaran.

## Tips

1. **Pendek lebih baik** — 6-12 huruf ideal
2. **Hindari angka & hyphen** — sulit dieja
3. **Cek trademark** — jangan pakai nama brand orang lain
4. **Beli 2 tahun sekaligus** — hemat perpanjangan, cegah hangus lupa bayar

## Domain sudah dibeli, apa selanjutnya?

Setelah bayar, domain aktif 1-5 menit. Pilih template, isi konten, publish.
Kalau butuh guide, baca [Cara Memulai Website dalam 15 Menit](/artikel/cara-memulai-website-guru-dalam-15-menit).`,
		},
		// ---- Pengumuman ----
		{
			Slug:            "peluncuran-rumah-digital-guru",
			Title:           "Peluncuran Program Rumah Digital Guru PANDI × UPI",
			Excerpt:         "Kolaborasi PANDI dan UPI menghadirkan platform website pribadi untuk guru Indonesia dengan template khusus, subsidi domain, dan komunitas belajar bersama.",
			CoverImageURL:   "",
			Category:        "pengumuman",
			AuthorName:      "Tim PANDI × UPI",
			Tags:            tags("pengumuman", "pandi", "upi", "program"),
			Status:          "published",
			Featured:        false,
			ReadingTimeMin:  4,
			SEOTitle:        "Peluncuran Rumah Digital Guru — PANDI × UPI",
			SEODescription:  "Program kolaborasi PANDI dan UPI: website pribadi untuk guru Indonesia dengan template siap pakai.",
			BodyMD: `## Program Baru untuk Guru Indonesia

**PANDI** (Pengelola Nama Domain Internet Indonesia) dan **UPI** (Universitas
Pendidikan Indonesia) resmi meluncurkan program **Rumah Digital Guru** — platform
website pribadi khusus untuk komunitas guru di Indonesia.

## Yang Ditawarkan

- **Template Guru PANDI × UPI** yang dirancang khusus untuk mendokumentasikan
  proses mengajar, dengan 6 rubrik: Ceritaku, Bacaanku, Inspirasiku, Bangsaku,
  Peradaban, dan Forum Diskusi
- **Domain .id / .my.id** dengan skema harga khusus untuk guru
- **Direktori guru publik** — website Anda otomatis muncul di ` + "`/guru`" + ` supaya
  pembaca bisa menemukan Anda
- **Portal komunitas** untuk berbagi promosi program pengembangan guru

## Kenapa Program Ini?

Selama ini banyak guru berbagi konten pengajaran lewat platform yang bukan
miliknya sendiri. Konten hilang saat platform berubah, algoritma menyembunyikan
tulisan panjang, dan identitas guru tidak konsisten.

Rumah Digital Guru hadir sebagai **ruang milik guru sendiri** — sederhana untuk
digunakan, tapi tetap serius sebagai identitas digital profesional.

## Cara Bergabung

1. Buka [halaman utama](/) → **"Buat Website Saya"**
2. Beli domain (Anda dapat harga khusus program guru)
3. Pilih template **Guru PANDI × UPI**
4. Isi profil, publikasi, mulai menulis

## Dukungan

- **Panduan lengkap**: [Panduan Guru](/artikel?category=panduan)
- **Komunitas**: forum diskusi antar guru di direktori portal
- **Support teknis**: hubungi tim support platform

Kami menantikan tulisan-tulisan Anda!`,
		},
		// ---- Cerita ----
		{
			Slug:            "cerita-guru-desa-yang-mengubah-cara-membaca",
			Title:           "Cerita Guru Desa yang Mengubah Cara Siswa Memandang Buku",
			Excerpt:         "Pak Rahmat tidak punya perpustakaan lengkap. Yang dia punya satu rak buku bekas dan komitmen 15 menit setiap pagi. Enam bulan kemudian, kelasnya berubah.",
			CoverImageURL:   "",
			Category:        "cerita",
			AuthorName:      "Tim Editorial",
			Tags:            tags("cerita", "literasi", "guru-desa", "inspirasi"),
			Status:          "published",
			Featured:        false,
			ReadingTimeMin:  6,
			SEOTitle:        "Cerita Guru Desa yang Mengubah Cara Membaca — Rumah Digital Guru",
			SEODescription:  "Inspirasi: bagaimana satu rak buku bekas dan rutinitas sederhana mengubah budaya membaca di kelas SD di desa.",
			BodyMD: `## Sebuah kelas di ujung Kabupaten

Pak Rahmat mengajar kelas 5 SD di sebuah desa 3 jam dari kota. Perpustakaan
sekolah cuma satu ruangan kecil dengan buku pelajaran lama. Tidak ada anggaran
untuk buku bacaan tambahan.

Di awal tahun ajaran, dia bertanya ke murid-muridnya: "Berapa dari kalian yang
membaca buku selain buku pelajaran dalam sebulan terakhir?"

Dari 24 anak, cuma 2 yang angkat tangan.

## Satu rak buku bekas

Pak Rahmat menghabiskan gaji bulan itu untuk beli **60 buku bekas** dari toko
loakan di kota — cerita anak, dongeng lokal, buku sains sederhana. Dia
menata rak kecil di sudut kelas dan menuliskan satu aturan di atasnya:

> "Baca kapan saja. Kembalikan ke rak. Rekomendasikan kalau kamu suka."

## 15 menit setiap pagi

Setiap pagi selama 15 menit sebelum pelajaran mulai, seluruh kelas — termasuk
Pak Rahmat — membaca. Tidak ada evaluasi. Tidak ada tugas resume. Cuma
membaca.

Pertama-tama banyak siswa yang cuma pura-pura. Mereka membuka buku tapi mata
tertuju ke jendela. Pak Rahmat tidak memaksa.

## Bulan ketiga: perubahan pertama

Anak-anak mulai bertanya. "Pak, buku yang tentang burung tadi ada bagian
duanya nggak?" — "Pak, saya bisa pinjem yang tentang planet Mars?"

Rekomendasi antarsiswa mulai muncul. Farhan menyerahkan bukunya ke Nadia
sambil bilang "kamu pasti suka bagian yang ini".

## Bulan keenam

Rak sudah kosong. Bukan karena buku hilang — karena semuanya sedang dipinjam.
Pak Rahmat menambah rak kedua.

Nilai bahasa Indonesia rata-rata kelas naik 12%. Yang lebih penting: anak-anak
mulai **menulis cerita mereka sendiri** di buku tulis dan menempelnya di dinding
kelas.

## Yang saya pelajari

Cerita ini bukan tentang membaca. Ini tentang **konsistensi kecil yang
menciptakan budaya baru**.

Kadang perubahan pendidikan tidak butuh anggaran besar atau kurikulum baru.
Cukup satu rak buku, 15 menit setiap pagi, dan guru yang ikut membaca bersama.

---

*Cerita ini disampaikan Pak Rahmat di sesi diskusi guru literasi. Nama
disamarkan atas permintaannya.*`,
		},
	}
}
