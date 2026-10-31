# WordPress: Rumah Digital Guru

Port tema PANDI × UPI ke WordPress. Sumber kebenaran desain + data model tetap
`apps/renderer` dan `apps/api` di branch `guru-only`.

## Tiga artefak, bukan satu plugin ber-flag

| Artefak | Lisensi | Distribusi | Isi |
|---|---|---|---|
| `theme/` | GPLv2+ | wordpress.org | Tampilan: token `--guru-*`, template |
| `plugin-basic/` | GPLv2+ | wordpress.org | Data (CPT) + 17 blok kategori `guru` |
| `plugin-pro/` | GPLv2+ | dijual sendiri | 21 blok `guru-plus` + advanced editing |

Pemisahan ini bukan preferensi, tapi syarat repo wordpress.org:

> "Plugins may not contain functionality that is restricted or locked, only to
> be made available by payment or upgrade."

> "We recommend the use of add-on plugins, hosted outside of WordPress.org, in
> order to exclude the premium code."

Konsekuensi yang mengikat:

- Paket gratis harus **nol** kode Pro. Tidak boleh kirim blok Pro dalam keadaan
  nonaktif lalu dibuka pakai license key.
- Plugin gratis **dilarang** meng-install atau meng-update plugin Pro dari
  server kita. Pemasangan Pro dilakukan manual oleh user.
- Upsell boleh, tapi kontekstual atau hanya di halaman setting.

## Kenapa CPT di plugin, bukan di theme

Kalau CPT didaftarkan dari theme, guru yang berganti theme kehilangan seluruh
artikel dan materinya — konten jadi sandera tampilan. Plugin Basic memegang
data; theme hanya merender.

## Lisensi habis ≠ situs rusak

Kode yang memakai WP API adalah turunan GPL, jadi redistribusi Pro tidak bisa
dilarang. Yang dijual adalah update otomatis + support. Karena itu lisensi
kedaluwarsa **tidak** mematikan blok Pro: situs guru yang sudah live tidak boleh
rusak gara-gara telat bayar, dan penguncian semacam itu toh bisa dilucuti.

## Kontrak URL

Dijaga sama dengan renderer karena Litera mencocokkan URL kanonis byte-exact,
dan supaya migrasi situs dari kubaca.id tidak mengubah alamat artikel.

| Pola | Isi |
|---|---|
| `/{rubrik}` | Arsip rubrik |
| `/{rubrik}/page/{n}` | Arsip berhalaman |
| `/{rubrik}/{slug}` | Detail artikel |
| `/pembelajaran` | Arsip materi ajar |

`{rubrik}` dibatasi 6 nilai tetap: `ceritaku`, `bacaanku`, `inspirasiku`,
`bangsaku`, `peradaban`, `forum-diskusi`.

Aturan ini **tidak** memakai argumen `rewrite` bawaan, karena core mengganti
slug taxonomy kosong dengan nama taxonomy (`/rubrik/ceritaku`), bukan
`/ceritaku`:

```php
if ( empty( $args['rewrite']['slug'] ) ) {
    $args['rewrite']['slug'] = sanitize_title_with_dashes( $this->name );
}
```

Regex memakai daftar rubrik eksplisit, bukan `([^/]+)`, supaya URL satu segmen
lain tidak tertangkap. Sudah diuji terisolasi: `/tentang-kami`,
`/pembelajaran`, `/blog/2026/judul`, `/ceritakuXX` semuanya tidak cocok.

### Belum diverifikasi

Regex sudah diuji, tapi **perakitan WordPress-nya belum** — tidak ada
instalasi WP di mesin pengembangan ini. Yang masih harus dicek di WP nyata:

1. `flush_rewrite_rules()` saat aktivasi benar-benar memasang ketiga aturan.
2. `index.php?guru_article={slug}` me-resolve dengan `rewrite => false`.
3. Permalink di admin menampilkan `/{rubrik}/{slug}`, bukan `?post_type=`.
4. Rubrik tambahan buatan guru (di luar 6 baku) tidak 404 — saat ini aturan
   hanya dibuat untuk 6 slug tetap.
