package wallet_local

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/webbuilder/api/internal/db"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
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

func makeUser(t *testing.T, ctx context.Context) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testPool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, 'x', $3)`,
		id, "wallet-"+id.String()+"@test.local", "Wallet Test")
	if err != nil {
		t.Fatalf("makeUser: %v", err)
	}
	return id
}

func TestGetBalance_NoRowReturnsZero(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	b, err := r.GetBalance(ctx, uid)
	if err != nil {
		t.Fatalf("GetBalance: %v", err)
	}
	if b.Balance != 0 || b.Currency != "IDR" {
		t.Errorf("expected zero balance IDR, got %+v", b)
	}
}

func TestCredit_CreatesBalanceAndLedger(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	entry, err := r.Credit(ctx, TopupInput{
		UserID: uid, Amount: 100000, Reason: ReasonTopup,
	})
	if err != nil {
		t.Fatalf("Credit: %v", err)
	}
	if entry.Delta != 100000 {
		t.Errorf("delta = %d, want 100000", entry.Delta)
	}
	if entry.BalanceAfter != 100000 {
		t.Errorf("balance_after = %d", entry.BalanceAfter)
	}
	if entry.Reason != ReasonTopup {
		t.Errorf("reason = %q", entry.Reason)
	}

	b, _ := r.GetBalance(ctx, uid)
	if b.Balance != 100000 {
		t.Errorf("balance after credit = %d", b.Balance)
	}
}

func TestCredit_Accumulates(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	_, _ = r.Credit(ctx, TopupInput{UserID: uid, Amount: 50000, Reason: ReasonTopup})
	_, _ = r.Credit(ctx, TopupInput{UserID: uid, Amount: 30000, Reason: ReasonTopup})
	b, _ := r.GetBalance(ctx, uid)
	if b.Balance != 80000 {
		t.Errorf("accumulated balance = %d, want 80000", b.Balance)
	}
}

func TestCredit_RejectsZeroOrNegative(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	if _, err := r.Credit(ctx, TopupInput{UserID: uid, Amount: 0}); !errors.Is(err, ErrInvalidAmount) {
		t.Errorf("expected ErrInvalidAmount for 0, got %v", err)
	}
	if _, err := r.Credit(ctx, TopupInput{UserID: uid, Amount: -100}); !errors.Is(err, ErrInvalidAmount) {
		t.Errorf("expected ErrInvalidAmount for negative, got %v", err)
	}
}

func TestDebit_InsufficientRejects(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	// Wallet belum ada row → insufficient.
	_, err := r.Debit(ctx, DebitInput{UserID: uid, Amount: 100, Reason: ReasonDebitRegister})
	if !errors.Is(err, ErrInsufficient) {
		t.Errorf("expected ErrInsufficient (no row), got %v", err)
	}

	// Setelah topup 100, coba debit 500 → insufficient.
	_, _ = r.Credit(ctx, TopupInput{UserID: uid, Amount: 100, Reason: ReasonTopup})
	_, err = r.Debit(ctx, DebitInput{UserID: uid, Amount: 500, Reason: ReasonDebitRegister})
	if !errors.Is(err, ErrInsufficient) {
		t.Errorf("expected ErrInsufficient (< balance), got %v", err)
	}
}

func TestDebit_Succeeds(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	_, _ = r.Credit(ctx, TopupInput{UserID: uid, Amount: 500000, Reason: ReasonTopup})

	entry, err := r.Debit(ctx, DebitInput{
		UserID: uid, Amount: 250000, Reason: ReasonDebitRegister,
	})
	if err != nil {
		t.Fatalf("Debit: %v", err)
	}
	if entry.Delta != -250000 {
		t.Errorf("delta = %d, want -250000", entry.Delta)
	}
	if entry.BalanceAfter != 250000 {
		t.Errorf("balance_after = %d", entry.BalanceAfter)
	}

	b, _ := r.GetBalance(ctx, uid)
	if b.Balance != 250000 {
		t.Errorf("balance after debit = %d", b.Balance)
	}
}

func TestDebit_ConcurrentSafety(t *testing.T) {
	// Concurrent debit dari balance yang cukup untuk 1x tapi bukan 2x —
	// harus tepat 1 yang sukses, 1 fail ErrInsufficient.
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)
	_, _ = r.Credit(ctx, TopupInput{UserID: uid, Amount: 100000, Reason: ReasonTopup})

	var wg sync.WaitGroup
	var successCount, insuffCount int
	var mu sync.Mutex
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := r.Debit(ctx, DebitInput{
				UserID: uid, Amount: 100000, Reason: ReasonDebitRegister,
			})
			mu.Lock()
			defer mu.Unlock()
			if err == nil {
				successCount++
			} else if errors.Is(err, ErrInsufficient) {
				insuffCount++
			}
		}()
	}
	wg.Wait()

	if successCount != 1 || insuffCount != 1 {
		t.Errorf("expected exactly 1 success + 1 insufficient, got %d/%d", successCount, insuffCount)
	}
	b, _ := r.GetBalance(ctx, uid)
	if b.Balance != 0 {
		t.Errorf("final balance = %d, want 0", b.Balance)
	}
}

func TestListLedger_DESCOrdering(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	_, _ = r.Credit(ctx, TopupInput{UserID: uid, Amount: 100, Reason: ReasonTopup})
	_, _ = r.Credit(ctx, TopupInput{UserID: uid, Amount: 200, Reason: ReasonTopup})
	_, _ = r.Debit(ctx, DebitInput{UserID: uid, Amount: 50, Reason: ReasonDebitRegister})

	items, err := r.ListLedger(ctx, uid, 10, 0)
	if err != nil {
		t.Fatalf("ListLedger: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(items))
	}
	// DESC — latest first (debit -50).
	if items[0].Delta != -50 {
		t.Errorf("first (latest) should be debit, got delta=%d", items[0].Delta)
	}
	// Balance_after final = 100+200-50 = 250.
	if items[0].BalanceAfter != 250 {
		t.Errorf("final balance_after = %d, want 250", items[0].BalanceAfter)
	}
}

func TestFindByReference(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	uid := makeUser(t, ctx)

	ref := uuid.New()
	_, err := r.Credit(ctx, TopupInput{
		UserID: uid, Amount: 100, Reason: ReasonTopup, ReferenceID: &ref,
	})
	if err != nil {
		t.Fatalf("Credit: %v", err)
	}
	entry, err := r.FindByReference(ctx, ref, ReasonTopup)
	if err != nil {
		t.Fatalf("FindByReference: %v", err)
	}
	if entry.UserID != uid || entry.Delta != 100 {
		t.Errorf("unexpected entry: %+v", entry)
	}
	// Reference tidak ada → NotFound.
	if _, err := r.FindByReference(ctx, uuid.New(), ReasonTopup); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}
