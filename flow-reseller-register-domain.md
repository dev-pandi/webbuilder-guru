# Flow: Reseller/Agent Register Domain untuk Client

Dokumen detail step-by-step bagaimana **reseller** atau **agent** register domain baru atas nama client (yang mungkin belum punya akun). Companion dokumen ke [plan-reseller-roles.md](plan-reseller-roles.md) section 5.3.

**Kenapa perlu detail terpisah:** flow ini punya 3+ path (client baru vs client existing, payment sukses vs fail, dengan template vs kosong). Tanpa peta clear, gampang bikin gap di implementasi.

---

## 1. Pre-conditions

Sebelum reseller/agent bisa mulai flow ini:

- [x] Reseller `role='reseller'`, `reseller_status='active'` (sudah disetujui admin)
- [x] Agent `role='agent'`, `parent_reseller_id` tidak null, dan reseller induknya masih active
- [x] Punya payment method di profile (kalau billing model = pay-per-transaction) ATAU deposit balance cukup (kalau prepaid)
- [x] Registrar API + Cloudflare + Payment gateway terkonfigurasi normal (health check green)
- [x] Kalau agent: assignment quota belum penuh (kalau kelak ada limit per-agent)

---

## 2. Sequence diagram (happy path)

```
Reseller/Agent           Web-Builder API         Registrar API         Payment GW          Email Service        Client (Browser)
     │                         │                       │                    │                    │                       │
     │─── open /reseller/clients/new ─────────────────→│                    │                    │                       │
     │                         │                       │                    │                    │                       │
     │─── fill form (email,name,phone,domain,template) │                    │                    │                       │
     │                         │                       │                    │                    │                       │
     │─── POST /reseller/clients ────────────────────→│                    │                    │                       │
     │                         │                       │                    │                    │                       │
     │                         │─── check email exists? ────────┐          │                    │                       │
     │                         │← lookup users WHERE email=?    │          │                    │                       │
     │                         │                       │        │          │                    │                       │
     │                         │─── (new) INSERT users ─────────┘          │                    │                       │
     │                         │─── INSERT client_assignments               │                    │                       │
     │                         │                       │                    │                    │                       │
     │                         │─── POST /reseller/domain/register ────────→│                    │                       │
     │                         │                       │                    │                    │                       │
     │                         │                       │─── EPP check domain avail                                       │
     │                         │                       │─── INSERT jobs + invoice                                         │
     │                         │                       │─── create payment session ────────────→│                       │
     │                         │                       │←── payment_url ────────────────────────│                       │
     │                         │← {job_id, payment_url}│                    │                    │                       │
     │                         │─── INSERT domain_purchases (purchased_by=reseller, user_id=client)                       │
     │                         │                       │                    │                    │                       │
     │← 202 {job_id, payment_url, client_user_id} ─────│                    │                    │                       │
     │                         │                       │                    │                    │                       │
     │─── redirect ke /sites/pending/<job_id> ────────→│                    │                    │                       │
     │─── (option) click "Buka pembayaran" ───────────→│                    │                    │                       │
     │─── (option) window.open(payment_url) ─────────────────────────────────→ Midtrans/Paylabs                          │
     │                         │                       │                    │                    │                       │
     │─── (submit payment on gateway) ──────────────────────────────────────→│                    │                       │
     │                         │                       │                    │                    │                       │
     │                         │                       │← webhook payment OK│                    │                       │
     │                         │                       │─── EPP CREATE domain                                              │
     │                         │                       │─── status active + expires_at set                                 │
     │                         │← webhook (HMAC signed) status=active                                                      │
     │                         │─── UPDATE domain_purchases status=active   │                    │                       │
     │                         │─── tryAttachToCloudflare (zone + DNS + push NS)                                          │
     │                         │─── (optional) auto-create site dari template                                              │
     │                         │─── INSERT site_members (owner=client, editor=reseller)                                    │
     │                         │                       │                    │                    │                       │
     │                         │ (polling detect status change)              │                    │                       │
     │← redirect ke /sites/<siteId>/editor ────────────│                    │                    │                       │
     │                         │                       │                    │                    │                       │
     │─── edit content, publish ─────────────────────→│                    │                    │                       │
     │                         │                       │                    │                    │                       │
     │─── click "Serahkan ke Client" ─────────────────→│                    │                    │                       │
     │                         │─── POST /sites/:id/handoff                  │                    │                       │
     │                         │─── UPDATE client_assignments status=active + handed_off_at       │                       │
     │                         │─── INSERT user_invitations (invited_role=client, target=client_id)                        │
     │                         │─── send email dengan claim link ──────────────────────────────→│                       │
     │                         │                       │                    │                    │─── email arrives ────→│
     │                         │                       │                    │                    │                       │
     │                         │                       │                    │                    │─── click link ───────→│
     │                         │                       │                    │                    │                       │
     │                         │← GET /invite/<token>  │                    │                    │                       │
     │                         │─── verify token       │                    │                    │                       │
     │                         │← show set-password form                                                                  │
     │                         │                       │                    │                    │─── POST /accept ─────→│
     │                         │─── UPDATE users password_hash + verify email                                              │
     │                         │─── UPDATE invitations accepted_at                                                          │
     │                         │← JWT + redirect /dashboard                                                                │
     │                         │                       │                    │                    │                       │
     │                         │                       │                    │                    │  Client lihat site   │
     │                         │                       │                    │                    │  ready untuk edit    │
```

