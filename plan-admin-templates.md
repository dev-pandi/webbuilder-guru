# Plan: Admin Template Management + Live Preview

**Status:** Draft
**Tanggal:** 2026-07-29
**Konteks:** Sekarang template hardcoded di [builtin.go](apps/api/internal/templates/builtin.go) — di-seed saat startup. Admin tidak bisa CRUD dari UI, dan preview cuma static image URL. Butuh admin panel penuh + preview HTML seperti website beneran.

---

## 1. Current state

**Yang sudah ada (bisa di-reuse):**
- Table `templates` dengan `slug` + `category` + `variant` + `theme_json` + `pages_json` + `preview_url` (image thumbnail) + `is_premium`
- [templates.Repo](apps/api/internal/templates/repo.go): `List`, `GetBySlug`, `ApplyToSite`, `UpsertBuiltin`
- Seed dari `templates.BuiltinTemplates()` di startup (idempotent upsert per slug)
- Handler user-facing: `GET /templates`, `GET /templates/:slug`, `POST /sites/from-template/:slug`
- Renderer (`apps/renderer/`) sudah bisa render block tree per Host — dispatch via `app/[...slug]/page.tsx`
- Existing `_preview/[token]` route di renderer untuk draft site (butuh HMAC token)

**Yang belum ada:**
- Admin endpoint CRUD template (create/update/delete)
- Halaman `/admin/templates` di dashboard
- Route preview HTML untuk template (bukan static image)
- Editor block untuk template (currently: hanya editor untuk site instance)
- Preview modal/iframe di wizard client

---

## 2. Goals

1. **Admin CRUD template** — buat/edit/hapus template dari UI, tanpa perlu edit source code + redeploy.
2. **Live preview** — admin klik "Preview" di admin panel → buka rendered HTML seperti website beneran (bukan cuma gambar).
3. **Client preview** — di wizard `/sites/new-with-domain` → tombol "Preview" per template card → open live rendered HTML modal atau tab baru.
4. **Editor block re-use** — admin edit isi template pake block editor yang sama dengan site editor (drag block, ganti teks, atur tema).

Non-goals (defer):
- Template versioning / rollback
- Fork template dari public template lain
- A/B test per template

---

## 3. Data model changes

### 3.1 Extend `templates` table

Migration `0033_templates_admin_metadata.sql`:

```sql
ALTER TABLE templates
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
        -- 'draft' | 'published' | 'archived'
        -- draft = admin lagi build, tidak tampil di client wizard
        -- published = live, muncul di /templates public list
        -- archived = deprecated, hidden dari list tapi existing site tetap jalan
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin',
        -- 'builtin' | 'admin'
        -- builtin = dari BuiltinTemplates() di source code, tidak boleh di-hapus admin
        -- admin = dibuat via /admin/templates UI, full CRUD
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS preview_screenshot_url TEXT NOT NULL DEFAULT '';
        -- Auto-generated screenshot via headless browser (Phase 4+). MVP kosong.

-- Backfill: existing builtin templates → source='builtin'.
UPDATE templates SET source = 'builtin' WHERE source = 'admin';
CREATE INDEX IF NOT EXISTS idx_templates_status_source ON templates(status, source);
```

**Reason `source` flag:**
- Admin tidak boleh delete builtin (source code = source of truth, restore saat startup).
- Admin bisa edit builtin di UI, tapi perubahan **akan overwritten** saat next startup (upsert). Tampil warning di UI.
- Solusi bersih: admin edit builtin → clone jadi template baru dengan source='admin', lalu edit copy-nya. Original builtin tidak berubah.

### 3.2 Template preview access

Template preview tidak butuh auth — public browsable (dashboard client + wizard client bisa preview sebelum login). Rate limit di endpoint renderer sudah ada (RateLimitIP global).

---

## 4. Backend

### 4.1 Endpoints baru

