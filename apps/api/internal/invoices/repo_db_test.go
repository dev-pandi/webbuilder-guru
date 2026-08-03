package invoices

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/webbuilder/api/internal/db"
	"github.com/webbuilder/api/internal/settings"
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

// makeUser — insert dummy user + return id (untuk FK).
func makeUser(t *testing.T, ctx context.Context) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testPool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, 'x', $3)`,
		id, "inv-test-"+id.String()+"@example.com", "Invoice Test")
	if err != nil {
		t.Fatalf("makeUser: %v", err)
	}
	return id
}

func TestRepo_NextNumber_SequentialPerMonth(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	now := time.Now()
	n1, err := r.NextNumber(ctx, now)
	if err != nil {
		t.Fatalf("NextNumber: %v", err)
	}
	if !strings.HasPrefix(n1, "INV-") {
		t.Errorf("number prefix wrong: %q", n1)
	}
	// Format check.
	expectedPrefix := now.Format("INV-2006-01-")
	if !strings.HasPrefix(n1, expectedPrefix) {
		t.Errorf("number = %q, expected prefix %q", n1, expectedPrefix)
	}
	// Length exact: prefix + 6 digits.
	if len(n1) != len(expectedPrefix)+6 {
		t.Errorf("number length = %d, expected %d", len(n1), len(expectedPrefix)+6)
	}
}

func TestRepo_CreateAndGetWithLines(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)

	number, _ := r.NextNumber(ctx, time.Now())
	created, err := r.Create(ctx, CreateInput{
		Number:        number,
		UserID:        userID,
		Subtotal:      250000,
		TaxRate:       0.11,
		TaxAmount:     27500,
		Total:         277500,
		PaymentMethod: "midtrans",
		DueAt:         time.Now().Add(24 * time.Hour),
		Lines: []LineInput{
			{Description: "Register .id — myshop.id (1 tahun)", Quantity: 1, UnitPrice: 250000},
		},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Status != StatusDraft {
		t.Errorf("initial status = %v, want draft", created.Status)
	}
	if len(created.Lines) != 1 {
		t.Fatalf("expected 1 line, got %d", len(created.Lines))
	}
	if created.Lines[0].Subtotal != 250000 {
		t.Errorf("line subtotal = %d", created.Lines[0].Subtotal)
	}

	// Re-fetch dengan hydrated lines.
	got, err := r.GetWithLines(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetWithLines: %v", err)
	}
	if len(got.Lines) != 1 || got.Lines[0].Description != "Register .id — myshop.id (1 tahun)" {
		t.Errorf("re-fetched lines mismatch: %+v", got.Lines)
	}

	// GetByNumber juga harus resolve.
	byNum, err := r.GetByNumber(ctx, number)
	if err != nil {
		t.Fatalf("GetByNumber: %v", err)
	}
	if byNum.ID != created.ID {
		t.Errorf("GetByNumber returned different ID")
	}
}

func TestRepo_SavePaymentRef_PromotesDraftToUnpaid(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	number, _ := r.NextNumber(ctx, time.Now())
	inv, _ := r.Create(ctx, CreateInput{
		Number: number, UserID: userID, Subtotal: 100, TaxRate: 0, TaxAmount: 0,
		Total: 100, PaymentMethod: "midtrans", DueAt: time.Now().Add(1 * time.Hour),
	})

	if err := r.SavePaymentRef(ctx, inv.ID, "midtrans-txn-abc"); err != nil {
		t.Fatalf("SavePaymentRef: %v", err)
	}
	got, _ := r.GetByID(ctx, inv.ID)
	if got.Status != StatusUnpaid {
		t.Errorf("status after SavePaymentRef = %v, want unpaid", got.Status)
	}
	if got.PaymentGwRef == nil || *got.PaymentGwRef != "midtrans-txn-abc" {
		t.Errorf("payment_gw_ref = %v", got.PaymentGwRef)
	}

	// Idempotent-ish: second call harus error (sudah unpaid, bukan draft).
	if err := r.SavePaymentRef(ctx, inv.ID, "different"); !errors.Is(err, ErrInvalidStatus) {
		t.Errorf("second SavePaymentRef should error, got %v", err)
	}
}

func TestRepo_MarkPaid_Idempotent(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	number, _ := r.NextNumber(ctx, time.Now())
	inv, _ := r.Create(ctx, CreateInput{
		Number: number, UserID: userID, Subtotal: 100, TaxRate: 0, TaxAmount: 0,
		Total: 100, PaymentMethod: "midtrans", DueAt: time.Now().Add(1 * time.Hour),
	})
	_ = r.SavePaymentRef(ctx, inv.ID, "ref-1")

	now := time.Now()
	if err := r.MarkPaid(ctx, inv.ID, now, "ref-1"); err != nil {
		t.Fatalf("MarkPaid: %v", err)
	}
	// Second MarkPaid — idempotent, no error.
	if err := r.MarkPaid(ctx, inv.ID, now, "ref-1"); err != nil {
		t.Errorf("second MarkPaid should be idempotent, got %v", err)
	}
	got, _ := r.GetByID(ctx, inv.ID)
	if got.Status != StatusPaid {
		t.Errorf("status = %v, want paid", got.Status)
	}
}

func TestRepo_GetByGatewayRef(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	number, _ := r.NextNumber(ctx, time.Now())
	inv, _ := r.Create(ctx, CreateInput{
		Number: number, UserID: userID, Subtotal: 100, TaxRate: 0, TaxAmount: 0,
		Total: 100, PaymentMethod: "midtrans", DueAt: time.Now().Add(1 * time.Hour),
	})
	ref := "unique-ref-" + uuid.NewString()[:8]
	_ = r.SavePaymentRef(ctx, inv.ID, ref)

	got, err := r.GetByGatewayRef(ctx, ref)
	if err != nil {
		t.Fatalf("GetByGatewayRef: %v", err)
	}
	if got.ID != inv.ID {
		t.Errorf("returned different invoice")
	}

	// Non-existent ref → NotFound.
	if _, err := r.GetByGatewayRef(ctx, "does-not-exist-"+uuid.NewString()); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestService_CreateForRegister_AppliesPPN(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)

	// Settings service dengan PPN default 11%.
	settingsRepo := settings.NewRepo(testPool)
	settingsSvc := settings.NewService(settingsRepo)

	svc := NewService(r, settingsSvc)
	inv, err := svc.CreateForRegister(ctx, CreateForRegisterInput{
		UserID:        userID,
		Domain:        "myshop.id",
		Years:         2,
		UnitPrice:     250000,
		PaymentMethod: "midtrans",
		Kind:          "register",
	})
	if err != nil {
		t.Fatalf("CreateForRegister: %v", err)
	}
	// Expected: subtotal = 2 * 250000 = 500000, PPN 11% = 55000, total = 555000.
	if inv.Subtotal != 500000 {
		t.Errorf("subtotal = %d, want 500000", inv.Subtotal)
	}
	if inv.TaxAmount != 55000 {
		t.Errorf("tax_amount = %d, want 55000 (11%% of 500000)", inv.TaxAmount)
	}
	if inv.Total != 555000 {
		t.Errorf("total = %d, want 555000", inv.Total)
	}
	if inv.TaxRate != 0.11 {
		t.Errorf("tax_rate = %v, want 0.11", inv.TaxRate)
	}
	if len(inv.Lines) != 1 || inv.Lines[0].Quantity != 2 {
		t.Errorf("lines mismatch: %+v", inv.Lines)
	}
}

func TestService_CreateForRegister_AppliesPromoDiscount(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)

	settingsSvc := settings.NewService(settings.NewRepo(testPool))
	svc := NewService(r, settingsSvc)
	inv, err := svc.CreateForRegister(ctx, CreateForRegisterInput{
		UserID:        userID,
		Domain:        "promo.id",
		Years:         1,
		UnitPrice:     250000,
		PromoDiscount: 50000,
		PaymentMethod: "manual_bank",
		PromoCode:     "TEST50",
	})
	if err != nil {
		t.Fatalf("CreateForRegister: %v", err)
	}
	// Subtotal setelah promo = 250000 - 50000 = 200000, PPN = 22000, total = 222000.
	if inv.Subtotal != 200000 {
		t.Errorf("subtotal after promo = %d, want 200000", inv.Subtotal)
	}
	if inv.Total != 222000 {
		t.Errorf("total = %d, want 222000", inv.Total)
	}
	// Metadata harus include promo_code + promo_discount.
	metaStr := string(inv.Metadata)
	if !strings.Contains(metaStr, "TEST50") {
		t.Errorf("metadata missing promo_code: %s", metaStr)
	}
	if !strings.Contains(metaStr, "50000") {
		t.Errorf("metadata missing promo_discount: %s", metaStr)
	}
}

func TestService_CreateForRegister_ValidatesInput(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	svc := NewService(r, nil)

	cases := []struct {
		name string
		in   CreateForRegisterInput
	}{
		{"years 0", CreateForRegisterInput{UserID: uuid.New(), Domain: "x.id", UnitPrice: 100000, PaymentMethod: "m"}},
		{"unit price 0", CreateForRegisterInput{UserID: uuid.New(), Domain: "x.id", Years: 1, PaymentMethod: "m"}},
		{"empty domain", CreateForRegisterInput{UserID: uuid.New(), Years: 1, UnitPrice: 100000, PaymentMethod: "m"}},
		{"empty payment_method", CreateForRegisterInput{UserID: uuid.New(), Domain: "x.id", Years: 1, UnitPrice: 100000}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := svc.CreateForRegister(ctx, tc.in); err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestService_Cancel_UnpaidOK(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)
	settingsSvc := settings.NewService(settings.NewRepo(testPool))
	svc := NewService(r, settingsSvc)

	inv, _ := svc.CreateForRegister(ctx, CreateForRegisterInput{
		UserID: userID, Domain: "cancel.id", Years: 1, UnitPrice: 100000, PaymentMethod: "m",
	})
	if err := svc.Cancel(ctx, inv.ID); err != nil {
		t.Fatalf("Cancel draft: %v", err)
	}
	got, _ := r.GetByID(ctx, inv.ID)
	if got.Status != StatusCancelled {
		t.Errorf("status = %v, want cancelled", got.Status)
	}

	// Cancel paid → should error.
	inv2, _ := svc.CreateForRegister(ctx, CreateForRegisterInput{
		UserID: userID, Domain: "paid.id", Years: 1, UnitPrice: 100000, PaymentMethod: "m",
	})
	_ = r.SavePaymentRef(ctx, inv2.ID, "ref")
	_ = r.MarkPaid(ctx, inv2.ID, time.Now(), "ref")
	if err := svc.Cancel(ctx, inv2.ID); !errors.Is(err, ErrInvalidStatus) {
		t.Errorf("Cancel paid should error with ErrInvalidStatus, got %v", err)
	}
}

func TestRepo_ListByUser_Ordering(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()
	userID := makeUser(t, ctx)

	// Create 3 invoices in sequence.
	for i := 0; i < 3; i++ {
		number, _ := r.NextNumber(ctx, time.Now())
		_, _ = r.Create(ctx, CreateInput{
			Number: number, UserID: userID, Subtotal: 100, TaxRate: 0, TaxAmount: 0,
			Total: 100, PaymentMethod: "m", DueAt: time.Now().Add(time.Hour),
		})
		time.Sleep(2 * time.Millisecond) // spread created_at
	}

	items, err := r.ListByUser(ctx, userID, 10, 0)
	if err != nil {
		t.Fatalf("ListByUser: %v", err)
	}
	if len(items) < 3 {
		t.Fatalf("expected >=3 items, got %d", len(items))
	}
	// DESC order by created_at.
	for i := 1; i < len(items); i++ {
		if items[i].CreatedAt.After(items[i-1].CreatedAt) {
			t.Errorf("not DESC order at index %d", i)
		}
	}
}