---

## 3. Detailed step-by-step

### Step 1 — Reseller/agent buka wizard

**UI:** `/reseller/clients/new` (reseller) atau `/agent/clients/new` (agent)

Layout mirror `/sites/new-with-domain` tapi dengan additional section **"Info Klien"** di depan.

```
┌───────────────────────────────────────────────────────┐
│  Daftarkan Domain untuk Klien Baru                    │
│                                                        │
│  ── STEP 1: Info Klien ───────────────────────────    │
│  Email klien   [_______________________]              │
│  Nama          [_______________________]              │
│  Nomor HP      [_______________________]              │
│  Alamat        [_______________________]              │
│  Kota          [_______________________]              │
│  Kode Pos      [___________]                          │
│  NIK (opsional)[_______________________]              │
│                                                        │
│  ── STEP 2: Pilih Domain ─────────────────────────    │
│  [reuse SearchSection existing]                       │
│                                                        │
│  ── STEP 3: Template (opsional) ──────────────────    │
│  [ ] Kosong (client build sendiri nanti)              │
│  ( ) Toko Online                                      │
│  ( ) Portfolio                                        │
│  ( ) Landing Page                                     │
│                                                        │
│  ── STEP 4: Pembayaran ───────────────────────────    │
│  Metode: (•) Midtrans  ( ) Paylabs                    │
│  Tagihkan ke: (•) Saya (reseller)  ( ) Klien          │
│                                                        │
│  [ Batal ]                       [ Lanjutkan Beli ]   │
└───────────────────────────────────────────────────────┘
```

**Validation client-side:**
- Email format valid
- Semua field wajib kecuali NIK
- Domain sudah melalui availability check (reuse existing wizard component)
- Kalau "Tagihkan ke Klien" dipilih, warning bahwa client harus konfirmasi pembayaran

### Step 2 — Submit form → POST /reseller/clients

**Request:**
```http
POST /api/v1/reseller/clients HTTP/1.1
Authorization: Bearer <reseller_or_agent_jwt>
Idempotency-Key: <uuid>
Content-Type: application/json

{
  "client": {
    "email": "toko@bahagia.id",
    "name": "Toko Bahagia",
    "phone_number": "+62812345678",
    "address": "Jl. Merdeka 10",
    "city": "Jakarta Pusat",
    "state": "DKI Jakarta",
    "postal_code": "10110",
    "nik": ""
  },
  "domain": {
    "name": "bahagia.co.id",
    "years": 1,
    "payment_method": "midtrans",
    "promo_code": ""
  },
  "template": {
    "slug": "toko-online"  // atau null kalau skip
  },
  "billing": {
    "charge_to": "reseller"  // "reseller" | "client"
  }
}
```

**Backend logic:**