| Method | Path                                    | Role  | Purpose |
|--------|-----------------------------------------|-------|---------|
| GET    | `/api/v1/admin/templates`               | admin | List all (semua status + source) dengan pagination |
| GET    | `/api/v1/admin/templates/:id`           | admin | Detail lengkap termasuk `pages_json` untuk editor |
| POST   | `/api/v1/admin/templates`               | admin | Create template baru (default status=draft, source=admin) |
| PATCH  | `/api/v1/admin/templates/:id`           | admin | Update meta atau isi (pages_json) |
| POST   | `/api/v1/admin/templates/:id/publish`   | admin | Flip status draft → published |
| POST   | `/api/v1/admin/templates/:id/archive`   | admin | Flip status published → archived |
| DELETE | `/api/v1/admin/templates/:id`           | admin | Hapus (403 kalau source=builtin) |
| POST   | `/api/v1/admin/templates/:id/duplicate` | admin | Copy jadi template baru dengan slug baru — dipakai untuk fork builtin |
| GET    | `/public/template-preview/:slug`        | any   | Public rendered HTML (dipakai renderer + wizard iframe) |

`/public/*` endpoints existing di renderer package — kita tambah 1 endpoint baru.

**Backend files:**
- [admin/template_handler.go](apps/api/internal/admin/template_handler.go) (baru) — 8 handlers di atas
- [templates/repo.go](apps/api/internal/templates/repo.go) — tambah `Create`, `Update`, `Delete`, `SetStatus`, `Duplicate`, `ListForAdmin(filter)` (superset `List` yang expose semua status)
- [public/handler.go](apps/api/internal/public/handler.go) — tambah `GetTemplatePreview(slug)` yang return meta + pages_json + theme_json untuk renderer

**Validation di admin handler create/update:**
- `slug` — kebab-case unique, regex `^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`
- `pages_json` — parse sebagai array of `{slug, title, tree, seo, is_home}`; minimal 1 page dengan is_home=true
- `theme_json` — parse sebagai object (bebas struktur, forward as-is ke renderer)
- `category` — enum: `school | umkm | portfolio | teacher | blog | landing | other`

### 4.2 Guard: builtin protection

- `Delete` — 403 kalau `source='builtin'`, pesan: "Template built-in tidak boleh di-hapus. Duplicate dulu lalu edit copy-nya."
- `Update` — allowed for builtin, tapi warning UI: "Perubahan akan hilang saat server restart karena template ini di-track di source code."

### 4.3 Theme + font system (reuse existing)

**Sudah lengkap di codebase — tidak perlu kode baru:**

Shape `theme_json` (di [renderer/lib/api.ts](apps/renderer/lib/api.ts)):
```typescript
type ThemeJson = {
  colors?: { primary?: string; secondary?: string; bg?: string; fg?: string };
  font?: { heading?: string; body?: string };  // nama Google Font, mis. "Poppins"
  radius?: string;                              // "0.5rem" | "0.75rem" | "1rem"
};
```

Contoh untuk template UMKM (fresh green):
```json
{
  "colors": { "primary": "#059669", "secondary": "#10b981", "bg": "#f0fdf4", "fg": "#064e3b" },
  "font": { "heading": "Poppins", "body": "Inter" },
  "radius": "0.75rem"
}
```

**Pipeline injection (existing di [renderer/lib/theme.ts](apps/renderer/lib/theme.ts)):**

1. `themeToCss(theme)` → return CSS variables di `:root`:
   ```css
   :root {
     --color-primary: #059669;
     --font-heading: "Poppins", system-ui, sans-serif;
     ...
   }
   ```
2. `googleFontsUrl(theme)` → return `https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap`.
3. Renderer inject `<style>` + `<link rel="stylesheet">` di `<head>`.
4. Semua block sudah pakai `var(--color-primary)`, `var(--font-heading)` — theme apply universal tanpa per-block config.

**Untuk template preview endpoint (Section 4.4):** panggil dua helper existing dengan `template.theme_json` sebagai input — **zero kode baru** di layer theme. Font Google auto-load ke iframe preview via `<link>` yang sama.

**Font whitelisting (nice-to-have, defer):** Sekarang admin bisa isi font apapun; kalau typo (mis. "Popins") → Google Fonts return 400, fallback ke system-ui. Kalau butuh guard, buat const `SUPPORTED_FONTS = ["Inter", "Poppins", "Roboto", "Playfair Display", ...]` di UI dropdown supaya admin tidak salah ketik.

### 4.4 Renderer route

Renderer (`apps/renderer/`) dapat route baru: `app/_template-preview/[slug]/page.tsx`. Flow:

```
Client wizard/admin → renderer:3000/_template-preview/<slug>
  ↓
Renderer fetch: GET api/public/template-preview/<slug>
  ↓
API return: { theme, pages: [{ slug, title, tree, seo, is_home }] }
  ↓
Renderer inject theme CSS variables + render is_home page block tree
  ↓
Rendered HTML server-side (same block dispatch sebagai `app/[...slug]/page.tsx`)
```

