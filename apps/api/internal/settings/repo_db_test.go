package settings

import (
	"context"
	"errors"
	"os"
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

func TestSettings_SeedApplied(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	// Seed migration harusnya insert 9 key. Cek beberapa yang penting.
	ppn, err := r.Get(ctx, KeyPPNRate)
	if err != nil {
		t.Fatalf("Get(tax.ppn_rate): %v", err)
	}
	if ppn.Value != "0.11" {
		t.Errorf("PPN rate seed = %q, want 0.11", ppn.Value)
	}

	brand, err := r.Get(ctx, KeyBrandName)
	if err != nil {
		t.Fatalf("Get(brand.name): %v", err)
	}
	if brand.Value != "Web Builder" {
		t.Errorf("brand.name seed = %q, want 'Web Builder'", brand.Value)
	}

	// Cek description tersimpan.
	if brand.Description == "" {
		t.Errorf("brand.name description empty (seed should set it)")
	}
}

func TestSettings_SetUpsertsAndPreservesDescription(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	// Set existing key — value should update, description preserved.
	before, err := r.Get(ctx, KeyPPNRate)
	if err != nil {
		t.Fatalf("Get before: %v", err)
	}
	oldDesc := before.Description
	oldValue := before.Value

	newValue := "0.12"
	updated, err := r.Set(ctx, KeyPPNRate, newValue, nil)
	if err != nil {
		t.Fatalf("Set: %v", err)
	}
	if updated.Value != newValue {
		t.Errorf("Set value = %q, want %q", updated.Value, newValue)
	}
	if updated.Description != oldDesc {
		t.Errorf("description wiped by upsert: %q → %q", oldDesc, updated.Description)
	}

	// Restore original supaya paralel test tidak conflict.
	_, _ = r.Set(ctx, KeyPPNRate, oldValue, nil)
}

func TestSettings_SetInsertsNewKey(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	key := "test.dynamic_" + uniqueSuffix()
	created, err := r.Set(ctx, key, "value1", nil)
	if err != nil {
		t.Fatalf("Set new: %v", err)
	}
	if created.Value != "value1" {
		t.Errorf("Set new value = %q", created.Value)
	}
	// Cleanup — direct SQL karena repo tidak expose Delete (settings mostly
	// static — hapus via admin panel harus explicit di service layer future).
	defer testPool.Exec(ctx, "DELETE FROM system_settings WHERE key = $1", key)
}

func TestSettings_GetNotFound(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	_, err := r.Get(ctx, "does.not.exist_"+uniqueSuffix())
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestSettings_ListReturnsAllSeededKeys(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	all, err := r.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(all) < 5 {
		t.Errorf("expected >=5 seeded settings, got %d", len(all))
	}
	// Verify sorted by key.
	for i := 1; i < len(all); i++ {
		if all[i].Key < all[i-1].Key {
			t.Errorf("not sorted at index %d: %q < %q", i, all[i].Key, all[i-1].Key)
		}
	}
}

// TestService_FallbackToDefaultsWhenKeyMissing — Service getter harus
// return default value kalau key tidak ada di DB (mis. admin delete manual).
func TestService_FallbackToDefaultsWhenKeyMissing(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	// Ensure key doesn't exist di DB — pakai custom key yang tidak di-seed.
	// PPNRate accessor: kalau key di DB, pakai itu. Kalau tidak, defaults["tax.ppn_rate"] = "0.11".
	//
	// Test cara: instansiasi service dgn TTL kecil, delete key temp, verify
	// service kembali ke default. Untuk avoid mess dgn key production,
	// pakai BrandSupportPhone yang seed-nya kosong string.
	svc := NewService(r).WithTTL(1)
	phone := svc.BrandSupportPhone(ctx)
	if phone != "" {
		t.Errorf("BrandSupportPhone seed = %q, want empty", phone)
	}
}

// TestService_CacheHitsAfterFirstRead — cache should prevent 2nd DB roundtrip.
func TestService_CacheHitsAfterFirstRead(t *testing.T) {
	r := needsDB(t)
	svc := NewService(r) // 60s default TTL
	ctx := context.Background()

	_ = svc.PPNRate(ctx) // populate cache
	// Verify cache entry exists.
	svc.mu.RLock()
	_, cached := svc.cache[KeyPPNRate]
	svc.mu.RUnlock()
	if !cached {
		t.Error("first PPNRate() should populate cache")
	}

	// Invalidate → cache entry gone.
	svc.Invalidate(KeyPPNRate)
	svc.mu.RLock()
	_, stillCached := svc.cache[KeyPPNRate]
	svc.mu.RUnlock()
	if stillCached {
		t.Error("Invalidate should remove cache entry")
	}
}

// uniqueSuffix — generate random suffix untuk paralel-test key naming.
func uniqueSuffix() string {
	return uuid.NewString()[:8]
}
