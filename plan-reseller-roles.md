# Plan: Reseller + Agent Roles

Feature untuk memungkinkan **Reseller** (mitra bisnis / agency) dan **Agent** (freelancer / sales) mendaftarkan domain + membangun situs atas nama end-user. End-user tinggal login untuk edit konten — semua kerja teknis (beli domain, setup DNS, pilih template, isi konten awal) sudah diselesaikan.

Target: unlock B2B channel + reseller marketplace tanpa mengubah pengalaman end-user existing.

---

## 1. Tujuan & non-tujuan

### Tujuan
- Reseller/agent bisa **register domain** + **buat situs** on-behalf-of client dalam 1 alur
- End-user (klien) menerima link invitation via email → set password → dashboard sudah punya situs siap edit
- Reseller punya portal terpisah dengan multi-client management + billing agregat
- Agent = "junior reseller" — scope terbatas ke klien yang di-assign, tidak bisa manage agent lain
- **Data isolation**: reseller A tidak bisa lihat data reseller B; klien tidak lihat data reseller

### Non-tujuan (out of scope untuk MVP)
- White-label reseller (custom brand di dashboard) — future
- Commission tracking automation — manual export dulu
- Reseller punya sub-billing gateway sendiri (semua tetap via PANDI reseller JWT)
- Reseller bisa jual template custom mereka (marketplace) — future

---

## 2. Terminology

| Istilah | Definisi |
|---|---|
| **Admin** | Platform superuser (tim internal web builder). Bisa apa saja. |
| **Reseller** | Bisnis/agency yang jual layanan web-builder ke banyak klien. B2B partner. |
| **Agent** | Freelancer / sales di bawah reseller. Kerja per-client assignment. |
| **Client** | End-user yang situsnya di-manage. Terima produk jadi dari reseller/agent. Sama dengan `user` role saat ini. |
| **Handoff** | Proses transfer edit access dari reseller/agent ke client (via email invite). |
| **Ownership** | Site selalu di-owned by client. Reseller/agent punya akses via collaborator ACL. |

---

## 3. Role hierarchy + permission matrix

```
┌─────────────────────────────────────────────────────────────┐
│                       Admin (Platform)                       │
│  - Approve reseller signup                                  │
│  - Set reseller pricing tier                                │
│  - Global stats + moderation                                │
└─────────────────────────┬───────────────────────────────────┘
                          │ manages
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         Reseller (B2B partner, mis. "PT Ceria Digital")      │
│  - Invite/manage agents                                     │
│  - Register domain + create site untuk client               │
│  - Lihat consolidated billing semua client                  │
│  - Handoff site ke client                                   │
└─────────────────────────┬───────────────────────────────────┘
                          │ assigns clients
                          ▼
┌─────────────────────────────────────────────────────────────┐
│         Agent (freelancer di bawah reseller)                 │
│  - Register domain + create site untuk assigned clients     │
│  - Edit site while in setup phase                           │
│  - Handoff ke client                                        │
│  - Tidak lihat client lain (yang bukan assigned-nya)        │
└─────────────────────────┬───────────────────────────────────┘
                          │ handoff
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Client (end-user)                         │
│  - Login → dashboard menampilkan site(s)                    │
│  - Full edit access (block editor, publish, dst.)           │
│  - Bisa upgrade/downgrade paket, beli domain tambahan       │
└─────────────────────────────────────────────────────────────┘
```

### Permission matrix

| Aksi | Admin | Reseller | Agent | Client |
|---|---|---|---|---|
| Login | ✅ semua | ✅ | ✅ | ✅ |
| Create user (invite) | ✅ semua | ✅ client baru | ✅ client baru (asigned to self) | ❌ |
| Create agent | ✅ | ✅ (di bawah dirinya) | ❌ | ❌ |
| Beli domain untuk client lain | ✅ | ✅ (client-nya) | ✅ (assigned) | ✅ (dirinya) |
| Beli domain untuk diri sendiri | ✅ | ✅ | ✅ | ✅ |
| Create site untuk client | ✅ semua | ✅ client-nya | ✅ assigned | ✅ dirinya |
| Edit site content | ✅ semua | ✅ client-nya (during setup) | ✅ assigned | ✅ dirinya |
| Publish site | ✅ semua | ✅ client-nya | ✅ assigned | ✅ dirinya |
| Handoff site to client | ✅ | ✅ | ✅ | — |
| Setelah handoff, edit access reseller/agent | Retained kalau opt-in | Retained kalau opt-in | Retained kalau opt-in | Owner |
| Lihat billing invoice | ✅ semua | ✅ own + all clients | ✅ own | ✅ own |
| Delete site | ✅ | ⚠️ confirm (client owns) | ⚠️ confirm | ✅ |