```go
func (h *ResellerHandler) CreateClient(c *fiber.Ctx) error {
    caller := auth.ClaimsFrom(c)   // reseller atau agent
    if !isResellerOrAgent(caller.Role) {
        return httpx.Forbidden(c, "role tidak diizinkan")
    }
    // Rate limit: 50/hari per reseller (cegah abuse buat scan email)
    if !rateLimit.Allow(caller.UserID, "reseller_create_client", 50, 24*time.Hour) {
        return httpx.TooManyRequests(c, "quota harian client_baru habis")
    }

    var req createClientReq
    if err := c.BodyParser(&req); err != nil { ... }
    if err := req.Validate(); err != nil { ... }

    idem := strings.TrimSpace(c.Get("Idempotency-Key"))
    if idem == "" {
        return httpx.BadRequest(c, "Idempotency-Key wajib")
    }

    // BEGIN TX — atomicity: user + assignment + purchase call
    tx, _ := h.pool.Begin(ctx)
    defer tx.Rollback(ctx)

    // 2.a — Check kalau email sudah exists
    existing, _ := h.users.GetByEmail(ctx, req.Client.Email)
    var clientUserID uuid.UUID
    var isNewUser bool
    if existing != nil {
        // Reject kalau existing user sudah ter-assign ke reseller LAIN
        if existingAssigned, _ := h.assignments.FindActiveByClient(ctx, existing.ID); existingAssigned != nil && existingAssigned.ManagerID != caller.ResellerScopedID() {
            return httpx.Conflict(c, "email sudah terdaftar dan sedang di-manage oleh reseller lain")
        }
        clientUserID = existing.ID
        isNewUser = false
    } else {
        // 2.b — Create user baru (unverified, pending set password)
        u := &auth.User{
            Email:         req.Client.Email,
            Name:          req.Client.Name,
            PhoneNumber:   req.Client.PhoneNumber,
            Address:       req.Client.Address,
            City:          req.Client.City,
            State:         req.Client.State,
            PostalCode:    req.Client.PostalCode,
            Nik:           req.Client.Nik,
            Role:          "client",
            EmailVerified: nil,          // NULL sampai claim invite
            PasswordHash:  "",            // kosong, di-set saat accept invite
        }
        if err := h.users.CreateWithTx(ctx, tx, u); err != nil { ... }
        clientUserID = u.ID
        isNewUser = true
    }

    // 2.c — Create assignment (upsert kalau existing)
    _, err := h.assignments.CreateWithTx(ctx, tx, ClientAssignment{
        ManagerID:    caller.UserID,
        ClientID:     clientUserID,
        ManagerRole:  caller.Role,
        AccessStatus: "setup",  // full edit dulu, upgrade ke 'active' setelah handoff
    })
    if err != nil { ... }

    // 2.d — Commit user+assignment supaya purchase punya ownership yang valid
    if err := tx.Commit(ctx); err != nil { ... }

    // 2.e — Trigger domain purchase (reuse existing flow tapi user_id=client)
    resp, err := h.registrar.RegisterDomain(ctx, registrar.RegisterRequest{
        Domain:         req.Domain.Name,
        Years:          req.Domain.Years,
        ExternalUserID: clientUserID.String(),  // ownership di registrar = client
        IdempotencyKey: idem,
        PaymentMethod:  req.Domain.PaymentMethod,
        PromoCode:      req.Domain.PromoCode,
        Contact:        contactFromClient(req.Client),
        // Callback URL berbeda berdasar billing model:
        //   'reseller' → payment success return ke reseller portal
        //   'client'   → email link ke client, mereka bayar sendiri
        ReturnURL:      h.buildReturnURL(req.Billing.ChargeTo, resp.JobID),
    })
    if err != nil {
        // Cleanup: kalau isNewUser dan purchase gagal, hapus user (privacy)
        if isNewUser {
            _ = h.users.SoftDelete(ctx, clientUserID)
        }
        return proxyRegistrarErr(c, "registrar_error", err)
    }

    // 2.f — Save local purchase row dengan purchased_by=caller
    _ = h.purchases.Create(ctx, &Purchase{
        UserID:          clientUserID,
        PurchasedBy:     &caller.UserID,
        RegistrarJobID:  resp.JobID,
        Domain:          req.Domain.Name,
        Years:           req.Domain.Years,
        Kind:            "register",
        Status:          "pending_payment",
        PaymentMethod:   req.Domain.PaymentMethod,
        PaymentURL:      resp.PaymentURL,
    })

    // 2.g — (Optional) Store template preference untuk auto-attach setelah active
    if req.Template.Slug != "" {
        _ = h.pendingTemplates.Save(ctx, resp.JobID, req.Template.Slug)
    }

    return httpx.Created(c, fiber.Map{
        "job_id":         resp.JobID,
        "client_user_id": clientUserID,
        "payment_url":    resp.PaymentURL,
        "is_new_user":    isNewUser,
    })
}
```

