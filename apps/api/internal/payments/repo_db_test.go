package payments

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
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

func TestPayments_SeedApplied(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	// 4 seed methods harus ada.
	all, err := r.ListAll(ctx)
	if err != nil {
		t.Fatalf("ListAll: %v", err)
	}
	if len(all) < 4 {
		t.Fatalf("expected >=4 seeded methods, got %d", len(all))
	}

	// Wallet enabled by default; sisanya disabled.
	wallet, err := r.GetByCode(ctx, CodeDepositWallet)
	if err != nil {
		t.Fatalf("Get(deposit_wallet): %v", err)
	}
	if !wallet.Enabled {
		t.Error("deposit_wallet seed should be enabled=true")
	}
	if wallet.Type != TypeWallet {
		t.Errorf("wallet type = %q, want %q", wallet.Type, TypeWallet)
	}

	midtrans, err := r.GetByCode(ctx, CodeMidtrans)
	if err != nil {
		t.Fatalf("Get(midtrans): %v", err)
	}
	if midtrans.Enabled {
		t.Error("midtrans seed should be enabled=false (needs credentials first)")
	}
	if midtrans.Type != TypeGateway {
		t.Errorf("midtrans type = %q, want %q", midtrans.Type, TypeGateway)
	}
}

func TestPayments_ListEnabled_MasksCredentials(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	// Set Midtrans dengan credentials + enable.
	midtrans, err := r.GetByCode(ctx, CodeMidtrans)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	origConfig := midtrans.Config
	origEnabled := midtrans.Enabled

	newCfg := json.RawMessage(`{"server_key":"real-secret","client_key":"real-client","is_production":false}`)
	enabled := true
	if _, err := r.Update(ctx, midtrans.ID, UpdateInput{
		Enabled: &enabled,
		Config:  newCfg,
	}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	// Cleanup — restore original state di akhir.
	defer func() {
		_, _ = r.Update(ctx, midtrans.ID, UpdateInput{
			Enabled: &origEnabled,
			Config:  origConfig,
		})
	}()

	// ListEnabled should mask credentials.
	enabledMethods, err := r.ListEnabled(ctx)
	if err != nil {
		t.Fatalf("ListEnabled: %v", err)
	}
	var mtFound bool
	for _, m := range enabledMethods {
		if m.Code == CodeMidtrans {
			mtFound = true
			if strings.Contains(string(m.Config), "real-secret") {
				t.Errorf("Midtrans server_key leaked: %s", m.Config)
			}
			if strings.Contains(string(m.Config), "real-client") {
				t.Errorf("Midtrans client_key leaked: %s", m.Config)
			}
			// is_production tetap plaintext.
			if !strings.Contains(string(m.Config), `"is_production":false`) {
				t.Errorf("is_production not preserved: %s", m.Config)
			}
		}
	}
	if !mtFound {
		t.Error("Midtrans not returned by ListEnabled after enabling")
	}

	// GetByCode (admin path) should NOT mask.
	unmasked, err := r.GetByCode(ctx, CodeMidtrans)
	if err != nil {
		t.Fatalf("Get after enable: %v", err)
	}
	if !strings.Contains(string(unmasked.Config), "real-secret") {
		t.Errorf("admin Get should NOT mask, got: %s", unmasked.Config)
	}
}

func TestPayments_CreateCustomAndDelete(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	code := "test-custom-" + uuid.NewString()[:8]
	created, err := r.Create(ctx, CreateInput{
		Code:      code,
		Label:     "Test Custom Gateway",
		Type:      TypeGateway,
		SortOrder: 999,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.Code != code || !bytes.Equal(created.Config, []byte(`{}`)) {
		// Default config kalau tidak di-supply.
	}
	if created.Enabled {
		t.Error("newly created should default enabled=false")
	}

	// Duplicate code → conflict.
	if _, err := r.Create(ctx, CreateInput{Code: code, Label: "dup", Type: TypeGateway}); !errors.Is(err, ErrCodeTaken) {
		t.Errorf("duplicate should return ErrCodeTaken, got %v", err)
	}

	// Invalid type → error.
	if _, err := r.Create(ctx, CreateInput{Code: "another-" + uuid.NewString()[:8], Label: "x", Type: "invalid"}); !errors.Is(err, ErrInvalidType) {
		t.Errorf("invalid type should return ErrInvalidType, got %v", err)
	}

	// Delete → ok.
	if err := r.Delete(ctx, created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := r.Delete(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Delete twice should return ErrNotFound, got %v", err)
	}
}

func TestPayments_UpdatePartialPreservesFields(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	code := "test-partial-" + uuid.NewString()[:8]
	created, _ := r.Create(ctx, CreateInput{
		Code:      code,
		Label:     "Original Label",
		Type:      TypeManual,
		SortOrder: 500,
		Config:    json.RawMessage(`{"banks":["BCA"]}`),
	})
	defer r.Delete(ctx, created.ID)

	// Toggle enable only.
	enabled := true
	updated, err := r.Update(ctx, created.ID, UpdateInput{Enabled: &enabled})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if !updated.Enabled {
		t.Error("Enabled not updated")
	}
	if updated.Label != "Original Label" {
		t.Errorf("Label wiped: %q", updated.Label)
	}
	if updated.SortOrder != 500 {
		t.Errorf("SortOrder wiped: %d", updated.SortOrder)
	}
	if !strings.Contains(string(updated.Config), "BCA") {
		t.Errorf("Config wiped: %s", updated.Config)
	}
}

// Import bytes here since needed above.
var _ = bytes.Equal
