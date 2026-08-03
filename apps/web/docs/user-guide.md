# Panduan Pengguna — Web Builder

Panduan lengkap alur beli domain + kelola domain + monitoring invoice.

---

## 1. Beli Domain + Buat Situs

### 1.1 Cari domain

1. Login ke dashboard → tombol **"Buat Situs Baru"** (biru, di header)
2. Wizard buka di `/sites/new-with-domain`. Ketik nama domain yang diinginkan:
   - Format SLD saja (mis. `myshop`) — sistem cek ketersediaan di semua TLD yang tersedia
   - Format lengkap (mis. `myshop.co.id`) — cek 1 TLD saja
3. Klik **"Cek"**. Hasil muncul:
   - **Available** (hijau) — bisa dibeli
   - **Registered** (abu-abu) — sudah dimiliki orang lain
4. Kalau ada beberapa opsi (dari SLD-only cek), pilih salah satu yang available

### 1.2 Konfirmasi + bayar

Setelah pilih domain:

1. **Pastikan profil lengkap**. Wizard warn kalau ada field kosong:
   - Nama, email, telepon, alamat, kota, kode pos
   - Kalau incomplete → klik "Lengkapi profil" → ke `/settings/profile`
   - Beberapa TLD (mis. `.id`, `.co.id`) butuh NIK — isi di profil kalau perlu
2. **Pilih durasi**: 1-10 tahun. Beberapa TLD punya batas berbeda (mis. min 2 tahun) — wizard warn kalau di luar range
3. **Pilih metode bayar**:
   - **Midtrans** — pembayaran online (kartu kredit, VA bank, e-wallet Gopay/Ovo/Dana, QRIS)
   - **Paylabs** — pembayaran online alternative
   - **Transfer Bank Manual** — transfer manual, verify admin
   - **Wallet** (khusus reseller/agent) — debit langsung dari saldo
4. **Kupon promo** (opsional) — masukkan kode kalau ada
5. Klik **"Beli"**

### 1.3 Bayar via gateway

- **Midtrans/Paylabs**: redirect ke halaman gateway. Pilih channel bayar (VA/QRIS/e-wallet), selesaikan pembayaran.
- **Transfer Bank Manual**: dashboard tampil instruksi + nomor rekening + berita transfer. Setelah transfer, tunggu admin verify (max 1x24 jam).
- **Wallet**: langsung debit, no external step.

Setelah pembayaran sukses, sistem otomatis register domain di registry PANDI.

### 1.4 Status polling

Halaman `/sites/pending/<jobId>` polling status tiap 3 detik:

| Status | Artinya |
|---|---|
| `pending_payment` | Menunggu user bayar |
| `pending_provisioning` | Sudah bayar, tunggu EPP register |
| `active` | Domain sudah live di registry ✓ |
| `failed` | Register gagal (biasanya karena data invalid). Klik "Coba lagi" |
| `expired` | Window pembayaran habis. Klik "Mulai pembelian baru" |

### 1.5 Setelah active

Domain aktif → pilih template situs → editor buka. Situs live di URL yang
di-attach ke domain.

---

## 2. Kelola Domain

Buka `/settings/domains` untuk daftar domain aktif.

### 2.1 Ganti Nameserver

1. Klik domain → tab **Nameserver**
2. Edit list NS (min 2, max 13). Format hostname valid (mis. `ns1.example.com`)
3. Klik **Simpan**. Perubahan effect di registry biasanya < 30 detik

### 2.2 Cek WHOIS

Tab **WHOIS** menampilkan info registri (creation date, expiry, registrar). Owner name di-mask untuk privacy.

### 2.3 Perpanjang (Renew)

Sebelum expire:
1. `/settings/domains` → domain yang mau di-perpanjang → tab **Perpanjang**
2. Pilih durasi tambahan + metode bayar
3. Flow sama dengan beli baru: bayar → EPP renew → expiry date extend

**Email peringatan** otomatis dikirim 30 hari sebelum expire + resend 7 hari sekali sampai domain di-renew atau expire.

### 2.4 Update Contact

Tab **Kontak** untuk update nama/email/telepon owner yang tampil di WHOIS.
Perubahan effect langsung di registry.

---

## 3. Invoice

Buka `/settings/invoices-v2` untuk riwayat invoice.

### 3.1 Status invoice

| Status | Artinya |
|---|---|
| **Draft** | Belum ada payment session |
| **Belum dibayar** | Menunggu pembayaran |
| **Lunas** | Sudah dibayar, domain aktif |
| **Kedaluwarsa** | Window pembayaran habis |
| **Dibatalkan** | Cancel manual (admin atau user) |
| **Refund** | Refund manual (jarang) |

### 3.2 Cetak PDF

Klik tombol **🖨️ Cetak** di baris invoice → tab baru buka PDF. Simpan
sebagai file lokal untuk pembukuan.

### 3.3 Rincian invoice

Setiap invoice punya:
- Nomor unik format `INV-YYYY-MM-NNNNNN`
- Subtotal (tanpa PPN)
- PPN 11% (kalau di-enable di setting sistem)
- Total (subtotal + PPN)
- Metadata: domain, years, kind (register/renew), promo_code (kalau ada)

---

## 4. Wallet (Khusus Reseller/Agent)

Reseller + agent aktif punya wallet prepaid di web builder side.

### 4.1 Cek saldo

`/settings/wallet-v2` menampilkan:
- Balance current (IDR)
- History transaksi (topup, debit register, debit renew, refund, admin adjust)

### 4.2 Top-up saldo

Top-up flow **belum aktif di V2** — pending Task turn depan. Sementara,
top-up via legacy `/reseller/wallet/topup` atau minta admin credit manual
via `/admin/wallet/v2/adjust`.

### 4.3 Bayar via Wallet

Saat checkout wizard, pilih metode pembayaran **Wallet**. Saldo langsung
di-debit. Kalau tidak cukup → error 402 dengan pesan spesifik (balance,
required, shortfall). Top-up dulu sebelum retry.

---

## 5. FAQ

### 5.1 Domain saya tidak muncul di WHOIS setelah 1 jam

Cek di `/sites/pending/<jobId>` — kalau status masih `pending_provisioning`,
EPP register masih pending. Kalau > 1 jam:
- Cek email — apakah ada notifikasi failure?
- Hubungi support dengan mention `job_id`

### 5.2 Saya sudah transfer bank tapi status masih "Belum dibayar"

Manual bank transfer butuh verify admin (max 1x24 jam). Kalau > 24 jam,
kirim bukti transfer ke support email dengan mention nomor invoice.

### 5.3 Bisa upgrade dari kupon promo yang belum dipakai?

Kupon promo di-apply saat checkout (Beli). Setelah invoice terbit tidak
bisa apply promo tambahan.

### 5.4 Refund kalau register gagal?

Iya. Kalau register gagal karena system issue (bukan input error), refund
otomatis ke wallet dalam 1x24 jam. Kalau tidak, hubungi support.

### 5.5 Multi-tenant support?

Belum. Setiap deployment web builder = 1 tenant / registrar. Multi-tenant
SaaS mode di roadmap Fase 4.

---

## Kontak Support

Lihat footer invoice atau `/settings` → Support Contact.