**Note "retained kalau opt-in"**: Client bisa toggle "Izinkan reseller/agent akses" di settings. Default `true` selama 30 hari post-handoff (grace period untuk support), lalu auto-false.

---

## 4. Data model

### 4.1 Modifikasi `users` table

```sql
ALTER TABLE users
    ADD COLUMN role TEXT NOT NULL DEFAULT 'client',
        -- 'admin' | 'reseller' | 'agent' | 'client' (rename dari 'user')
    ADD COLUMN parent_reseller_id UUID REFERENCES users(id) ON DELETE SET NULL,
        -- Untuk agent: FK ke reseller yang manage. NULL untuk role lain.
    ADD COLUMN reseller_display_name TEXT NOT NULL DEFAULT '',
        -- Nama bisnis reseller (mis. "PT Ceria Digital"). Muncul di email invite ke client.
    ADD COLUMN reseller_status TEXT NOT NULL DEFAULT '',
        -- '' | 'pending_approval' | 'active' | 'suspended'
        -- Hanya untuk role='reseller'. Admin approve dulu sebelum bisa transact.
    ADD COLUMN reseller_tier TEXT NOT NULL DEFAULT '';
        -- 'basic' | 'gold' | 'platinum' — untuk pricing markup. Admin-set.

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_parent_reseller_id ON users(parent_reseller_id)
    WHERE parent_reseller_id IS NOT NULL;
```

**Migration rule utk existing:**
- `role='admin'` untuk user yang currently punya `role='admin'`
- `role='client'` untuk semua lainnya (bukan reseller/agent)

### 4.2 New table `client_assignments`

Tracks siapa manage siapa. Reseller → clients + Agent → clients.

```sql
CREATE TABLE client_assignments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Manager: user_id reseller ATAU agent
    manager_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Client yang di-manage (role='client')
    client_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Role saat assignment (mis. agent bisa naik jadi reseller, kita snapshot)
    manager_role TEXT NOT NULL, -- 'reseller' | 'agent'
    -- Status editing access dari manager POV
    access_status TEXT NOT NULL DEFAULT 'setup',
        -- 'setup' (pre-handoff, full edit)
        -- 'active' (post-handoff, client toggle-able)
        -- 'revoked' (client cabut akses)
    -- Timeline
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    handed_off_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    UNIQUE (manager_id, client_id)
);
CREATE INDEX idx_client_assignments_client_id ON client_assignments(client_id);
CREATE INDEX idx_client_assignments_manager_id ON client_assignments(manager_id);
```

### 4.3 New table `user_invitations`

Track email invites (untuk handoff atau agent onboarding).

```sql
CREATE TABLE user_invitations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL,
    -- Peran user setelah accept
    invited_role  TEXT NOT NULL,
        -- 'agent' | 'client'
    -- Siapa yang invite (reseller invite agent/client; agent invite client)
    invited_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Untuk client invite: pre-created user_id yang akan di-claim
    -- Untuk agent invite: NULL (agent akan buat user baru saat signup)
    target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    -- HMAC-signed token untuk claim link
    token_hash    TEXT NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    accepted_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_invitations_email ON user_invitations(email);
CREATE INDEX idx_user_invitations_token_hash ON user_invitations(token_hash);
```

### 4.4 Extend `domain_purchases`

Track siapa yang beli (bukan cuma untuk siapa).

```sql
ALTER TABLE domain_purchases
    ADD COLUMN purchased_by UUID REFERENCES users(id) ON DELETE SET NULL;
    -- Reseller/agent yang trigger beli. NULL kalau end-user beli sendiri
    -- (backward-compat untuk row existing).

CREATE INDEX idx_domain_purchases_purchased_by ON domain_purchases(purchased_by)
    WHERE purchased_by IS NOT NULL;
```

