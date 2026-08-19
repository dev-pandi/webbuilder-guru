# Bab 2 — Panduan Agent

Agent adalah freelancer atau staff dari Reseller yang membantu klien setup
situs. Semua transaksi Agent otomatis di-debit dari **wallet Reseller induk**,
bukan wallet pribadi.

## 2.1 Cara Jadi Agent

Anda tidak bisa daftar Agent sendiri. Reseller induk akan **kirim invitation
email**:

1. Buka email dari Reseller — subject "Undangan Agent di [Nama Reseller]"
2. Klik link → halaman `Terima Undangan`
3. Set password Anda (email sudah pre-filled dari invitation)
4. Auto-login ke `/agent/dashboard`

## 2.2 Dashboard Agent

![Dashboard Agent](screenshots/agent-dashboard.png)

### Alur Kerja Agent

```
      ┌─────────┐
      │ Reseller│
      └────┬────┘
           │ invite
           ▼
      ┌─────────┐
      │  Anda   │  ◄── Login sebagai Agent
      │  Agent  │
      └────┬────┘
           │ manage
           ▼
      ┌─────────┐        ┌─────────┐
      │  Klien  │───────►│ Domain  │
      │(assigned│        │ Situs   │
      │ ke Anda)│        │(dibeli  │
      └─────────┘        │ atas    │
                         │ nama    │
                         │ klien)  │
                         └─────────┘
                              ▲
                              │ debit
                              │
                         ┌──────────┐
                         │ Wallet   │
                         │ Reseller │
                         │  (induk) │
                         └──────────┘
```

`/agent/dashboard` — overview aktivitas Anda:

- **Klien saya** — jumlah klien yang di-assign ke Anda (bisa < total klien Reseller)
- **Domain aktif** — total domain yang Anda register untuk klien
- **Pending jobs** — domain yang lagi proses (belum active)
- **Wallet activity** — riwayat transaksi Anda (di-debit dari wallet Reseller)

## 2.3 Kelola Klien

![List Klien Agent](screenshots/agent-clients-list.png)

Menu **Klien** — `/agent/clients`:

### List Klien

Menampilkan semua klien yang di-assign ke Anda oleh Reseller induk. Perhatikan:
- Anda cuma lihat klien yang **assignment aktif** ke Anda
- Kalau Reseller cabut assignment (revoke), klien hilang dari list
- Anda **tidak bisa** invite klien baru sendiri — itu tugas Reseller

### Detail Klien

Klik row klien → halaman `/agent/clients/<id>`:

- **Info klien**: nama, email, telepon, alamat
- **Domain**: list domain yang klien punya (self + yang Anda belikan)
- **Situs**: list situs klien + link ke editor
- **Invoice**: riwayat transaksi klien
- **Aksi**:
  - **Beli Domain untuk klien** — trigger wizard OBO
  - **Edit profil klien** (nama, alamat, NIK)

### Edit Profil Klien

Karena Anda "care of" klien, Anda boleh update profil mereka untuk kelengkapan
WHOIS:

1. Klik **Edit Profil** di halaman detail klien
2. Update field yang kurang (mis. NIK untuk domain `.id`)
3. Simpan

Klien tetap bisa update sendiri kapan pun via login mereka.

## 2.4 Beli Domain untuk Klien (On-Behalf-Of)

![Wizard Beli Domain OBO](screenshots/agent-buy-domain-obo.png)

Flow inti Agent: beli domain untuk klien pakai wallet Reseller induk.

### Langkah

1. Halaman detail klien → klik **Beli Domain**
2. Redirect ke wizard `/sites/new-with-domain?for_client=<uuid>`
3. Header wizard menampilkan **"Untuk klien: [nama klien]"** — konfirmasi Anda benar
4. Isi wizard seperti biasa:
   - Cari domain
   - Konfirmasi (pakai profil **klien**, bukan Anda)
   - Upload dokumen klien (kalau perlu)
   - **Metode bayar: pilih Wallet** — otomatis debit wallet Reseller induk
5. Klik **Beli & Bayar** → langsung `pending_provisioning` (instant, no gateway)
6. Setelah domain active → pilih template → situs dibuat, **owner = klien**

