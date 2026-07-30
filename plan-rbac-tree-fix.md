# Plan — RBAC tree hierarchy fix

Compliance audit vs `plan-reseller-roles.md`. Target: **admin lihat semua,
reseller lihat own + agent-nya, agent lihat own, client lihat own**.

Baseline audit menemukan 3 backend gap (reseller kehilangan visibility ke
data yang agent-nya trigger) + 1 admin UX gap (invoice tidak accessible dari
panel admin).

## Scope

Fokus **backend + wiring frontend seperlunya**. Tidak refactor UI existing
kecuali menambahkan tab baru di admin drill-down.

Resources: **Domain, Invoice, Client**. Site sudah correct (auto-add
reseller/agent sebagai editor via `site_members` di flow purchase).

Skip Phase 2+ nuances (post-handoff opt-in grace period, dsb).

## Gap 1 — Reseller kehilangan domain yang agent-nya register

**Symptom**: `GET /api/v1/reseller/purchases` cuma balikin purchase yang
`purchased_by = reseller.ID`. Purchase yang agent trigger untuk klien-nya
(`purchased_by = agent.ID`) invisible dari reseller. Portal reseller
harusnya lihat pool ("own + agent's") per hierarchy.

**Root cause**: `handler.ListOnBehalfOf` panggil
`repo.ListByPurchaser(cl.UserID, limit)` — single actor scope.
[`internal/domain_purchase/handler.go:1032`](apps/api/internal/domain_purchase/handler.go)

**Fix**:
1. Extend handler: kalau caller role = `reseller`, resolve actor set via
   `assignments.ListActorIDs(callerID)` yang sudah ada (reseller + semua
   agent-nya).
2. Panggil `repo.ListByPurchasers(actorIDs, limit)` (method sudah ada di
   [`repo.go:187`](apps/api/internal/domain_purchase/repo.go)) instead of
   `ListByPurchaser`.
3. Agent caller path unchanged — `ListByPurchaser(agent.ID)` cukup (agent
   tidak boleh lihat purchase agent lain).
4. Interface extension: `AssignmentChecker` sudah punya
   `ListManagedClientIDs`; tambahkan `ListActorIDs(resellerID) []uuid.UUID`
   agar handler tidak import reseller package direct. Adapter di main.go
   wrap `reseller.Repo.ListActorIDs`.

**Efek samping**: `ExportOnBehalfOfCSV` juga pakai `ListByPurchaser` — apply
fix yang sama.

## Gap 2 — Reseller kehilangan invoice yang agent trigger

**Symptom**: `GET /api/v1/reseller/invoices` fan-out via
`ListManagedClientIDs(caller.UserID)` — cuma direct client. Invoice untuk
client yang di-invite agent (bukan reseller langsung) miss.

**Root cause**: [`ListInvoicesForTeam`](apps/api/internal/domain_purchase/handler.go)
scope IDs = caller + `ListManagedClientIDs(caller)`. Untuk reseller, method
ini return direct-only.

**Fix**:
1. Tambah method `AssignmentChecker.ListAllReachableClientIDs(callerID)`:
   - Kalau caller reseller → union direct clients + clients yang di-invite
     agent-agent-nya (JOIN via `parent_reseller_id`).
   - Kalau caller agent → sama dengan `ListManagedClientIDs` (direct only).
2. Handler swap `ListManagedClientIDs` → `ListAllReachableClientIDs`.
3. Repo impl di `reseller/repo.go` — reuse pattern `CountClientsForReseller`:
   ```sql
   SELECT DISTINCT client_id FROM client_assignments ca
     JOIN users mgr ON mgr.id = ca.manager_id
    WHERE ca.access_status != 'revoked'
      AND (ca.manager_id = $1 OR mgr.parent_reseller_id = $1)
   ```
   Untuk caller agent: tetap `ListManagedClientIDs` (kondisi
   `parent_reseller_id = $1` false untuk agent → wildcard tidak nyala).
4. Batasi fan-out — kalau caller punya > 50 reachable clients, log warn +
   tetap fan-out. Kalau perf jadi masalah, backlog: paginate scope IDs +
   cache 30s.

## Gap 3 — Reseller `/clients` list cuma direct

**Symptom**: `/api/v1/reseller/clients` pakai
`ListClientsByManager(caller.ID)` — direct only. Tile count "Klien saya"
sudah correct (fix sebelumnya), tapi menu Klien di sidebar reseller cuma
tampilkan direct — reseller tidak bisa navigate ke klien agent-nya kecuali
via /reseller/team/[agent_id]/clients (yang baru dibuat).

**Fix — pilih 1**:
- **Opsi A (recommended)**: Tambah query param `?include_team=true` ke
  `/reseller/clients`. Default false (backward-compat existing behavior +
  tile count). Kalau true → pakai `ListClientsForReseller` (pool). Frontend
  reseller add toggle "Include tim (Nagent klien)" di atas tabel.
- **Opsi B**: Selalu return pool + tambah field `via_agent_name` per row
  supaya UI bisa show badge "via Budi (agent)". Lebih rich tapi butuh
  perubahan schema DTO.