**Response 201:**
```json
{
  "data": {
    "job_id": "job_a1b2c3d4",
    "client_user_id": "aa11-bb22-cc33-dd44",
    "payment_url": "https://app.midtrans.com/snap/v3/redirection/xyz",
    "is_new_user": true
  }
}
```

**DB state setelah step 2:**
```
users:
  id=aa11..., email=toko@bahagia.id, role='client',
  email_verified=NULL, password_hash=''

client_assignments:
  manager_id=<reseller>, client_id=aa11..., manager_role='reseller',
  access_status='setup', created_at=NOW()

domain_purchases:
  user_id=aa11..., purchased_by=<reseller>, registrar_job_id='job_a1b2c3d4',
  domain='bahagia.co.id', status='pending_payment'
```

### Step 3 — Payment (branching berdasar billing model)

#### 3a — `charge_to = "reseller"` (default, recommended untuk MVP)

Reseller portal auto-redirect ke `/sites/pending/<job_id>` yang polling status. Tombol "Buka Halaman Pembayaran" → membuka `payment_url` di tab baru.

Reseller yang bayar → Midtrans callback → registrar → webhook ke web-builder → status update.

#### 3b — `charge_to = "client"` (advanced, defer implementation)

Web-builder kirim email ke client:
> "Halo {name}, {reseller_display_name} sudah menyiapkan domain **bahagia.co.id** untukmu. Klik untuk selesaikan pembayaran + aktivasi akun."

Link menuju `/pay-and-claim/<token>`. Client:
1. Set password + verify email (satu form)
2. Klik "Bayar Sekarang" → payment gateway
3. Setelah pembayaran → auto-login → land di editor site

**Trade-off:** flow 3b lebih adil (client sadar pembayaran) tapi lebih kompleks (butuh atomicity antara set-password + payment + login). MVP: skip 3b, force `charge_to='reseller'` dulu.

### Step 4 — Registrar webhook → domain active

Backend web-builder receive webhook `POST /webhooks/registrar/domain-status` dengan HMAC signature. Payload:
```json
{
  "job_id": "job_a1b2c3d4",
  "status": "active",
  "expires_at": "2027-07-28T00:00:00Z"
}
```

Handler existing (`domain_purchase.Webhook`) sudah update status. **Tambahan untuk reseller flow:**

```go
// Setelah UPDATE domain_purchases status='active'...
if purchase.Status == "active" {
    // Trigger Cloudflare attach (existing)
    go h.tryAttachToCloudflare(ctx, purchase.Domain)

    // NEW: auto-create site kalau ada pending template
    if templateSlug, _ := h.pendingTemplates.Get(ctx, purchase.RegistrarJobID); templateSlug != "" {
        go h.autoCreateSiteFromTemplate(ctx, purchase, templateSlug)
    }
}
```

### Step 5 — Auto-create site dari template + collaborator setup

Background goroutine:

```go
func (h *Handler) autoCreateSiteFromTemplate(ctx context.Context, p *Purchase, templateSlug string) {
    // 1. Create site dengan owner=client (bukan reseller!)
    site, err := h.sites.CreateFromTemplate(ctx, sites.CreateFromTemplateOpts{
        UserID:       p.UserID,           // client
        TemplateSlug: templateSlug,
        Name:         p.Domain,
        Slug:         sites.Slugify(p.Domain),
    })
    if err != nil { ... }

    // 2. Attach domain purchase → site_id
    _ = h.purchases.AttachSite(ctx, p.RegistrarJobID, p.UserID, site.ID)

    // 3. Insert site_members: owner=client (already implied dari sites.user_id)
    _ = h.siteMembers.Insert(ctx, site.ID, p.UserID, "owner", nil)

    // 4. Insert site_members: editor=reseller/agent (purchased_by)
    if p.PurchasedBy != nil && *p.PurchasedBy != p.UserID {
        _ = h.siteMembers.Insert(ctx, site.ID, *p.PurchasedBy, "editor", p.PurchasedBy)
    }

    // 5. Notify reseller/agent via websocket / dashboard badge
    _ = h.notifications.Push(ctx, *p.PurchasedBy, notif.SiteReadyForSetup{
        SiteID: site.ID, ClientName: /*lookup*/,
    })
}
```

