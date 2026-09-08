# Folder Screenshot

Drop file gambar di sini dengan nama sesuai referensi di markdown:

- `client-dashboard.png` — Dashboard user biasa
- `client-wizard-search.png` — Wizard search domain
- `client-wizard-confirm.png` — Konfirmasi pembelian
- `client-pending-status.png` — Halaman polling status
- `client-template-picker.png` — Pilih template setelah domain aktif
- `client-editor-overview.png` — Layout editor (3 kolom)
- `client-editor-block-add.png` — Cara add block baru
- `client-editor-layout-panel.png` — Panel Layout & Style
- `client-theme-page.png` — Halaman tema (color + font picker)
- `client-domain-detail.png` — Halaman kelola 1 domain

- `agent-dashboard.png` — Dashboard agent
- `agent-clients-list.png` — List klien yang di-assign
- `agent-buy-domain-obo.png` — Wizard beli domain "untuk klien"

- `reseller-dashboard.png` — Dashboard reseller (4 tile + checklist)
- `reseller-clients.png` — List klien + tab agent
- `reseller-invite-agent.png` — Dialog invite agent
- `reseller-wallet.png` — Wallet + top-up flow
- `reseller-pricing.png` — Set harga jual per TLD

- `admin-stats.png` — Overview stats admin
- `admin-users.png` — Manage users
- `admin-resellers-pending.png` — Approve reseller aplication
- `admin-invoices.png` — Verify manual bank transfer
- `admin-cf-configs.png` — Cloudflare config CRUD
- `admin-domain-detail.png` — Detail domain admin (dengan CF status)
- `admin-audit-log.png` — Audit log viewer
- `admin-banners.png` — Admin Moderasi Banner Guru cross-site (§27)

### Guru (Rumah Digital Guru — spec §20-§25)

Screenshot ini butuh sample data: minimal 1 site published pakai template
`guru-pandi-upi` (auto-seed 8 articles + 4 materials + 3 banners) di akun
client test.

- `guru-dashboard-ringkasan.png` — Halaman `/sites/[id]` (6 stat card + list terbaru)
- `guru-sidebar-dropdown.png` — Sidebar dashboard situs dengan dropdown "Guru ▾" terbuka (5 menu)
- `guru-tulisan-list.png` — `/sites/[id]/tulisan` (tabs 6 rubrik + tabel + tombol Tulisan Baru)
- `guru-tulisan-form.png` — `/sites/[id]/tulisan/new` (rubric selector + RichEditor + toggle comments)
- `guru-forum-list.png` — `/sites/[id]/forum` (tabel topik + CTA Topik Baru + info banner forum)
- `guru-tanggapan-moderasi.png` — `/sites/[id]/tanggapan` (tabs filter + card feed + Setujui/Tolak)
- `guru-pembelajaran-list.png` — `/sites/[id]/pembelajaran` (tabel materi tanpa kolom views)
- `guru-promosi-list.png` — `/sites/[id]/promosi` (grid banner 2:1 + status badge)
- `guru-profile-settings.png` — `/settings/profile-guru` (4 section: Identitas/Hero/Bio/Sosial)
- `guru-portal-directory.png` — `/guru` (portal publik direktori guru dengan kartu 3-kolom)

## Auto-Capture

Jangan capture manual — jalankan script otomatis. Lihat `../capture-screenshots/README.md`:

```bash
cd docs/user-guide/capture-screenshots
node capture.mjs                # capture semua role (client + agent + reseller + admin + guru)
node capture.mjs guru           # capture cuma role guru
node capture.mjs guru admin     # capture guru + admin
```

Output langsung masuk ke folder ini, otomatis dipakai HTML/PDF generator.

## Cara Capture Screenshot (Manual)

### macOS
- **Full window**: `Cmd + Shift + 4`, lalu tekan `Space`, klik window
- **Selection area**: `Cmd + Shift + 4`, drag area
- **Full screen**: `Cmd + Shift + 3`

Screenshot otomatis save ke Desktop (default). Pindah ke folder ini.

### Windows
- **Snipping Tool**: `Win + Shift + S` → drag area
- **Full screen**: `PrtScn`, paste di aplikasi image
- **Window**: `Alt + PrtScn`, paste

### Linux (GNOME)
- **Selection**: `Shift + PrtScn`
- **Full screen**: `PrtScn`

## Optimize File

Sebelum commit, resize + optimize:

```bash
# macOS (butuh install imagemagick: brew install imagemagick)
cd screenshots
for f in *.png; do
  convert "$f" -resize '1200>' -quality 85 "$f"
done

# Atau pakai tool online: tinypng.com
```

Target ukuran:
- < 200 KB per gambar
- Width max 1200px (readable di PDF A4)
- Format PNG (lossless untuk UI screenshot)

## Referensi di Markdown

Setelah upload, ganti placeholder di markdown:

**Sebelum** (placeholder):
```markdown
<!-- [screenshot: client-dashboard.png caption:Dashboard User] -->
```

**Sesudah** (real image):
```markdown
![Dashboard User](screenshots/client-dashboard.png)
```

Regenerate HTML: `./generate-html.sh` — gambar otomatis embed.
