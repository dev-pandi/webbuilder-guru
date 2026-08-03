package zones

// Integration tests. Butuh TEST_DATABASE_URL env; kalau kosong SKIP.

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

// Zone id/tld disposable — pakai random suffix supaya paralel test dengan
// data seed (.id, .co.id, dsb.) tidak bentrok.
func randomTLD() string {
	return "test-" + uuid.NewString()[:8]
}

func TestZones_SeedApplied(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	// Seed migration insert .id, .co.id, dst. Cek 3 yang paling penting.
	got, err := r.GetByTLD(ctx, "id")
	if err != nil {
		t.Fatalf("GetByTLD(id): %v", err)
	}
	if got.Label != ".id" || !got.RequireDocument || !got.NikAutoApproved {
		t.Errorf("seed .id shape: %+v", got)
	}

	coid, err := r.GetByTLD(ctx, "co.id")
	if err != nil {
		t.Fatalf("GetByTLD(co.id): %v", err)
	}
	if coid.NikAutoApproved {
		t.Errorf(".co.id NIK auto-approved harus false (butuh dokumen): %+v", coid)
	}

	web, err := r.GetByTLD(ctx, "web.id")
	if err != nil {
		t.Fatalf("GetByTLD(web.id): %v", err)
	}
	if web.RequireDocument || !web.AutoApproved {
		t.Errorf(".web.id shape: %+v", web)
	}
}

func TestZones_CreateUpdateDelete(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	tld := randomTLD()
	created, err := r.Create(ctx, CreateInput{
		TLD:             tld,
		Label:           "." + tld,
		RequireDocument: true,
		SortOrder:       999,
		MinYears:        1,
		MaxYears:        5,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.TLD != tld || created.MinYears != 1 || created.MaxYears != 5 {
		t.Errorf("Create result mismatch: %+v", created)
	}
	if !created.Active {
		t.Error("Create should default Active=true")
	}

	// Duplicate TLD should conflict.
	if _, err := r.Create(ctx, CreateInput{TLD: tld, Label: "dup"}); !errors.Is(err, ErrTLDTaken) {
		t.Errorf("duplicate create should return ErrTLDTaken, got %v", err)
	}

	// Update: toggle inactive + tweak years.
	inactive := false
	newMax := 3
	updated, err := r.Update(ctx, created.ID, UpdateInput{
		Active:   &inactive,
		MaxYears: &newMax,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Active || updated.MaxYears != 3 {
		t.Errorf("Update result: %+v", updated)
	}

	// ListActive should NOT include this now-inactive one.
	active, err := r.ListActive(ctx)
	if err != nil {
		t.Fatalf("ListActive: %v", err)
	}
	for _, z := range active {
		if z.ID == created.ID {
			t.Errorf("inactive zone leaked ke ListActive: %+v", z)
		}
	}

	// Delete.
	if err := r.Delete(ctx, created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := r.Delete(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("Delete on missing should return ErrNotFound, got %v", err)
	}
	if _, err := r.GetByID(ctx, created.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("GetByID after delete should return ErrNotFound, got %v", err)
	}
}

func TestZones_ListAllOrderedBySortThenTLD(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	all, err := r.ListAll(ctx)
	if err != nil {
		t.Fatalf("ListAll: %v", err)
	}
	if len(all) < 5 {
		t.Fatalf("expected seed to have >=5 zones, got %d", len(all))
	}
	// Sort_order strictly non-decreasing.
	for i := 1; i < len(all); i++ {
		if all[i].SortOrder < all[i-1].SortOrder {
			t.Errorf("sort_order not ordered at index %d: %d < %d", i, all[i].SortOrder, all[i-1].SortOrder)
		}
	}
}

func TestZones_UpdateLeavesUnspecifiedFields(t *testing.T) {
	r := needsDB(t)
	ctx := context.Background()

	tld := randomTLD()
	created, _ := r.Create(ctx, CreateInput{
		TLD:             tld,
		Label:           "custom-label",
		RequireDocument: true,
		NikAutoApproved: true,
		SortOrder:       500,
	})
	defer r.Delete(ctx, created.ID)

	// Toggle just Active — semua field lain harus tetap sama.
	inactive := false
	updated, err := r.Update(ctx, created.ID, UpdateInput{Active: &inactive})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Label != "custom-label" {
		t.Errorf("Label wiped: %q", updated.Label)
	}
	if !updated.RequireDocument || !updated.NikAutoApproved {
		t.Errorf("bool fields not preserved: %+v", updated)
	}
	if updated.SortOrder != 500 {
		t.Errorf("SortOrder wiped: %d", updated.SortOrder)
	}
}