**DB state setelah step 5:**
```
sites:
  id=ss11..., user_id=aa11... (client), name='bahagia.co.id',
  slug='bahagia-co-id', status='draft'

site_members:
  (ss11..., aa11..., 'owner')
  (ss11..., <reseller>, 'editor', added_by=<reseller>)

domain_purchases:
  ...same as before, + site_id=ss11...
```

### Step 6 — Reseller/agent build site

Reseller/agent klik notif "Situs siap di-setup" → redirect ke `/sites/ss11.../editor`.

Editor UI menampilkan banner atas (kalau caller.role ∈ {reseller, agent}):
```
┌────────────────────────────────────────────────────────┐
│  🎯 Mengelola situs untuk Toko Bahagia (toko@bahagia.id)│
│  Perubahan langsung visible ke client saat handoff.    │
│                          [ Serahkan ke Client ]        │
└────────────────────────────────────────────────────────┘
```

Reseller/agent edit blocks, upload asset, edit theme, publish → **belum handoff**. Client belum bisa akses.

### Step 7 — Handoff ke client

Reseller/agent klik "Serahkan ke Client".

**Request:**
```http
POST /api/v1/sites/ss11.../handoff HTTP/1.1
Authorization: Bearer <reseller_jwt>

{
  "message": "Halo Pak Budi, situs Bahagia sudah siap edit. Silakan login dan modifikasi sesuai kebutuhan."
}
```

**Backend:**
```go
func (h *Handler) HandoffSite(c *fiber.Ctx) error {
    caller := auth.ClaimsFrom(c)
    siteID, _ := uuid.Parse(c.Params("id"))

    // Verify caller is manager (editor) of this site
    if !h.siteMembers.HasRole(ctx, siteID, caller.UserID, "editor") {
        return httpx.Forbidden(c, "bukan editor")
    }
    site, _ := h.sites.GetByID(ctx, siteID)  // ownership check via siteMembers
    client, _ := h.users.GetByID(ctx, site.UserID)

    // 1. Update assignment status
    _ = h.assignments.SetHandedOff(ctx, caller.UserID, client.ID)

    // 2. Generate invitation token (kalau client belum verified email)
    var inviteURL string
    if client.EmailVerified == nil {
        token, expiry, _ := h.issuer.IssueInvite(client.ID, "client", 7*24*time.Hour)
        _ = h.invitations.Create(ctx, &Invitation{
            Email:         client.Email,
            InvitedRole:   "client",
            InvitedBy:     caller.UserID,
            TargetUserID:  &client.ID,
            TokenHash:     hashToken(token),
            ExpiresAt:     expiry,
        })
        inviteURL = h.appBaseURL + "/invite/" + token
    } else {
        // Client sudah pernah login sebelumnya (existing user) → langsung login link
        inviteURL = h.appBaseURL + "/dashboard"
    }

    // 3. Send email
    resellerName, _ := h.users.ResellerDisplayName(ctx, caller.UserID)
    _ = h.mailer.SendHandoffEmail(ctx, mail.HandoffMail{
        To:              client.Email,
        ClientName:      client.Name,
        ResellerName:    resellerName,
        SiteName:        site.Name,
        SitePreviewURL:  "https://" + /*lookup domain*/,
        InviteURL:       inviteURL,
        CustomMessage:   req.Message,
    })

    return httpx.OK(c, fiber.Map{
        "ok":              true,
        "invite_sent_to":  client.Email,
        "expires_at":      expiry,
    })
}
```

**DB state setelah step 7:**
```
client_assignments:
  ...updated: access_status='active', handed_off_at=NOW()

user_invitations (kalau client baru):
  email=toko@bahagia.id, invited_role='client',
  invited_by=<reseller>, target_user_id=aa11...,
  token_hash=<sha256>, expires_at=NOW()+7d
```

### Step 8 — Client claim + first login

Client buka email → klik link → landing `/invite/<token>`.