### Yang Otomatis Terjadi

- Domain di-register atas nama klien (WHOIS contact = klien)
- Situs otomatis attach ke domain
- Anda otomatis di-add sebagai **editor** di situs klien (bisa edit tapi tidak hapus)
- Transaksi dicatat di ledger wallet Reseller dengan metadata `agent_id = Anda`
- Reseller induk bisa lihat "berapa yang Anda pakai" di menu Wallet → Agents Breakdown

## 2.5 Metode Bayar Wallet

Agent **tidak punya wallet pribadi**. Setiap "bayar" via Wallet =
potong saldo wallet Reseller induk.

### Kalau Saldo Kurang

Kalau wizard tampilkan "Saldo kurang" saat pilih Wallet:
- Metode Wallet di-disable
- Alternatif: pilih gateway (Midtrans/Paylabs) — bayar sendiri, nanti coordination dengan Reseller
- Atau minta Reseller top-up dulu

### Lihat Aktivitas Anda

Menu **Wallet Activity** — list transaksi yang Anda trigger yang di-debit
dari wallet Reseller induk. Include:
- Domain register untuk klien X: `−Rp 250.000`
- Domain renew untuk klien Y: `−Rp 200.000`

Anda **tidak bisa** top-up wallet — itu tugas Reseller.

## 2.6 Manage Situs Klien

Setelah domain klien active + situs dibuat, Anda otomatis jadi editor:

1. Menu **Kolaborasi** — list semua situs klien yang Anda edit
2. Klik row → buka editor situs
3. Edit blocks, tema, konten seperti owner (kecuali tidak bisa hapus situs)

Klien juga bisa edit sendiri — kolaborasi real-time (dengan versi history).

## 2.7 Statistik Pribadi

Menu **Statistik** — `/agent/stats`:

- **Total klien** — yang di-assign ke Anda
- **Total domain register** — yang Anda trigger
- **Total revenue** — nilai transaksi yang Anda trigger (untuk komisi dari Reseller)
- **Breakdown per bulan** — chart aktivitas

## 2.8 Purchases History

Menu **Purchases** — `/agent/purchases`:

Semua register + renew yang Anda trigger, dengan info:
- Nama klien
- Nama domain
- Tahun
- Total
- Status (active / pending / failed)
- Timestamp

Filter:
- Status: all / active / pending / failed
- Kind: register / renew

Klik row → link ke halaman detail domain (kalau active) atau pending page
(kalau masih proses).

## 2.9 Team Domains

Menu **Domain Klien** — `/agent/domains`:

Berbeda dari Purchases (yang transaction log), ini list **per FQDN unik** —
1 baris per domain, current state:
- Nama domain
- Klien pemilik
- Status
- Expire date
- Situs terkait (kalau ada)

Cocok untuk monitor "domain klien mana yang mau expire" — filter
`expires_at ≤ 30 hari`.

## 2.10 Batasan Agent

Yang **TIDAK BISA** Agent lakukan (harus lewat Reseller):

- ❌ Invite klien baru
- ❌ Assign klien ke agent lain
- ❌ Top-up wallet
- ❌ Set harga jual
- ❌ Hapus klien
- ❌ Lihat aktivitas agent lain di tim Reseller

Kalau butuh salah satu di atas, koordinasi dengan Reseller induk.

## 2.11 Troubleshoot

**Klien saya hilang dari list**
- Reseller mungkin cabut assignment (revoke). Konfirmasi ke Reseller.

**Beli domain gagal — saldo kurang**
- Cek wallet Reseller di dashboard (menu Wallet — untuk Agent view balance saja, tidak bisa top-up)
- Kalau kurang, minta Reseller top-up dulu

**Klien butuh edit domain tapi saya tidak lihat opsi Edit Contact**
- Fitur ini di-lock ke owner domain (klien) via halaman `/settings/domains/<domain>`
- Klien harus login sendiri untuk update. Anda cuma bisa edit **situs**, tidak **domain settings**.

**Situs klien tidak bisa saya edit walau saya sudah beli untuk mereka**
- Cek `/collaborations` — semua situs di mana Anda editor
- Kalau tidak muncul, kemungkinan collaborator entry gagal di-create. Hubungi admin.
