package promos

import (
	"context"
	"errors"
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

func needsDB(t *testing.T) (*Repo, *Service) {
	t.Helper()
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	r := NewRepo(testPool)
	return r, NewService(r)
}

func makeUser(t *testing.T, ctx context.Context) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testPool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, 'x', $3)`,
		id, "promo-"+id.String()+"@test.local", "Promo Test")
	if err != nil {
		t.Fatalf("makeUser: %v", err)
	}
	return id
}

// makeInvoice — barebones invoice row supaya redemption FK lolos. Kolom
// mandatory di-set manual (bukan lewat invoices.Service supaya test tidak
// coupling ke package lain).
func makeInvoice(t *testing.T, ctx context.Context, userID uuid.UUID) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testPool.Exec(ctx, `INSERT INTO invoices
		(id, number, user_id, subtotal, tax_rate, tax_amount, total, currency,
		 status, payment_method, due_at, metadata)
		VALUES ($1, $2, $3, 100000, 0, 0, 100000, 'IDR',
		        'draft', 'midtrans', now() + interval '1 hour', '{}'::jsonb)`,
		id, "INV-TEST-"+id.String()[:8], userID)
	if err != nil {
		t.Fatalf("makeInvoice: %v", err)
	}
	return id
}

func TestRepo_Create_UppercaseCode(t *testing.T) {
	r, _ := needsDB(t)
	ctx := context.Background()

	p, err := r.Create(ctx, CreateInput{
		Code:          "welcome10",
		DiscountType:  DiscountPercent,
		DiscountValue: 10,
		AppliesTo:     AppliesToBoth,
		AllowedTLDs:   []string{},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if p.Code != "WELCOME10" {
		t.Errorf("code must be uppercased in DB, got %q", p.Code)
	}
	_ = r.Delete(ctx, p.ID)
}

func TestRepo_Create_UniqueCode(t *testing.T) {
	r, _ := needsDB(t)
	ctx := context.Background()

	code := "UNIQ" + uuid.NewString()[:6]
	p1, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountPercent, DiscountValue: 5,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
	})
	if err != nil {
		t.Fatalf("Create #1: %v", err)
	}
	defer r.Delete(ctx, p1.ID)

	_, err = r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountFixed, DiscountValue: 1000,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
	})
	if !errors.Is(err, ErrCodeTaken) {
		t.Errorf("expected ErrCodeTaken, got %v", err)
	}
}

func TestRepo_GetByCode_CaseInsensitive(t *testing.T) {
	r, _ := needsDB(t)
	ctx := context.Background()

	code := "MIX" + uuid.NewString()[:6]
	created, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountPercent, DiscountValue: 10,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, created.ID)

	// Lookup dengan lowercase — harus tetap ketemu karena repo pakai UPPER($1).
	found, err := r.GetByCode(ctx, "mix"+code[3:])
	if err != nil {
		t.Fatalf("GetByCode: %v", err)
	}
	if found.ID != created.ID {
		t.Errorf("GetByCode returned different ID")
	}
}

func TestRepo_InsertRedemption_UniqueInvoice(t *testing.T) {
	r, _ := needsDB(t)
	ctx := context.Background()

	uid := makeUser(t, ctx)
	invID := makeInvoice(t, ctx, uid)
	p, err := r.Create(ctx, CreateInput{
		Code: "UNQ" + uuid.NewString()[:6], DiscountType: DiscountFixed,
		DiscountValue: 10_000, AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)

	rd1 := &Redemption{PromoID: p.ID, UserID: uid, InvoiceID: invID, DiscountApplied: 10_000}
	if err := r.InsertRedemption(ctx, rd1); err != nil {
		t.Fatalf("InsertRedemption #1: %v", err)
	}

	// Insert kedua untuk invoice sama — harus unique violation (23505).
	rd2 := &Redemption{PromoID: p.ID, UserID: uid, InvoiceID: invID, DiscountApplied: 10_000}
	if err := r.InsertRedemption(ctx, rd2); err == nil {
		t.Errorf("expected unique violation for duplicate invoice_id, got nil")
	}
}

func TestService_Validate_InvalidCode(t *testing.T) {
	_, s := needsDB(t)
	ctx := context.Background()

	_, err := s.Validate(ctx, ValidateInput{
		Code: "NOTEXIST" + uuid.NewString()[:4], UserID: uuid.New(),
		TLD: "id", Kind: AppliesToRegister, Subtotal: 100_000,
	})
	if !errors.Is(err, ErrInvalidCode) {
		t.Errorf("expected ErrInvalidCode, got %v", err)
	}
}

func TestService_Validate_Inactive(t *testing.T) {
	r, s := needsDB(t)
	ctx := context.Background()

	code := "INACT" + uuid.NewString()[:6]
	p, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountPercent, DiscountValue: 10,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)
	// Disable.
	_, err = r.Update(ctx, p.ID, UpdateInput{
		DiscountType: p.DiscountType, DiscountValue: p.DiscountValue,
		AppliesTo: p.AppliesTo, AllowedTLDs: p.AllowedTLDs,
		MaxUsesPerUser: p.MaxUsesPerUser, Active: false,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}

	_, err = s.Validate(ctx, ValidateInput{
		Code: code, UserID: uuid.New(),
		TLD: "id", Kind: AppliesToRegister, Subtotal: 100_000,
	})
	if !errors.Is(err, ErrInactive) {
		t.Errorf("expected ErrInactive, got %v", err)
	}
}

func TestService_Validate_KindMismatch(t *testing.T) {
	r, s := needsDB(t)
	ctx := context.Background()

	code := "REG" + uuid.NewString()[:6]
	p, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountPercent, DiscountValue: 10,
		AppliesTo: AppliesToRegister, AllowedTLDs: []string{},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)

	// Promo register-only, tapi kind=renew → ErrKindMismatch.
	_, err = s.Validate(ctx, ValidateInput{
		Code: code, UserID: uuid.New(),
		TLD: "id", Kind: AppliesToRenew, Subtotal: 100_000,
	})
	if !errors.Is(err, ErrKindMismatch) {
		t.Errorf("expected ErrKindMismatch, got %v", err)
	}
}

func TestService_Validate_TLDMismatch(t *testing.T) {
	r, s := needsDB(t)
	ctx := context.Background()

	code := "TLD" + uuid.NewString()[:6]
	p, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountPercent, DiscountValue: 10,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{"id", "co.id"},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)

	_, err = s.Validate(ctx, ValidateInput{
		Code: code, UserID: uuid.New(),
		TLD: "com", Kind: AppliesToRegister, Subtotal: 100_000,
	})
	if !errors.Is(err, ErrTLDMismatch) {
		t.Errorf("expected ErrTLDMismatch for .com when whitelist [id,co.id], got %v", err)
	}
}

func TestService_Validate_MinSubtotal(t *testing.T) {
	r, s := needsDB(t)
	ctx := context.Background()

	code := "MIN" + uuid.NewString()[:6]
	p, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountFixed, DiscountValue: 5_000,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
		MinSubtotal: 100_000,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)

	_, err = s.Validate(ctx, ValidateInput{
		Code: code, UserID: uuid.New(),
		TLD: "id", Kind: AppliesToRegister, Subtotal: 50_000,
	})
	if !errors.Is(err, ErrMinSubtotal) {
		t.Errorf("expected ErrMinSubtotal, got %v", err)
	}
}

func TestService_Validate_Expired(t *testing.T) {
	r, s := needsDB(t)
	ctx := context.Background()

	code := "EXP" + uuid.NewString()[:6]
	past := time.Now().Add(-24 * time.Hour)
	p, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountPercent, DiscountValue: 10,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
		ValidUntil: &past,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)

	_, err = s.Validate(ctx, ValidateInput{
		Code: code, UserID: uuid.New(),
		TLD: "id", Kind: AppliesToRegister, Subtotal: 100_000,
	})
	if !errors.Is(err, ErrExpired) {
		t.Errorf("expected ErrExpired, got %v", err)
	}
}

func TestService_Validate_UserMaxUses(t *testing.T) {
	r, s := needsDB(t)
	ctx := context.Background()

	code := "USE" + uuid.NewString()[:6]
	p, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountFixed, DiscountValue: 5_000,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
		MaxUsesPerUser: 1,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)

	uid := makeUser(t, ctx)
	invID := makeInvoice(t, ctx, uid)

	// First redeem — pakai 1 slot.
	if _, err := s.Redeem(ctx, p.ID, uid, invID, 5_000); err != nil {
		t.Fatalf("Redeem #1: %v", err)
	}

	// Kedua kalinya user yang sama → ErrUserMaxUses.
	_, err = s.Validate(ctx, ValidateInput{
		Code: code, UserID: uid,
		TLD: "id", Kind: AppliesToRegister, Subtotal: 100_000,
	})
	if !errors.Is(err, ErrUserMaxUses) {
		t.Errorf("expected ErrUserMaxUses, got %v", err)
	}
}

func TestService_Validate_HappyPathReturnsDiscount(t *testing.T) {
	r, s := needsDB(t)
	ctx := context.Background()

	code := "OK" + uuid.NewString()[:6]
	p, err := r.Create(ctx, CreateInput{
		Code: code, DiscountType: DiscountPercent, DiscountValue: 15,
		AppliesTo: AppliesToBoth, AllowedTLDs: []string{},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	defer r.Delete(ctx, p.ID)

	res, err := s.Validate(ctx, ValidateInput{
		Code: code, UserID: uuid.New(),
		TLD: "id", Kind: AppliesToRegister, Subtotal: 100_000,
	})
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if res.Discount != 15_000 {
		t.Errorf("15%% of 100k = 15k, got %d", res.Discount)
	}
	if res.Promo.ID != p.ID {
		t.Errorf("Promo ID mismatch")
	}
}