**Frontend flow:**
```
/invite/<token>
├── GET /api/v1/invitations/<token> → validate + return { email, role, invited_by_name }
├── Show welcome + set password form
│   "Selamat datang! Kamu sudah punya situs siap edit di bahagia.co.id"
│   [ Password ] [ Konfirmasi Password ]
│   [ Buat Akun & Login ]
├── POST /api/v1/invitations/<token>/accept { password }
│   → Update users: password_hash=hash(pwd), email_verified=NOW()
│   → Update user_invitations: accepted_at=NOW()
│   → Return JWT (access + refresh)
└── Redirect /dashboard
```

Client dashboard menampilkan card special first-time:
```
┌────────────────────────────────────────────────────────┐
│  🎉 Situs bahagia.co.id sudah siap!                    │
│  Diset oleh PT Ceria Digital · Dipublikasikan          │
│  [ Buka Editor ]      [ Lihat Website ]                │
└────────────────────────────────────────────────────────┘
```

Dan notif info di sidebar:
```
🤝 Dikelola oleh PT Ceria Digital
   Punya edit access sampai 27 Agustus 2026 (grace period).
   [ Kelola akses ]
```

---

## 4. Alternative paths / edge cases

### 4.1 Email client sudah exists (untuk manager lain)

Backend response 409 `client_already_managed`:
```json
{
  "error": {
    "code": "client_already_managed",
    "message": "Email toko@bahagia.id sudah dikelola reseller lain. Minta client transfer manual atau gunakan email berbeda."
  }
}
```

**Frontend UI:** show error dengan CTA "Transfer request" (kirim email ke client minta approve transfer — future feature).

### 4.2 Email exists tapi sebagai reseller/agent

Response 409 `email_role_conflict`:
> "Email ini terdaftar sebagai {existing_role}. Tidak bisa jadi client."

### 4.3 Domain tidak available

Existing flow — check availability sudah di frontend sebelum submit. Backup guard di backend rejects dengan 400 `domain_taken`.

### 4.4 Payment failed / expired

Purchase row tetap ada dengan status `failed` atau `expired`. UI di `/reseller/clients/<id>` menampilkan:
```
Domain bahagia.co.id — Pembayaran gagal
[ Coba lagi bayar ]  [ Batalkan pesanan ]
```

**Kalau "Batalkan":**
- Kalau `is_new_user=true` DAN belum ada domain/site aktif untuk client → soft-delete user + assignment
- Kalau existing user → cuma delete assignment + purchase row

### 4.5 Reseller/agent cancel di tengah flow

User close tab sebelum submit → nothing persisted (transaction rolled back).

User submit form, purchase call gagal → user + assignment sudah committed. Cleanup async job scan `client_assignments` yang tidak punya `domain_purchases` atau `sites` dalam 24 jam → auto-suspend + email confirmation ke reseller.

### 4.6 Client accept invite tapi tidak edit-edit

Grace period 30 hari (dari section 3.4 plan). Setelah lewat, reseller/agent auto-lose edit access. UI di editor kalau di-akses reseller/agent post-grace:
```
⚠️ Akses edit Anda ke situs ini sudah expired.
Minta client aktivasi ulang di /settings/collaborators.
```

### 4.7 Client langsung log in tanpa terima email invite

Kalau client tebak URL `/login` + input email + click "Lupa Password":
1. Backend detect user unverified → send verification email (bukan reset)
2. Setelah verify email + set password → invite otomatis di-mark accepted
3. Same result seperti happy path

### 4.8 Agent leave/deactivated setelah setup client

**Kondisi:** reseller deactivate agent di `/reseller/team`.

Handling:
- `client_assignments` yang manager_id=agent → status='revoked'
- Semua `site_members` untuk sites yang di-editor-kan agent → dihapus
- Client TETAP owner, tidak terpengaruh
- Reseller (parent) tidak otomatis dapat access — kalau perlu, harus create baru via `/reseller/clients/<id>/reassign`

---

## 5. Rollback + refund cases

### 5.1 Rollback sebelum payment sukses

Trivial — cuma DB rows yang di-buat. Cleanup script:

```sql
-- Untuk assignment yang tidak lead to active domain dalam 24 jam
DELETE FROM client_assignments
 WHERE created_at < NOW() - INTERVAL '24 HOUR'
   AND access_status = 'setup'
   AND NOT EXISTS (
     SELECT 1 FROM domain_purchases
      WHERE user_id = client_assignments.client_id
        AND status IN ('active', 'pending_provisioning')
   );

-- Untuk user baru yang tidak jadi (no assignment aktif)
DELETE FROM users
 WHERE role = 'client'
   AND email_verified IS NULL
   AND password_hash = ''
   AND created_at < NOW() - INTERVAL '48 HOUR'
   AND NOT EXISTS (SELECT 1 FROM client_assignments WHERE client_id = users.id);
```