**Semantic:**
- `user_id` = owner domain (siapa yang miliki, invoice ditagihkan ke sini kelak — atau ke `purchased_by` tergantung billing model)
- `purchased_by` = siapa yang trigger transaksi (reseller/agent)
- Untuk existing rows (self-purchase), `purchased_by = user_id`

### 4.5 Extend `sites` — collaborator access

Sudah rencana `site_members` table (dari roadmap Team roles). Reuse untuk reseller/agent akses:

```sql
CREATE TABLE site_members (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL,  -- 'owner' | 'editor' | 'viewer'
    added_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (site_id, user_id)
);
CREATE INDEX idx_site_members_user_id ON site_members(user_id);
```

**Migration untuk existing sites:** insert row `owner` untuk `sites.user_id` supaya query pakai pattern uniform.

**Post-handoff:** insert row `editor` untuk reseller/agent (dengan expiration ke `client_assignments.access_status`).

---

## 5. Key user flows

### 5.1 Reseller signup + approval

```
1. Prospect isi form "Daftar sebagai Reseller" di landing page
   ├── Fields: nama bisnis, PIC email, telp, alamat, NPWP, estimasi client/bulan
   └── POST /auth/reseller/apply
2. Admin dapat notif email → buka /admin/resellers → review + approve
3. System bikin user_id dengan role='reseller', reseller_status='pending_approval'
   → 'active' setelah approve, kirim email set password + login link
4. Reseller login → onboarding wizard:
   ├── Verify identity (upload SIUP/NPWP file)
   ├── Setup billing profile (invoice header, bank account untuk payout)
   └── First-time tour: dashboard, invite agent, register domain
```

### 5.2 Reseller invite agent

```
1. Reseller → /reseller/team → "Undang Agent" button
2. Input: email, nama, role permissions (default: register + edit, no billing)
3. POST /api/v1/reseller/agents/invite
   → Create user_invitations row (invited_role='agent', invited_by=reseller)
   → Send email dengan link `/invite/<token>`
4. Agent klik link → set password → verify email → login
5. Backend auto-create user (role='agent', parent_reseller_id=inviter)
6. Agent land di `/agent/dashboard` — kosong sampai reseller assign client
```

### 5.3 Reseller/agent register domain untuk client baru

**Model A — Pre-create client account (recommended):**

```
1. Reseller/agent → /reseller/clients/new
2. Input:
   ├── Client info: email, nama, telp, alamat (untuk WHOIS + invoice)
   ├── Domain: search + pilih hasil (reuse wizard existing /new-with-domain)
   └── Template: pilih (opsional — bisa kosong lalu setup later)
3. Backend flow:
   a. Create user row (role='client', email verified=false)
   b. Create client_assignments row (manager_id=reseller/agent, client_id=new user, access_status='setup')
   c. Trigger domain purchase (existing wizard flow tapi user_id=client, purchased_by=reseller/agent)
   d. Payment: MANAGER (reseller/agent) yang bayar via saved payment method
      (atau invoice ke reseller — depends billing model)
4. Redirect ke /sites/pending/<job_id> (same as normal flow)
5. Setelah domain active:
   a. Auto-create site dari template (kalau pilih)
   b. Insert site_members row: owner=client, editor=reseller/agent
   c. Reseller/agent bisa langsung edit di /sites/<id>/editor
6. Reseller/agent isi konten awal → klik "Publish" → "Serahkan ke Client"
```

**Model B — Deferred client claim** (alternative, lebih ringan):

```
1-5. Same, tapi step 5b: site owner tetap reseller (temp)
6. Handoff: system generate claim token → email ke client:
   "Situs Anda sudah siap! Klik untuk aktivasi + set password."
7. Client klik link → set password → backend swap owner: reseller → client
```

Model A lebih clean (ownership konsisten dari awal). Recommended untuk MVP.

### 5.4 Handoff to client