Kalau template punya multiple pages (mis. Home + About + Contact), preview default ke `is_home=true`. URL variant: `/_template-preview/:slug/:page_slug` bisa render page lain (link antar-page di preview tetap point ke `/_template-preview/:slug/xxx`).

---

## 5. Admin UI

### 5.1 List page `/admin/templates`

Tabel dengan kolom:
- Thumbnail (preview screenshot atau icon placeholder kalau kosong)
- Slug (mono)
- Nama + kategori badge
- Variant (Modern / Clean / Professional)
- Status badge (Draft / Published / Archived)
- Source badge (Builtin / Admin)
- Aksi: Preview (buka tab baru), Edit, Publish/Archive toggle, Hapus (disabled untuk builtin), Duplicate

Filter chips: Semua / Draft / Published / Archived / Builtin / Admin
Search by name + slug (debounced 350ms)

### 5.2 Create/Edit page `/admin/templates/[id]` (atau `/new`)

Layout 2 kolom:

**Kiri (metadata form):**
- Nama, Slug, Deskripsi, Category dropdown, Variant chip (Modern/Clean/Professional)
- Preview URL (thumbnail image, optional — nanti auto-gen via headless Chrome)
- Is Premium toggle
- Status (Draft / Published)

**Theme & Font picker** (reuse pattern dari [/sites/[id]/theme](apps/web/app/sites/[id]/theme/page.tsx)):

- **Color pickers** (4 field) — Primary, Secondary, Background, Foreground. Native `<input type="color" />` + preview swatch + hex code. Preset chips untuk quick pick:
  - Neutral: `#0f172a / #64748b / #ffffff / #0f172a`
  - Ocean: `#0ea5e9 / #06b6d4 / #f0f9ff / #0c4a6e`
  - Forest: `#059669 / #10b981 / #f0fdf4 / #064e3b`
  - Sunset: `#f59e0b / #f97316 / #fff7ed / #7c2d12`
  - Berry: `#8b5cf6 / #ec4899 / #faf5ff / #4c1d95`
- **Font family dropdown** (2 field) — Heading + Body. Curated list Google Fonts:
  - Sans-serif: Inter, Poppins, Roboto, Open Sans, Nunito, Work Sans, Manrope, Plus Jakarta Sans
  - Serif: Playfair Display, Merriweather, Lora, EB Garamond
  - Display: Bebas Neue, Righteous, Fredoka
  - Live font preview di bawah dropdown ("The quick brown fox…") — inject Google Font via `<link>` on-the-fly saat dropdown berubah supaya admin lihat rendering asli sebelum simpan.
- **Radius selector** — 3 chip preset: Sharp (`0`), Rounded (`0.5rem`), Pill (`1rem`).
- **Live preview panel** — sample block (button, card, heading, paragraph) update real-time saat admin ganti color/font. Component sudah ada di `apps/web/app/sites/[id]/theme/page.tsx` (function `PreviewCard`), extract ke `components/theme/ThemePreview.tsx` supaya bisa di-reuse di admin template editor.
- **Advanced (collapsible):** JSON editor mentah untuk edit `theme_json` langsung (untuk theme yang butuh field custom masa depan).

Output form → `theme_json` object yang di-save persist ke DB. Preview button di-bawah → save-then-open renderer preview URL (theme_json ter-apply).

**Kanan (page tree editor):**
- List halaman di template (Home, About, dst.) dengan tombol "Tambah page"
- Klik page → buka block editor inline (reuse `apps/web/app/sites/[id]/editor/` component)
- Set `is_home` per page (radio group — 1 home max)
- Font Google auto-load ke editor iframe via `<link>` (sama seperti live preview) supaya WYSIWYG editor render dengan font yang benar

**Bottom actions:**
- Simpan Draft
- Publish (validate: minimal 1 home page + pages tidak kosong)
- Preview live (open new tab → `/_template-preview/<slug>`)

### 5.3 Preview integration di wizard client

Di [_result-card.tsx](apps/web/app/sites/new-with-domain/_result-card.tsx) atau kartu template:
- Tombol kecil "Preview" per kartu template → open modal dengan iframe `<iframe src="/_template-preview/<slug>" />`
- Modal responsive dengan device switcher (Desktop / Tablet / Mobile) — set iframe width
- Tombol "Pakai template ini" di dalam modal → close + set selected template

