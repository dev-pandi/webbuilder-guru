package domain_purchase

// Integration tests untuk repo methods yang ngomong ke Postgres.
// Butuh `TEST_DATABASE_URL` env — kalau kosong, test SKIP (dev tanpa DB
// setup masih bisa run pure-func tests). CI selalu set env ini di
// .github/workflows/ci.yml.
//
// Isolation strategy: setiap test bikin user unik (uuid.New()) supaya
// paralel tidak collide. Test tidak cleanup — TEST_DATABASE_URL selalu
// point ke DB ephemeral (fresh per CI run).

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/webbuilder/api/internal/db"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		// No DB → tests menggunakan needsDB(t) akan skip. Run pure-func tests only.
		os.Exit(m.Run())
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		panic("connect test db: " + err.Error())
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool, url); err != nil {
		panic("migrate test db: " + err.Error())
	}
	testPool = pool
	os.Exit(m.Run())
}

func needsDB(t *testing.T) *Repo {
	t.Helper()
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	return NewRepo(testPool)
}

// makeUser insert dummy user + return id — dipakai sebagai FK sumber. Email
// unik per call supaya paralel test tidak conflict.
func makeUser(t *testing.T, ctx context.Context) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testPool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, 'x', $3)`,
		id, "u-"+id.String()+"@test.local", "Test User "+id.String()[:8],
	)
	if err != nil {
		t.Fatalf("insert user: %v", err)
	}
	return id
}

// ---------- Tests ----------

func TestRepo_Create_And_GetByJobID(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	jobID := "job-" + uuid.NewString()

	p := &Purchase{
		UserID: userID, RegistrarJobID: jobID, Domain: "foo.id",
		Years: 1, Status: StatusPendingPayment, PaymentMethod: "midtrans",
	}
	if err := repo.Create(ctx, p); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if p.ID == uuid.Nil {
		t.Fatal("Create didn't populate ID")
	}
	if p.Kind != KindRegister {
		t.Errorf("default Kind = %q, want %q", p.Kind, KindRegister)
	}

	got, err := repo.GetByJobID(ctx, jobID, userID)
	if err != nil {
		t.Fatalf("GetByJobID: %v", err)
	}
	if got.Domain != "foo.id" || got.Status != StatusPendingPayment {
		t.Errorf("read back mismatch: %+v", got)
	}

	// Ownership check: user berbeda → ErrNotFound.
	other := makeUser(t, ctx)
	if _, err := repo.GetByJobID(ctx, jobID, other); err != ErrNotFound {
		t.Errorf("cross-user GetByJobID = %v, want ErrNotFound", err)
	}
}

func TestRepo_Create_Duplicate_JobID(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	jobID := "dup-" + uuid.NewString()

	first := &Purchase{UserID: userID, RegistrarJobID: jobID, Domain: "a.id", Years: 1, Status: StatusPendingPayment}
	if err := repo.Create(ctx, first); err != nil {
		t.Fatalf("first Create: %v", err)
	}

	second := &Purchase{UserID: userID, RegistrarJobID: jobID, Domain: "b.id", Years: 1, Status: StatusPendingPayment}
	if err := repo.Create(ctx, second); err != ErrJobTaken {
		t.Errorf("duplicate Create err = %v, want ErrJobTaken", err)
	}
}

func TestRepo_UpdateStatus_Idempotent(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	jobID := "upd-" + uuid.NewString()

	if err := repo.Create(ctx, &Purchase{
		UserID: userID, RegistrarJobID: jobID, Domain: "x.id", Years: 1, Status: StatusPendingPayment,
	}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	exp := time.Now().Add(365 * 24 * time.Hour).Truncate(time.Second).UTC()
	changed, err := repo.UpdateStatus(ctx, jobID, StatusActive, "", &exp)
	if err != nil || !changed {
		t.Fatalf("first Update changed=%v err=%v", changed, err)
	}

	// Second call sama status → no-op.
	changed, err = repo.UpdateStatus(ctx, jobID, StatusActive, "", nil)
	if err != nil {
		t.Fatalf("second Update err: %v", err)
	}
	if changed {
		t.Errorf("second identical Update should return changed=false")
	}

	// Verify expires_at persisted via GetByJobID.
	got, err := repo.GetByJobID(ctx, jobID, userID)
	if err != nil {
		t.Fatalf("GetByJobID: %v", err)
	}
	if got.ExpiresAt == nil || !got.ExpiresAt.Equal(exp) {
		t.Errorf("ExpiresAt = %v, want %v", got.ExpiresAt, exp)
	}
}

func TestRepo_GetLatestActiveByDomain(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	domain := "unique-" + uuid.NewString()[:8] + ".id"

	// Skenario: 2 register (1 failed lama, 1 active baru) + 1 renew active.
	// GetLatestActiveByDomain harus balik yang REGISTER active — filter
	// kind='register' eksplisit di query.
	oldFailed := &Purchase{UserID: userID, RegistrarJobID: "j1-" + uuid.NewString(), Domain: domain, Years: 1, Status: StatusFailed}
	if err := repo.Create(ctx, oldFailed); err != nil {
		t.Fatalf("create oldFailed: %v", err)
	}
	activeReg := &Purchase{UserID: userID, RegistrarJobID: "j2-" + uuid.NewString(), Domain: domain, Years: 1, Status: StatusActive}
	if err := repo.Create(ctx, activeReg); err != nil {
		t.Fatalf("create activeReg: %v", err)
	}
	renewActive := &Purchase{UserID: userID, RegistrarJobID: "j3-" + uuid.NewString(), Domain: domain, Years: 1, Kind: KindRenew, Status: StatusActive}
	if err := repo.Create(ctx, renewActive); err != nil {
		t.Fatalf("create renewActive: %v", err)
	}

	got, err := repo.GetLatestActiveByDomain(ctx, domain, userID)
	if err != nil {
		t.Fatalf("GetLatestActiveByDomain: %v", err)
	}
	if got.RegistrarJobID != activeReg.RegistrarJobID {
		t.Errorf("expected active register (%s), got %s (kind=%s)",
			activeReg.RegistrarJobID, got.RegistrarJobID, got.Kind)
	}

	// Cross-user: user berbeda → ErrNotFound.
	other := makeUser(t, ctx)
	if _, err := repo.GetLatestActiveByDomain(ctx, domain, other); err != ErrNotFound {
		t.Errorf("cross-user = %v, want ErrNotFound", err)
	}
}

func TestRepo_UpdatePaymentURL_OnlyWhenEmpty(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	jobID := "pay-" + uuid.NewString()

	if err := repo.Create(ctx, &Purchase{
		UserID: userID, RegistrarJobID: jobID, Domain: "y.id",
		Years: 1, Status: StatusPendingPayment,
	}); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := repo.UpdatePaymentURL(ctx, jobID, "https://pay.example/a"); err != nil {
		t.Fatalf("first Update: %v", err)
	}
	got, _ := repo.GetByJobID(ctx, jobID, userID)
	if got.PaymentURL != "https://pay.example/a" {
		t.Errorf("PaymentURL first = %q", got.PaymentURL)
	}

	// Second update ke URL berbeda — HARUS di-skip (guard `payment_url = ''`).
	// Registrar biasanya kirim URL sekali → cache lokal jadi read-mostly.
	if err := repo.UpdatePaymentURL(ctx, jobID, "https://pay.example/hijack"); err != nil {
		t.Fatalf("second Update: %v", err)
	}
	got, _ = repo.GetByJobID(ctx, jobID, userID)
	if got.PaymentURL != "https://pay.example/a" {
		t.Errorf("PaymentURL should stay first value, got %q", got.PaymentURL)
	}
}

func TestRepo_ListByUser(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)

	for i := 0; i < 3; i++ {
		if err := repo.Create(ctx, &Purchase{
			UserID: userID, RegistrarJobID: "list-" + uuid.NewString(),
			Domain: "d.id", Years: 1, Status: StatusPendingPayment,
		}); err != nil {
			t.Fatalf("Create: %v", err)
		}
	}

	items, err := repo.ListByUser(ctx, userID, 10)
	if err != nil {
		t.Fatalf("ListByUser: %v", err)
	}
	if len(items) != 3 {
		t.Errorf("got %d items, want 3", len(items))
	}

	// Cross-user isolation.
	other := makeUser(t, ctx)
	otherItems, err := repo.ListByUser(ctx, other, 10)
	if err != nil {
		t.Fatalf("ListByUser other: %v", err)
	}
	if len(otherItems) != 0 {
		t.Errorf("other user should see 0 items, got %d", len(otherItems))
	}
}

func TestRepo_ExpiryNotice_DedupePerDomain(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	domain := "exp-" + uuid.NewString()[:8] + ".id"

	// 2 baris untuk domain sama: register lama (expires 2 hari) + renew baru
	// (expires 200 hari). DISTINCT ON (user_id, domain) harus pilih renew,
	// jadi domain TIDAK muncul di list expiring soon (30 hari).
	oldExp := time.Now().Add(2 * 24 * time.Hour)
	newExp := time.Now().Add(200 * 24 * time.Hour)

	regJobID := "reg-" + uuid.NewString()
	renewJobID := "ren-" + uuid.NewString()

	if err := repo.Create(ctx, &Purchase{
		UserID: userID, RegistrarJobID: regJobID, Domain: domain, Years: 1,
		Status: StatusActive, Kind: KindRegister,
	}); err != nil {
		t.Fatalf("Create reg: %v", err)
	}
	if _, err := repo.UpdateStatus(ctx, regJobID, StatusActive, "", &oldExp); err != nil {
		t.Fatalf("UpdateStatus reg: %v", err)
	}

	if err := repo.Create(ctx, &Purchase{
		UserID: userID, RegistrarJobID: renewJobID, Domain: domain, Years: 1,
		Status: StatusActive, Kind: KindRenew,
	}); err != nil {
		t.Fatalf("Create renew: %v", err)
	}
	if _, err := repo.UpdateStatus(ctx, renewJobID, StatusActive, "", &newExp); err != nil {
		t.Fatalf("UpdateStatus renew: %v", err)
	}

	due, err := repo.ListDueForExpiryNotice(ctx, 30*24*time.Hour, 7*24*time.Hour)
	if err != nil {
		t.Fatalf("ListDueForExpiryNotice: %v", err)
	}
	// Cari domain kita di hasil — HARUSNYA tidak ada karena latest expiry > 30 hari.
	for _, d := range due {
		if d.Domain == domain {
			t.Errorf("domain %s should NOT be due (latest expires_at %v > 30d)",
				domain, newExp)
		}
	}
}

func TestRepo_ExpiryNotice_MarkPreventsResend(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	domain := "mark-" + uuid.NewString()[:8] + ".id"
	jobID := "j-" + uuid.NewString()
	exp := time.Now().Add(5 * 24 * time.Hour) // 5 hari — within 30d window

	if err := repo.Create(ctx, &Purchase{
		UserID: userID, RegistrarJobID: jobID, Domain: domain, Years: 1, Status: StatusActive,
	}); err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := repo.UpdateStatus(ctx, jobID, StatusActive, "", &exp); err != nil {
		t.Fatalf("UpdateStatus: %v", err)
	}

	// First pass: harus muncul di due list.
	due, err := repo.ListDueForExpiryNotice(ctx, 30*24*time.Hour, 7*24*time.Hour)
	if err != nil {
		t.Fatalf("first list: %v", err)
	}
	found := findDomain(due, domain)
	if found == nil {
		t.Fatal("expected domain in due list before mark")
	}

	// Mark sent.
	if err := repo.MarkExpiryNoticeSent(ctx, found.ID); err != nil {
		t.Fatalf("MarkExpiryNoticeSent: %v", err)
	}

	// Second pass with resend=7d — belum 7 hari, jadi HARUS di-skip.
	due, err = repo.ListDueForExpiryNotice(ctx, 30*24*time.Hour, 7*24*time.Hour)
	if err != nil {
		t.Fatalf("second list: %v", err)
	}
	if found := findDomain(due, domain); found != nil {
		t.Errorf("domain %s should be skipped after mark (within resend window)", domain)
	}
}

func findDomain(items []ExpiryDue, domain string) *ExpiryDue {
	for i := range items {
		if items[i].Domain == domain {
			return &items[i]
		}
	}
	return nil
}

// ---------- AdminList ----------

func TestRepo_AdminList_FilterByStatus(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)

	// Seed 3 rows: active, failed, pending_payment.
	seedStatuses := []string{StatusActive, StatusFailed, StatusPendingPayment}
	domainTag := "flt-" + uuid.NewString()[:8]
	for i, s := range seedStatuses {
		if err := repo.Create(ctx, &Purchase{
			UserID: userID, RegistrarJobID: "adm-" + uuid.NewString(),
			Domain: domainTag + fmt.Sprintf(".%d.id", i),
			Years:  1, Status: s,
		}); err != nil {
			t.Fatalf("Create[%d]: %v", i, err)
		}
	}

	// Filter status=failed → hanya 1 dari seed kita.
	items, total, err := repo.AdminList(ctx, AdminListFilter{
		Status: StatusFailed,
		Like:   "%" + domainTag + "%",
		Limit:  50,
		Offset: 0,
	})
	if err != nil {
		t.Fatalf("AdminList: %v", err)
	}
	if total != 1 {
		t.Errorf("total = %d, want 1 (filter status=failed)", total)
	}
	if len(items) != 1 || items[0].Status != StatusFailed {
		t.Errorf("items = %+v, want single failed", items)
	}
	// UserEmail + UserName di-join dari users table — verify non-empty.
	if items[0].UserEmail == "" {
		t.Error("UserEmail should be populated from JOIN")
	}
}

func TestRepo_AdminList_LikeMatchesDomainAndEmail(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()

	// User A dengan email berpola khusus → search by email substring.
	// User B dengan email berbeda tapi domain berpola khusus → search by domain.
	userA := makeUser(t, ctx) // email: u-<uuid>@test.local
	userB := makeUser(t, ctx)

	uniqDomain := "domsrch-" + uuid.NewString()[:8] + ".id"

	if err := repo.Create(ctx, &Purchase{
		UserID: userA, RegistrarJobID: "adom-" + uuid.NewString(),
		Domain: "regular-a.id", Years: 1, Status: StatusActive,
	}); err != nil {
		t.Fatalf("Create A: %v", err)
	}
	if err := repo.Create(ctx, &Purchase{
		UserID: userB, RegistrarJobID: "bdom-" + uuid.NewString(),
		Domain: uniqDomain, Years: 1, Status: StatusActive,
	}); err != nil {
		t.Fatalf("Create B: %v", err)
	}

	// Search by domain substring → hanya B.
	items, total, err := repo.AdminList(ctx, AdminListFilter{
		Like:   "%domsrch-%",
		Limit:  50,
		Offset: 0,
	})
	if err != nil {
		t.Fatalf("AdminList by domain: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].Domain != uniqDomain {
		t.Errorf("by domain = %+v (total %d), want single %s", items, total, uniqDomain)
	}

	// Search by user A's email substring — makeUser bikin email u-<uuid>@test.local,
	// jadi substring UUID hasil unique per user.
	emailFragment := userA.String()[:8]
	items, total, err = repo.AdminList(ctx, AdminListFilter{
		Like:   "%" + emailFragment + "%",
		Limit:  50,
		Offset: 0,
	})
	if err != nil {
		t.Fatalf("AdminList by email: %v", err)
	}
	// User A punya 1 row.
	if total != 1 || len(items) != 1 || items[0].UserID != userA {
		t.Errorf("by email = %+v, want single owned by userA", items)
	}
}

func TestRepo_AdminList_SortPresets(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)

	// 3 domain dengan expires_at berbeda untuk verify sort=expires_soon.
	// Prefix unik supaya isolate dari test lain (via LIKE filter).
	tag := "srt-" + uuid.NewString()[:8]
	rows := []struct {
		domain string
		exp    time.Time
	}{
		{tag + "-c.id", time.Now().Add(300 * 24 * time.Hour)},
		{tag + "-a.id", time.Now().Add(10 * 24 * time.Hour)},
		{tag + "-b.id", time.Now().Add(100 * 24 * time.Hour)},
	}
	for _, r := range rows {
		jobID := "srt-" + uuid.NewString()
		if err := repo.Create(ctx, &Purchase{
			UserID: userID, RegistrarJobID: jobID,
			Domain: r.domain, Years: 1, Status: StatusActive,
		}); err != nil {
			t.Fatalf("Create %s: %v", r.domain, err)
		}
		if _, err := repo.UpdateStatus(ctx, jobID, StatusActive, "", &r.exp); err != nil {
			t.Fatalf("UpdateStatus %s: %v", r.domain, err)
		}
	}

	cases := []struct {
		sort   string
		first  string // domain yang harus muncul di posisi pertama
		reason string
	}{
		{"domain_asc", tag + "-a.id", "alphabetical A first"},
		{"domain_desc", tag + "-c.id", "reverse alphabetical C first"},
		{"expires_soon", tag + "-a.id", "smallest expires_at first"},
	}
	for _, c := range cases {
		t.Run(c.sort, func(t *testing.T) {
			items, _, err := repo.AdminList(ctx, AdminListFilter{
				Like: "%" + tag + "%",
				Sort: c.sort, Limit: 10, Offset: 0,
			})
			if err != nil {
				t.Fatalf("AdminList: %v", err)
			}
			if len(items) == 0 || items[0].Domain != c.first {
				t.Errorf("sort=%s first = %v, want %s (%s)",
					c.sort, first(items), c.first, c.reason)
			}
		})
	}
}

func TestRepo_AdminList_Pagination(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	tag := "pg-" + uuid.NewString()[:8]

	for i := 0; i < 5; i++ {
		if err := repo.Create(ctx, &Purchase{
			UserID: userID, RegistrarJobID: "pg-" + uuid.NewString(),
			Domain: fmt.Sprintf("%s.%d.id", tag, i),
			Years:  1, Status: StatusPendingPayment,
		}); err != nil {
			t.Fatalf("Create[%d]: %v", i, err)
		}
	}

	// Page 1 size 2 → 2 items, total 5.
	items, total, err := repo.AdminList(ctx, AdminListFilter{
		Like:  "%" + tag + "%",
		Limit: 2, Offset: 0,
	})
	if err != nil {
		t.Fatalf("page 1: %v", err)
	}
	if total != 5 {
		t.Errorf("total = %d, want 5", total)
	}
	if len(items) != 2 {
		t.Errorf("page 1 len = %d, want 2", len(items))
	}

	// Page 3 size 2 → 1 item sisa.
	items, _, err = repo.AdminList(ctx, AdminListFilter{
		Like:  "%" + tag + "%",
		Limit: 2, Offset: 4,
	})
	if err != nil {
		t.Fatalf("page 3: %v", err)
	}
	if len(items) != 1 {
		t.Errorf("page 3 len = %d, want 1", len(items))
	}
}

// first returns first item's Domain or "<empty>" — helper cleaner test output.
func first(items []AdminPurchase) string {
	if len(items) == 0 {
		return "<empty>"
	}
	return items[0].Domain
}