```
1. Reseller/agent buka site → toolbar → "Serahkan ke Client"
2. Dialog konfirmasi:
   ├── "Situs akan diserahkan ke {client.name}"
   ├── "Anda tetap punya edit access selama 30 hari (grace period)"
   ├── "Setelah itu, client bisa cabut akses via settings"
   └── [Kirim Undangan]
3. POST /api/v1/sites/:id/handoff
   → client_assignments.access_status = 'active'
   → client_assignments.handed_off_at = NOW()
   → site_members role reseller/agent = 'editor' (was already, ensure)
   → Send email ke client: "Situs Anda siap! Login untuk edit."
4. Client accept:
   ├── Klik link → landing di /invite/<token>
   ├── Set password (kalau belum) → verify email
   └── Login → dashboard menampilkan site
5. Client edit sendiri OR minta reseller edit (masih ada access)
```

### 5.5 Client cabut akses reseller/agent

```
1. Client → /settings/collaborators → lihat list reseller + agent yang punya edit
2. Klik "Cabut Akses" per manager
3. POST /api/v1/collaborators/:id/revoke
   → client_assignments.access_status = 'revoked'
   → client_assignments.revoked_at = NOW()
   → site_members row dihapus untuk semua site client
   → Reseller/agent lose all edit access effective immediately
4. Email notification ke reseller/agent (courtesy)
```

---

## 6. UI changes

### 6.1 Login flow

Login satu URL untuk semua role. Redirect post-login berdasarkan role:
- `admin` → `/admin`
- `reseller` → `/reseller/dashboard`
- `agent` → `/agent/dashboard`
- `client` → `/dashboard` (existing)

### 6.2 Reseller portal (`/reseller/*`)

Layout mirror settings/dashboard tapi dengan sub-nav:
- **Dashboard** — stats: total clients, MRR, active domains, pending jobs
- **Klien** — list clients (search + filter status) → drill to client detail
- **Tim** — list agents (invite/edit/deactivate)
- **Domain** — semua domain yang di-register (search + filter status + client)
- **Billing** — invoice history (own + all clients aggregated)
- **Pengaturan** — profile bisnis, billing profile, payout account

### 6.3 Agent portal (`/agent/*`)