---

## 6. Editor block untuk template

**Challenge:** Editor block existing (`apps/web/app/sites/[id]/editor/`) di-couple dengan site ID + `/api/v1/sites/:id/pages` endpoints. Template tidak punya site ID — cuma `pages_json` blob di templates row.

**Approach A — In-memory editor** (recommended MVP):
- Editor state hidup di React (`useState<BlockData[]>`), tidak auto-save per keystroke
- Load: fetch template `pages_json` → set state
- Save: klik "Simpan" → PATCH `/admin/templates/:id` dengan full `pages_json` payload
- Undo/redo tetap jalan (pakai `useBlocksHistory` yang sudah ada)
- Preview: pakai in-memory state → serialize → pass ke iframe via `postMessage` (atau save-then-preview cycle)

**Approach B — Sandbox site** (defer, lebih clean tapi lebih effort):
- Admin build template dengan bikin site sandbox dulu (`admin_template_sandbox` flag)
- Publish sandbox → convert site pages ke template pages_json
- Semua flow site editor bisa dipakai tanpa refactor

Pilih Approach A untuk MVP karena reuse existing editor internals tanpa perlu introduce sandbox concept.

---

## 6.5 Theme inheritance flow

Penting supaya jelas siapa yang punya theme di runtime:

```
Template.theme_json           = default theme (admin set saat build template)
       ↓ (copy saat CreateSiteFromTemplate)
Site.theme_json               = starting point (equal ke template.theme_json)
       ↓ (client edit via /sites/[id]/theme)
Site.theme_json (modified)    = final theme (client punya kendali, template tidak
                                 auto-update kalau admin edit template kemudian)
```

**Implikasi:**
1. **Site di-snapshot dari template** — kalau admin update `template.theme_json` setelah client sudah pakai template, existing site TIDAK ikut berubah. Client kebutuhan berbeda? Cukup edit di `/sites/[id]/theme`.
2. **Template variant** (Modern/Clean/Professional) = beda `theme_json` + beda `pages_json` layout. Bukan beda category. 1 category punya 3 variant, artinya total 15 template built-in untuk 5 category.
3. **Ganti template mid-flight** — kalau client mau "ganti" template setelah site jadi, itu = replace `pages_json` + `theme_json` di site. Endpoint `POST /sites/:id/apply-template` sudah ada dengan mode `theme` (theme only), `replace` (theme + pages), `append` (tambah pages ke existing). Reuse untuk switch template kalau nanti UI tersedia.

## 7. Preview screenshot auto-gen (nice-to-have)

**Trigger:** setelah admin `Publish` template.

**Options:**
- **Playwright/Chromium di API** — heavy dep, ~200MB image. Skip untuk MVP.
- **Cloudflare Browser Rendering API** — external service, $ per screenshot. Nice untuk production, defer.
- **Manual upload** — admin upload thumbnail sendiri (paling simple). **MVP: pakai ini.**

Field `preview_url` (thumbnail image, opsional) tetap manual upload di admin form. `preview_screenshot_url` field baru — nanti dipakai Phase 5+ untuk auto-screenshot.

---

## 8. Milestone breakdown

| Phase | Scope | Effort |
|---|---|---|
| 1 | Migration 0033 + repo methods + admin CRUD handler | 4-6 jam |
| 2 | Renderer `/_template-preview/:slug` route + public API endpoint | 3-4 jam |
| 3 | Admin `/admin/templates` list page + delete/publish/archive/duplicate | 4-6 jam |
| 4 | Admin create/edit page — metadata form + JSON editor untuk pages_json | 4-6 jam |
| 5 | Reuse block editor untuk edit pages_json in-memory | 8-12 jam |
| 6 | Client wizard preview modal dengan iframe + device switcher | 4-6 jam |
| 7 | Manual thumbnail upload di admin form | 2-3 jam |
| **Total** | | **~29-43 jam (~4-5 hari)** |

**Rekomendasi phase order:** 1 → 2 → 3 → 4 → 6 → 5 → 7. Jadi admin bisa CRUD template + preview mulai dari phase 4, editor block visual di phase 5 di-defer supaya value earlier (admin bisa paste JSON manual dulu untuk edit).

---

## 9. Convention notes (untuk implementasi)

