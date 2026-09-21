# Panduan Integrasi: BikinWeb PANDI × Litera

> Dokumentasi teknis alur penerbitan artikel digital NFT, konfigurasi reward, materi eksklusif, dan kuis pembaca.
>
> Sumber: https://literaa.xyz/api/v1/docs

---

## Daftar Isi

1. [Kredensial API](#1-kredensial-api)
2. [Pembagian Tanggung Jawab](#2-pembagian-tanggung-jawab)
3. [Konfigurasi Default Publisher & Penjelasan Reward](#3-konfigurasi-default-publisher--penjelasan-reward)
4. [Form Input Guru: Materi Eksklusif & Kuis](#4-form-input-guru-materi-eksklusif--kuis)
5. [Alur API saat Guru Klik "Publikasikan"](#5-alur-api-saat-guru-klik-publikasikan)
6. [Pemasangan Widget di Halaman Publik](#6-pemasangan-widget-di-halaman-publik)
7. [Skenario Uji & Penanganan Error](#7-skenario-uji--penanganan-error)
8. [Header Keamanan Content Security Policy (CSP)](#8-header-keamanan-content-security-policy-csp)

---

## 1. Kredensial API

| Item | Nilai |
|------|-------|
| **Master API Key** | `lit_sk_pandi_2c49487cf4f01bcad8f5814078e55668f356783dc9ca8b42` |
| **Publisher Wallet** | `0x181f...512` |
| **Jaringan** | Polygon Mainnet (137) |
| **Base API URL** | `https://literaa.xyz/api/v1` |
| **CORS Whitelist** | Auto-Approved (≤60s) |
| **Status** | APPROVED ON-CHAIN |

**Penyimpanan:** Kunci ini mewakili institusi publisher. Simpan pada variabel lingkungan (`.env`) di server backend. **Jangan** sertakan kunci ini di kode frontend atau berkas JavaScript browser.

### Cara Mendapatkan Kunci API (Publisher Baru)

1. Masuk ke `dashboardliteraa.xyz` menggunakan wallet atau email, lalu ajukan status publisher dan tunggu **APPROVED**.
2. Buka menu **Creator → Domain & API Key** (`/publisher/integrasi`), klik **"Buat Kunci API"**, beri label, lalu tanda tangani pesan wallet yang muncul. Tanda tangan membuktikan Anda pemilik wallet — tanpa ini siapa pun bisa mengklaim key atas nama wallet lain.
3. Salin key yang tampil dan simpan di server backend Anda. Setiap publisher hanya bisa mengelola data miliknya sendiri.
4. **Key bocor atau ingin ganti?** Cabut lewat halaman yang sama atau via `POST /cms/keys/revoke`, lalu terbitkan baru. Detail teknis tiap endpoint ada di Swagger `/api/docs`.

> ⚠️ **Peringatan Keamanan:** API key yang tertera di dokumentasi publik ini terekspos. Jika ini key produksi yang masih aktif, segera cabut dan ganti.

---

## 2. Pembagian Tanggung Jawab

Agar penerbitan artikel tidak memerlukan pengisian manual di dashboard Litera, data dibagi ke dalam dua kelompok: **parameter institusi** (ditetapkan sekali oleh PANDI) dan **konten artikel** (diisi oleh guru saat menulis).

### 🏢 Dikelola Publisher (PANDI)

- Master API Key untuk komunikasi antar-server.
- Pendaftaran domain baru guru ke filter CORS saat pembayaran domain selesai.
- Penetapan harga NFT default (0 atau gratis untuk pembaca edukasi).
- Penetapan kuota pencetakan maksimal (Max Minted).
- Kebijakan reward token LITE (jika ada insentif untuk pembaca/penulis).
- Nama koleksi induk (misal: `BikinWeb Educational Collection`).

### 👨‍🏫 Dikelola Guru (di Editor BikinWeb)

- Judul, ringkasan, dan isi tulisan.
- Nama penulis (diambil otomatis dari Profil Guru).
- Berkas gambar cover (diambil dari Menu Aset).
- Toggle persetujuan: **"Jadikan Koleksi Digital Litera"**.
- Tautan konten eksklusif (Unlockable Content) jika artikel dikunci.
- Soal kuis refleksi bacaan (1–3 soal pilihan ganda, opsional).

---

## 3. Konfigurasi Default Publisher & Penjelasan Reward

Smart contract Litera (`Writer.sol`) menyediakan parameter ekonomi token untuk setiap artikel. Pada platform BikinWeb, parameter ini dikonfigurasi di backend sebagai nilai default:

### Parameter Kontrak & Nilai Rekomendasi

| Parameter Kontrak | Tipe Data | Default Rekomendasi | Keterangan |
|-------------------|-----------|---------------------|------------|
| `price` | uint256 | `0` | Harga klaim artikel dalam token LITE. Untuk artikel guru disarankan 0 (Free Claim) agar siswa dapat mengoleksi tanpa biaya. |
| `fee` | bool | `false` | Status pemotongan fee transaksi. Bernilai `false` jika artikel gratis. |
| `_MaxMinted` | uint256 | `100` | Batas jumlah kolektor yang dapat mencetak NFT artikel ini. Nilai `0` berarti tanpa batas (unlimited). |
| `userReward` | uint256 | `0` | Bonus token LITE yang diberikan kepada pembaca saat berhasil mencetak NFT. Jika tidak menggunakan insentif token, set 0. |
| `creatorMintReward` | uint256 | `0` | Bonus token LITE untuk guru setiap kali ada pembaca yang mencetak NFT. Jika tidak menggunakan skema bagi hasil token, set 0. |
| `creatorApproveReward` | uint256 | `0` | Bonus token LITE untuk verifikator saat artikel disetujui. Set 0 untuk alur otomatis. |

> **Catatan Reward Pool:**
> Jika nilai `userReward` atau `creatorMintReward` lebih dari 0, publisher harus mendepositkan sejumlah token LITE ke smart contract sebagai cadangan reward. Untuk model edukasi sekolah BikinWeb, nilai default yang dianjurkan adalah **0** (klaim gratis tanpa sirkulasi token).

### Pemetaan Form → API Field

| Field di Form `/creator` | Sumber Otomatis (BikinWeb) | Field API Intent |
|--------------------------|----------------------------|------------------|
| NFT Name, Author, Description | Judul, Profil Guru, ringkasan artikel | `title`, `author`, `description` |
| Article Link | URL kanonis artikel | `articleUrl` |
| Collection | Koleksi default publisher | `collectionName` |
| User/Creator/Approve Reward, Max Mint, Fee+Price | Admin setting BikinWeb (awal) | `userReward`, `creatorMintReward`, `creatorApproveReward`, `maxMinted`, `feeEnabled`, `price` |
| Unlockable (link/deskripsi) | Form materi eksklusif guru | `unlockableUrl`, `unlockableDescription` |
| Quiz (soal + kunci) | Form kuis guru | `quiz {passingScore, questions[]}` |

> Buka `/creator?articleUrl=...` — seluruh baris di atas terisi otomatis dari intent. Publisher tinggal verifikasi lalu mint.

---

## 4. Form Input Guru: Materi Eksklusif & Kuis

Di antarmuka editor BikinWeb (menu **Tulisan** atau **Pembelajaran**), guru mengisi materi utama dan dapat menambahkan dua fitur opsional:

### A. Materi Eksklusif (Unlockable Content)

Jika guru mengaktifkan opsi materi eksklusif, pembaca hanya bisa melihat konten rahasia setelah memiliki NFT artikel tersebut.

**Contoh penggunaan:**
- Tautan berkas Google Drive berisi Modul Ajar format DOCX/PDF lengkap.
- Tautan video pembelajaran pengayaan atau rekaman sesi kelas.
- Tautan grup diskusi atau lembar kerja siswa beresolusi tinggi.

> Konten ini dienkripsi menggunakan **AES-256** di backend Litera dan dikunci ke smart contract `Unlockable.sol`.

### B. Kuis Refleksi Pembaca (Proof-of-Reading)

Guru dapat menyusun **1 hingga 3 pertanyaan pilihan ganda** untuk memastikan siswa memahami materi sebelum berhak mengklaim sertifikat digital NFT.

**Struktur kuis yang didukung:**
- `passingScore`: Nilai kelulusan minimal dalam persen (misal: `60` atau `80`).
- `questions`: Daftar pertanyaan dengan 4 pilihan jawaban (A, B, C, D) dan penanda kunci jawaban.

> Kunci jawaban disimpan di server Litera dan **tidak pernah dikirim ke browser pembaca**. Penilaian dilakukan di server melalui `POST /quiz/submit`.

> ⚠️ **Perhatian:** Soal dan kunci jawaban **tidak dapat diubah** setelah kuis diterbitkan (hanya status AKTIF/NONAKTIF yang bisa diubah). Pastikan konfigurasi kuis sudah benar sebelum mint.

---

## 5. Alur API saat Guru Klik "Publikasikan"

Saat guru menekan tombol publikasi di BikinWeb dengan toggle Litera aktif, backend BikinWeb memanggil API registrasi artikel dengan payload terpadu:

### Contoh Payload Registrasi Artikel

Status field: semua tersimpan — `articleUrl`, `title`, `author`, `description`, `coverImageUrl` plus `unlockableUrl`, `unlockableDescription`, `price`, `feeEnabled`, `maxMinted`, `quiz` (status intent menjadi **CONFIGURED**). Endpoint `POST /cms/articles/:id/configure` untuk update susulan, `GET /cms/articles/intents` untuk antrian. Dashboard `/creator?articleUrl=` prefill otomatis + buat kuis & unlockable pasca-mint.

```bash
curl -X POST https://literaa.xyz/api/v1/cms/articles/register \
  -H "Authorization: Bearer lit_sk_pandi_2c49487cf4f01bcad8f5814078e55668f356783dc9ca8b42" \
  -H "Content-Type: application/json" \
  -d '{
    "articleUrl": "https://ratnaprameswari.id/bacaanku/modul-ajar-digital",
    "title": "Inovasi Modul Belajar Digital",
    "author": "Imam Kholid Ubaidillah",
    "description": "Refleksi pembelajaran di kelas digital",
    "coverImageUrl": "https://ratnaprameswari.id/uploads/cover-modul.jpg",
    "unlockableUrl": "https://drive.google.com/file/d/modul-lengkap-guru.pdf",
    "unlockableDescription": "Modul ajar lengkap format Docx & PDF",
    "price": 0,
    "feeEnabled": false,
    "maxMinted": 100,
    "userReward": 0,
    "creatorMintReward": 0,
    "creatorApproveReward": 0,
    "collectionName": "BikinWeb Educational Collection",
    "quiz": {
      "passingScore": 60,
      "questions": [
        {
          "question": "Apa tujuan utama modul pembelajaran digital ini?",
          "options": [
            "A. Menggantikan peran guru di kelas",
            "B. Mendukung pembelajaran mandiri dan diferensiasi",
            "C. Meniadakan penggunaan buku cetak",
            "D. Menambah beban ujian online"
          ],
          "correctOption": "B"
        }
      ]
    }
  }'
```

### Respons dari Litera API

```json
{
  "success": true,
  "data": {
    "created": true,
    "intent": {
      "id": "c9284a12-4f8c-8abc-123456789abc",
      "articleUrl": "https://ratnaprameswari.id/bacaanku/modul-ajar-digital",
      "title": "Inovasi Modul Belajar Digital",
      "status": "REGISTERED"
    },
    "embedCode": "<div id=\"litera-nft-widget\" data-litera-article=\"https://ratnaprameswari.id/bacaanku/modul-ajar-digital\"></div>\n<script async src=\"https://cdn.literaa.xyz/litera-embed.js\"></script>"
  },
  "meta": {
    "version": "v1",
    "correlationId": "8f3a219b-4412-4fb2-ab60-9a8bc5f58ca3"
  }
}
```

> Backend BikinWeb menyimpan `intent.id` dan menyisipkan teks `embedCode` pada template halaman publik guru.

---

## 6. Pemasangan Widget di Halaman Publik

Pada berkas template yang menyajikan isi artikel publik (seperti halaman baca BikinWeb), letakkan tag penampung widget di bagian bawah tulisan:

```html
<!-- Widget Litera NFT -->
<div id="litera-nft-widget" data-litera-article="https://ratnaprameswari.id/bacaanku/modul-ajar-digital"></div>
<script async src="https://cdn.literaa.xyz/litera-embed.js"></script>
```

### Perilaku Otomatis Widget

- Sebelum artikel dicetak di blockchain, widget menampilkan status: **"Artikel ini sedang diproses oleh publisher."**
- Setelah dicetak di blockchain, widget menampilkan **kartu koleksi artikel**.
- Jika artikel memiliki kuis, widget memunculkan pertanyaan kuis saat tombol klaim ditekan.
- Setelah kuis lulus dan NFT diklaim, widget membuka tombol tautan **materi eksklusif**.

### Fallback Lintas-Domain (otomatis di widget v1.4.11+)

Jika login email/Google gagal di domain pihak ketiga, widget menampilkan transisi singkat **"Menyiapkan halaman Litera"** lalu membuka `https://literaa.xyz/collect?article=<URL>&tokenId=<id>` pada tab yang sama. Login, kuis, mint, dan unlock diselesaikan di origin resmi yang sudah terdaftar; setelah mint selesai pembaca otomatis kembali ke artikel asal. **Tidak ada tombol tambahan yang perlu diklik.**

---

## 7. Skenario Uji & Penanganan Error

### Skenario Uji

| Skenario | Langkah | Ekspektasi |
|----------|---------|------------|
| **A — Artikel baru (belum mint)** | Daftarkan URL baru via `POST /cms/articles/register`, pasang widget, buka halaman | Widget menampilkan status "sedang diproses". Cek resolve: `GET /api/v1/articles/resolve?url=...` mengembalikan `404` |
| **B — Artikel sudah mint** | Gunakan URL yang sudah dicetak (mis. contoh di Postman collection) | Widget menampilkan kartu NFT, kuis berjalan, klaim berhasil, materi eksklusif terbuka. Resolve mengembalikan `{tokenId, generation}` |
| **Negatif — key salah** | Panggil endpoint CMS dengan key palsu | Harus ditolak `401`. Ini bukti autentikasi bekerja |

### Tabel Kode Error

| Kode | Arti | Tindakan |
|------|------|----------|
| `401` | Key salah/revoked atau signature tidak valid | Jangan retry. Tempel ulang key atau tanda tangani ulang. |
| `403` | Domain artikel belum live di CORS | Daftarkan domain dulu, tunggu 60 detik, retry sekali. |
| `429` | Melebihi 60 request/menit | Backoff dan retry. |
| `404` (resolve) | URL belum di-mint on-chain | Bukan error. Selesaikan mint di `/creator`. |

> **Aturan URL:** Harus **kanonis dan byte-persis sama** di semua langkah (beda satu garis miring = tidak cocok). Setiap respons membawa `meta.correlationId` — sertakan saat melapor kendala.

### Login Email/Google Gagal dengan "Something went wrong" di Modal Privy?

Itu berarti domain situs belum terdaftar di **dashboard.privy.io → App Settings → Basics → Allowed origins**. Daftarkan persis, mis. `http://litera-test.local` (localhost selalu diizinkan otomatis).

> **Catatan:** Wildcard wajib terikat parent (`https://*.pandi.id` valid; `*` polos dan `https://*.id` ditolak), sehingga ribuan domain apex arbitrer tidak bisa dicakup satu wildcard — untuk embed pihak ketiga jadikan login **Hubungkan Dompet (Web3Modal)** sebagai jalur utama karena tanpa batasan domain.

---

## 8. Header Keamanan Content Security Policy (CSP)

Jika server web BikinWeb menerapkan header CSP, tambahkan domain layanan Litera pada konfigurasi keamanan:

| Directive | Nilai |
|-----------|-------|
| `script-src` | `'self' 'unsafe-inline' https://cdn.literaa.xyz` |
| `connect-src` | `'self' https://literaa.xyz https://cdn.literaa.xyz https://polygon-bor-rpc.publicnode.com https://1rpc.io` |
| `img-src` | `'self' data: blob: https: https://cdn.literaa.xyz https://*.ipfs.dweb.link https://ipfs.io` |
| `frame-src` | `'self' https://verify.walletconnect.com https://*.privy.io` |

---

## Lampiran: Ringkasan Endpoint API

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/cms/articles/register` | Registrasi artikel baru (dari BikinWeb) |
| `POST` | `/cms/articles/:id/configure` | Update konfigurasi artikel setelah registrasi |
| `GET` | `/cms/articles/intents` | Antrian intent yang belum di-mint |
| `POST` | `/cms/keys/revoke` | Cabut API key |
| `GET` | `/api/v1/articles/resolve?url=...` | Cek status mint artikel berdasarkan URL |
| `POST` | `/quiz/submit` | Submit jawaban kuis (penilaian di server) |

---

*Dokumen ini disusun ulang dari halaman dokumentasi resmi https://literaa.xyz/api/v1/docs untuk keperluan referensi internal.*

---