Simpler subset:
- **Dashboard** — stats: assigned clients, my active sites, pending tasks
- **Klien** — list assigned clients only
- **Domain** — domain yang di-register agent ini (subset dari reseller's)
- **Pengaturan** — profile personal

### 6.4 Client dashboard (existing `/dashboard`)

Add card di top kalau ada manager:
```
┌─────────────────────────────────────────────┐
│  🤝  Dikelola oleh PT Ceria Digital         │
│      Kontak: agen@ceria.id / 0812-xxxx      │
│      [Cabut akses] [Chat WhatsApp]          │
└─────────────────────────────────────────────┘
```

Settings menu tambahan: **Collaborators** — manage siapa yang punya edit access.

### 6.5 Editor toolbar (reseller/agent view)

Kalau user login sebagai reseller/agent + editing client's site, tampilkan banner atas:
```
Anda mengelola situs {client.name}. Perubahan langsung visible ke client.
[Serahkan ke Client] (kalau belum handoff)
```

---

## 7. API surface

### Endpoint baru

| Method | Path | Role | Deskripsi |
|---|---|---|---|
| POST | `/auth/reseller/apply` | anon | Apply jadi reseller (create pending user) |
| POST | `/api/v1/admin/resellers/:id/approve` | admin | Approve reseller application |
| POST | `/api/v1/admin/resellers/:id/suspend` | admin | Suspend reseller |
| GET | `/api/v1/reseller/dashboard` | reseller | Stats + summary |
| GET | `/api/v1/reseller/clients` | reseller | List clients (paginated) |
| POST | `/api/v1/reseller/clients` | reseller/agent | Create new client (returns invite token) |
| GET | `/api/v1/reseller/clients/:id` | reseller/agent | Detail client (with domains + sites) |
| POST | `/api/v1/reseller/clients/:id/revoke` | reseller | Revoke assignment |
| POST | `/api/v1/reseller/agents/invite` | reseller | Invite agent via email |
| GET | `/api/v1/reseller/agents` | reseller | List agents |
| POST | `/api/v1/reseller/agents/:id/deactivate` | reseller | Deactivate agent |
| GET | `/api/v1/reseller/invoices` | reseller | Aggregate invoices semua clients |
| GET | `/api/v1/agent/dashboard` | agent | Stats |
| GET | `/api/v1/agent/clients` | agent | Assigned clients |
| POST | `/api/v1/sites/:id/handoff` | reseller/agent | Handoff to client |
| GET | `/api/v1/collaborators` | client | List reseller/agent yang punya edit access |
| POST | `/api/v1/collaborators/:id/revoke` | client | Cabut akses |
| POST | `/api/v1/invite/:token/accept` | anon | Accept invitation (set password) |

### Endpoint dimodifikasi

- `POST /api/v1/domains/purchase` — accept optional `on_behalf_of_user_id` header/body (validated: caller must be reseller/agent + user must be assigned)
- `POST /api/v1/sites` — accept optional `on_behalf_of_user_id`, insert `site_members` entry
- `GET /api/v1/sites` — filter by role: admin sees all, reseller sees own + clients', agent sees own + assigned, client sees only owned (via site_members)
- `GET /api/v1/auth/me` — return `role` + `parent_reseller_id` + `reseller_display_name`

### Middleware baru

- `RequireReseller()` — role='reseller' + status='active'
- `RequireAgent()` — role='agent' (kalau di route agent-only)
- `RequireResellerOrAgent()` — either
- `RequireClientAssignment(clientID)` — check kalau caller is assigned to that client (helper untuk on-behalf-of endpoints)

---

## 8. Security + isolation

### Cross-tenant leak prevention

- **Semua query wajib scope by manager relationship**:
  - Reseller lookup client: WHERE EXISTS (SELECT 1 FROM client_assignments WHERE manager_id=reseller AND client_id=target)
  - Agent lookup: same tapi manager_id=agent
- **Ownership site**: cek via `site_members.user_id = caller` DAN role IN ('owner', 'editor')
- **Domain purchase visibility**: reseller lihat purchased_by=self OR user_id IN (self's clients)

### Attack surface

| Attack | Mitigation |
|---|---|
| Reseller enumerate client emails | Rate limit invite endpoint 50/hari |
| Agent bypass restrictions dengan direct API call | Middleware chain enforces role di setiap endpoint |
| Client cabut akses tapi reseller retry via API | `access_status='revoked'` di-cek di middleware sebelum route logic |
| Reseller edit invoice value | Invoice generated backend, reseller readonly |
| Client A phishing form pura-pura invite dari reseller | Token invitation HMAC-signed + expiry 7 hari |

### Audit log

Tambah `activity_logs` untuk trace:
- Reseller invite agent
- Reseller/agent create client
- Handoff event
- Client revoke access

---

## 9. Billing model (2 opsi)

### Opsi A — Reseller sebagai intermediary (rekomendasi)

```
Web builder (PANDI) ─────invoice───→ Reseller ─────invoice───→ Client
                       (wholesale)                (retail + markup)
```

- Reseller punya `reseller_tier` yang tentukan wholesale price
- Reseller kelola invoice ke client sendiri (di luar sistem web-builder)
- Web-builder cuma track cost basis: total spent by reseller/agent
- Client account tidak lihat harga sama sekali

### Opsi B — Pass-through billing

```
Web builder ────────invoice per transaction───→ Reseller
              (reseller bayar, client tidak lihat invoice)
```

- Sederhana untuk MVP
- Client tidak punya visibility ke pembayaran domain (perpanjangan next year jadi ambigu)

**Recommendation MVP:** Opsi B untuk simplicity. Migrasi ke A saat marketplace matang.

---

## 10. Migration strategy

### Phase 0 — Database migrations (backward compat)
- Add columns/tables per section 4 dengan default values yang aman
- Existing users default `role='client'`, existing admin tetap `role='admin'`
- Existing sites: seed `site_members` dengan `owner` untuk `sites.user_id`

### Phase 1 — Admin approval flow + reseller signup
- New route `/daftar-reseller` (public)
- Admin panel `/admin/resellers` untuk approve
- Reseller signin + minimal `/reseller/dashboard` empty state
- **Milestone:** admin bisa create test reseller, reseller bisa login

### Phase 2 — Agent management + client invite
- `/reseller/team` (invite agent flow)
- `/reseller/clients/new` (create client without domain — invite only)
- Client accept invite → set password → dashboard normal
- **Milestone:** reseller invite agent, both invite client, client accept

### Phase 3 — Domain purchase on-behalf-of
- Extend wizard `/sites/new-with-domain` dengan mode "for client"
- `on_behalf_of_user_id` di API + `purchased_by` di DB
- Payment routed sesuai billing model
- **Milestone:** reseller beli domain untuk client, muncul di dashboard client

### Phase 4 — Site editing + handoff
- Reseller/agent edit site atas nama client (via `site_members` collab)
- Handoff button + invitation email
- Client accept → editor unlocked
- **Milestone:** end-to-end: reseller register domain → build site → handoff → client edit

### Phase 5 — Collaborator management (client side)
- `/settings/collaborators` untuk client
- Revoke flow + notification email
- 30-hari auto-revoke grace period
- **Milestone:** client punya kontrol penuh, reseller/agent tidak stuck edit forever

### Phase 6 — Reseller aggregate views + billing
- Reseller invoice list (semua clients)
- Stats dashboard: MRR, active domains, expiring soon
- Export CSV untuk accounting
- **Milestone:** reseller punya bird-eye view portfolio

### Phase 7 — Polish & production readiness
- Rate limiting per role
- Audit log page
- White-label email template (opsional)
- Onboarding tour untuk masing-masing role

---

## 11. Estimasi effort

| Phase | Scope | Effort |
|---|---|---|
| 0 | Migrations + backward compat | 4-6 jam |
| 1 | Reseller signup + admin approval | 8-12 jam |
| 2 | Agent invite + client invite | 12-16 jam |
| 3 | Purchase on-behalf-of | 8-12 jam |
| 4 | Site editing + handoff | 12-16 jam |
| 5 | Client collaborator UI | 6-8 jam |
| 6 | Reseller aggregate + billing | 12-16 jam |
| 7 | Polish + audit + tests | 8-12 jam |
| **Total** | | **~70-100 jam (~2-3 minggu focused work)** |

Bisa di-split ke 3-4 sprint. Rekomendasi urutan: Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (linear, tiap phase deliverable independent).

---

## 12. Alternatif desain yang di-pertimbangkan (tapi tidak dipilih)

### A. Single-user with "delegate" model
Reseller = user biasa yang extend "buy for other email". Tidak ada role terpisah.
- ❌ Tidak scale untuk multi-agent
- ❌ Data isolation susah
- ❌ Billing model tidak clean

### B. Reseller punya sub-domain sendiri (`ceria.webbuilder.id`)
Reseller portal via subdomain terpisah.
- ❌ Complex routing (butuh multi-tenant subdomain + JWT scoping per tenant)
- ❌ Tidak butuh untuk MVP — cukup role-based routing di single app

### C. Agent tanpa reseller (langsung under admin)
- ❌ Membingungkan hierarki
- ❌ Reseller model penting untuk B2B partnership monetization

---

## 13. Open questions (butuh keputusan)

1. **Billing**: Opsi A atau B (section 9)? A lebih strategic, B lebih cepat.
2. **Grace period**: 30 hari default cukup? Atau setting per-reseller?
3. **Domain ownership post-handoff**: Kalau reseller/agent leave/deactivated, domain harus stay attached ke client. Confirm cascade behavior.
4. **Payment method reseller**: saved card di reseller profile? Atau tiap transaksi input ulang?
5. **Reseller tier pricing**: fixed tier (basic/gold/platinum) atau per-negotiation custom?
6. **Email notifications**: siapa dapat notif kalau site down, domain expire — reseller only, client only, atau both (default)?
7. **Support responsibility**: kalau client ada issue, kontak siapa dulu — reseller atau platform support?
8. **Reseller data export**: bisa export list semua clients (untuk migrate ke competitor)? GDPR-like right.

---

## 14. Referensi implementasi

- **Existing pattern reference**:
  - `apps/api/internal/auth/` — auth handler existing (untuk extend role check)
  - `apps/api/internal/admin/` — admin panel pattern (untuk clone jadi reseller panel)
  - `apps/api/internal/domain_purchase/handler.go:Purchase` — endpoint yang perlu di-extend untuk `on_behalf_of_user_id`
  - `plan.md` root — existing overall architecture

- **External inspiration**:
  - Shopify Partners program (reseller model)
  - WordPress.com Business plan (agency mode)
  - Squarespace Circle (reseller with commission)
