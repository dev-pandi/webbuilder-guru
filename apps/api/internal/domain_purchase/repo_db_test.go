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