Pick **Opsi A** — minimal invasive, opt-in, tidak break existing count fix.

## Gap 4 — Admin tidak bisa akses invoice (UX)

**Alih-alih endpoint global `/admin/invoices`** — invoice di-akses via
drill-down: admin buka detail reseller/user → tab Invoice → list invoice
scoped ke user itu. Kalau reseller, jump ke pool ("all reachable client
invoices").

**Fix**:
1. Backend: expose `GET /admin/users/:id/invoices` — fan-out mirip
   `ListInvoicesForTeam` tapi caller = admin, target = param user_id.
   Payload sama dengan `/reseller/invoices` (items[] + pagination).
   - Kalau target adalah reseller → fan-out (self + reachable clients).
   - Kalau target adalah agent → fan-out (self + direct clients).
   - Kalau target adalah client → single call
     (`ListInvoices(target_user_id)`).
   Admin middleware sudah handle auth; ownership check tidak perlu (admin
   scope global).
2. Frontend: tambah tab **"Invoice"** di:
   - [`/admin/resellers/[id]/page.tsx`](apps/web/app/admin/resellers/[id]/page.tsx) —
     antara "Domain" dan "Aktivitas".
   - [`/admin/users/[id]/page.tsx`](apps/web/app/admin/users/[id]/page.tsx) —
     antara "Situs" dan "Aktivitas".
   Reuse `InvoicesList` shared component dengan
   `endpoint={/api/v1/admin/users/${id}/invoices}`.
3. Router mount: `admin.Get("/users/:id/invoices", handler.AdminListInvoicesForUser)`.

## Interface impact summary

Tambahan method di `AssignmentChecker` interface
([`internal/domain_purchase/handler.go:43`](apps/api/internal/domain_purchase/handler.go)):

```go
type AssignmentChecker interface {
    HasActiveAssignment(ctx, managerID, clientID uuid.UUID) error
    ListManagedClientIDs(ctx, managerID uuid.UUID) ([]uuid.UUID, error)
    // BARU:
    ListActorIDs(ctx, resellerID uuid.UUID) ([]uuid.UUID, error)             // reseller + agents
    ListAllReachableClientIDs(ctx, callerID uuid.UUID) ([]uuid.UUID, error)  // direct + via agents
}
```

`reseller.Repo` implement kedua method baru — `ListActorIDs` sudah exist,
tinggal `ListAllReachableClientIDs`.

## Impact ke fitur existing

- `/agent/purchases`, `/agent/invoices`, `/agent/clients` — no change
  (agent tetap direct-only, sudah correct).
- `/reseller/purchases` — sekarang aggregate. Frontend list already handle
  purchase envelope; kolom `client_name` udah include, jadi rows agent-nya
  muncul mixed dengan reseller sendiri tanpa perubahan UI.
- `/reseller/invoices` — sekarang aggregate. Sama.
- `/reseller/clients` — opt-in via query param. Tile count TIDAK berubah
  (tetap direct-only per fix sebelumnya).
- `/settings/*` (client role) — unchanged.

## Test plan

**Manual** (butuh min. 2 reseller + 3 agent + 5 klien di seed / dev):

1. Reseller A invite Agent X. Agent X invite Client Y. Beli domain untuk Y.
   - **Sebelum fix**: Reseller A `/reseller/purchases` kosong. `/reseller/invoices` juga.
   - **Sesudah fix**: Muncul row domain untuk Y, tagged "via Agent X" (kalau opsi B) atau tanpa tag (opsi A).
2. Reseller A self-purchase domain sendiri.
   - Muncul di `/reseller/purchases` bareng row on-behalf-of di step 1.
3. Reseller B tidak boleh lihat purchases Reseller A (cross-tenant guard).
4. Agent X `/agent/purchases` cuma lihat step-1 purchase (bukan reseller A's self-purchase).
5. Client Y `/settings/domains` lihat step-1 (owner_id = Y).
6. Admin buka `/admin/resellers/[A-id]` → tab Invoice → semua invoice terkait.

**Automated**: extend
[`internal/domain_purchase/handler_test.go`](apps/api/internal/domain_purchase/handler_test.go)
dengan fake `AssignmentChecker` yang return 2 agent + 3 client per reseller,
assert `ListOnBehalfOf` return semua.

## Rollout order

1. Backend Gap 1 (ListActorIDs interface + swap ListByPurchaser).
2. Backend Gap 2 (ListAllReachableClientIDs + swap ListManagedClientIDs).
3. Backend Gap 3 (query param opt-in di ListClients).
4. Backend Gap 4 (admin invoice endpoint) + Frontend tab Invoice di admin.
5. QA per test-plan.

Est. effort: ~4-6 jam backend + 1-2 jam frontend tab. All backward-compat —
no migration, no breaking API change.

## Non-goals

- Post-handoff opt-in retention (plan §3 Phase 2+).
- Admin global invoice list (skip per user request — drill-down cukup).
- Agent view of other agents (out of hierarchy — direct-only tetap).
- Cache untuk fan-out invoice — backlog kalau > 50 clients.