Jalanin sebagai daily cron.

### 5.2 Rollback setelah payment sukses (rare)

**Refund flow:**
1. Reseller kontak admin (tidak self-service — cegah abuse)
2. Admin trigger `/admin/purchases/:id/refund`:
   - Registrar-api refund via payment gateway
   - Domain tidak EPP DELETE (sudah aktif di registry) — mark `status='refunded'`
   - Domain expire natural setelah 1 tahun kecuali di-transfer out
3. Client di-notify: "Situs domain-mu di-refund. Layanan akan berhenti di akhir period."

---

## 6. Post-flow state check

Setelah semua step sukses, verify DB state:

```sql
-- User baru client
SELECT * FROM users WHERE email='toko@bahagia.id';
-- role='client', email_verified NOT NULL, password_hash NOT ''

-- Assignment aktif
SELECT * FROM client_assignments WHERE client_id=<client_id>;
-- access_status='active', handed_off_at NOT NULL

-- Domain purchase
SELECT * FROM domain_purchases WHERE user_id=<client_id>;
-- status='active', purchased_by=<reseller>, site_id NOT NULL

-- Site + members
SELECT sm.role, sm.user_id FROM site_members sm
 WHERE sm.site_id = (SELECT site_id FROM domain_purchases WHERE user_id=<client_id>);
-- (owner, client) + (editor, reseller)

-- Invitation accepted
SELECT * FROM user_invitations WHERE target_user_id=<client_id>;
-- accepted_at NOT NULL
```

---

## 7. Metrics + observability

Tambah counter di `/metrics`:

- `reseller_client_registrations_total{result=success|user_exists|payment_failed|registrar_error}`
- `reseller_handoff_total{invite_sent=true|false}`
- `reseller_domain_purchases_total{caller_role=reseller|agent}`
- `client_invite_accept_rate` (weekly derived)
- `client_grace_period_expired_total` (weekly derived — reseller lose access)

Alert:
- `payment_failed_rate > 20%` per reseller dalam 24h → indikasi payment method bermasalah
- `invite_accept_rate < 50%` per reseller dalam 30h → indikasi email tidak sampai / spam

---

## 8. UI mockup checklist

Butuh design untuk:

- [ ] `/reseller/clients/new` — 4-step wizard (info + domain + template + payment)
- [ ] `/reseller/clients/<id>` — detail client (domains + sites + status)
- [ ] `/agent/clients/new` — same as reseller (subset)
- [ ] Editor banner "Managing site for {client}"
- [ ] Handoff dialog dengan preview email
- [ ] Email template: handoff invite (client)
- [ ] Email template: reseller lose access notification
- [ ] Client dashboard "Managed by" card
- [ ] `/settings/collaborators` untuk client (revoke UI)

---

## 9. Testing checklist (integration)

- [ ] Reseller register client baru → user + assignment created
- [ ] Reseller register client existing (own) → reuse user, new assignment
- [ ] Reseller register client existing (other reseller) → 409 conflict
- [ ] Agent register client → assignment.manager_role='agent'
- [ ] Payment success → auto-create site + collab
- [ ] Payment fail → cleanup (user tetap ada kalau not new)
- [ ] Handoff → invitation email sent, client accept → login OK
- [ ] Grace period expire → reseller lose access
- [ ] Client revoke → immediate loss
- [ ] Agent deactivated → assignment revoked
- [ ] Cross-tenant leak: reseller A tidak bisa akses client reseller B via URL guess
- [ ] Rate limit: 51st client creation per day → rejected

---

## 10. Related docs

- [plan-reseller-roles.md](plan-reseller-roles.md) — role definition + permission matrix + data model
- [plan.md](plan.md) — overall arsitektur web-builder
- [infra/README.md](infra/README.md) section 7 — flow domain user → SSL (Fase 3-4 sama untuk purchase reseller)
- [.claude/CLAUDE.md](.claude/CLAUDE.md) — konvensi implementasi
