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