- **Slug uniqueness** — DB unique constraint. Admin bisa reuse slug builtin (mis. `umkm-modern`) kalau delete builtin dulu (403). Solusi: admin duplicate builtin dengan slug baru (mis. `umkm-modern-custom`).
- **Backward compat** — `CreateSiteFromTemplate` sekarang cari template by `slug` global. Tidak affect — admin templates bisa langsung dipakai client via wizard.
- **Cache invalidation** — kalau template di-publish/update, wizard client boleh kena stale list (30s revalidate). Manual refresh tab OK untuk MVP.
- **Audit log** — Phase 7 audit log sudah ada; tambah event constants `template.created`, `template.updated`, `template.published`, `template.deleted`. Instrument di admin handler.
- **Public list filtering** — `GET /templates` (existing user-facing) harus filter `status='published' AND source IN ('builtin', 'admin')`. Draft + archived tidak muncul.

---

## 10. Open questions

1. **Preview scope**: template dengan multiple pages — preview render `is_home` saja, atau ada navigasi antar-page? **Rekomendasi:** navigasi antar-page di preview (kalau template ada > 1 page). URL: `/_template-preview/:slug/:page_slug`.
2. **Sample data**: template `umkm` di-seed dengan sample product oleh `CreateSiteFromTemplate` handler. Preview mode → apakah juga tampilkan sample product? **Rekomendasi:** ya, hard-code di renderer template-preview atau fetch dari fixture JSON. Konsisten dengan hasil client akan lihat.
3. **Custom domain preview**: preview di iframe pakai renderer URL langsung. Tidak masalah cross-origin karena kita host renderer + dashboard di 1 domain root. Konfirmasi: `renderer.internal:3000/_template-preview/:slug` accessible dari `app.internal:4001/admin/templates/[id]/preview` — YES (browser fetch berbeda origin, iframe tidak restricted untuk display).
4. **Draft accessibility**: apakah preview draft template accessible tanpa auth? **Rekomendasi:** Draft = admin-only preview via URL berikut token pendek (mirror preview site draft flow). Published = public.

---

## 11. Post-MVP extensions

- **Auto-screenshot** via headless browser (Phase 5+): trigger saat publish, save ke S3, populate `preview_screenshot_url`.
- **Template categories tree**: admin bisa buat category baru (currently hard-coded enum di UI).
- **Fork from published** — client bisa "clone" published template ke draft mereka sendiri di site editor.
- **Marketplace** — reseller bisa jual template mereka sendiri. Butuh reseller_id di templates + royalty flow.
- **A/B test slot** — 2 template varian tampil random ke client wizard untuk uji conversion.

---

## 12. Testing checklist (post-implementation)

- [ ] Admin create template baru status=draft → tidak muncul di client `/templates` public list
- [ ] Admin publish → muncul di client list
- [ ] Client klik "Preview" di wizard → open iframe `/_template-preview/:slug` → HTML render seperti site real
- [ ] Admin edit builtin template → save → restart server → perubahan hilang (builtin restored)
- [ ] Admin delete builtin → 403 dengan pesan yang jelas
- [ ] Admin duplicate builtin → template baru dengan source='admin', slug baru unique
- [ ] Preview theme colors + font ter-apply (bukan default primary)
- [ ] Google Font ter-load di iframe preview (bukan system fallback) — cek network tab ada request ke `fonts.googleapis.com`
- [ ] Ganti font di admin editor → live preview panel update real-time (sebelum save)
- [ ] Color preset chip (Ocean/Forest/dst.) → apply 4 warna sekaligus + live preview refresh
- [ ] Site yang di-create dari template → snapshot `theme_json` (bukan reference). Update template setelah client punya site → site tidak berubah.
- [ ] Preview multi-page — navigasi antar page tetap dalam iframe preview
- [ ] Archived template — tidak muncul di client list, tapi existing site tetap jalan (pakai snapshot theme+pages saat create dulu)
- [ ] Slug validation reject invalid pattern (uppercase, underscore, dst.)
- [ ] Publish dari draft validate minimal 1 home page + pages tidak kosong

---

## Ringkasan singkat

Fitur ini reuse existing infra: `templates` table, block renderer, block editor. Yang perlu dibuat: 8 admin endpoints + 1 preview route di renderer + 2 halaman admin (list + edit) + 1 modal wizard. Estimasi 4-5 hari kerja fokus untuk phase 1-6 (block editor reuse di phase 5 paling besar effort-nya).

Filed: `plan-admin-templates.md` — konsisten dengan pola dokumen plan-* lain di repo ini.
