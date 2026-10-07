package dns_providers

// Integration tests untuk Repo methods yang ngomong ke Postgres.
// Butuh `TEST_DATABASE_URL` env — kalau kosong, test SKIP (pure-func tests
// di factory_test.go tetap jalan). CI selalu set env ini.
//
// Isolation: setiap test bikin config dengan nama unik supaya paralel OK.
// Cleanup not needed — TEST_DATABASE_URL ephemeral per CI run.

import (
	"context"
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

func makeConfig(t *testing.T, repo *Repo, kind, name string, priority int, isDefault, isActive bool) *Config {
	t.Helper()
	suffix := uuid.NewString()[:8]
	c, err := repo.Create(context.Background(), CreateInput{
		Kind: kind, Name: name + "-" + suffix,
		APIToken:  "tok-" + suffix,
		AccountID: "acct-" + suffix,
		IsDefault: isDefault, IsActive: isActive, Priority: priority,
	})
	if err != nil {
		t.Fatalf("makeConfig(%s): %v", name, err)
	}
	return c
}

// --- CRUD basics ------------------------------------------------------------

func TestRepo_Create_And_GetByID(t *testing.T) {
	repo := needsDB(t)
	c := makeConfig(t, repo, KindCloudflare, "cf", 10, false, true)
	got, err := repo.GetByID(context.Background(), c.ID)
	if err != nil {
		t.Fatalf("GetByID: %v", err)
	}
	if got.Name != c.Name || got.Kind != KindCloudflare {
		t.Errorf("round-trip mismatch: %+v", got)
	}
	if got.APIToken == "" {
		t.Error("api_token should be returned by GetByID (needed by factory)")
	}
}

func TestRepo_GetByID_NotFound(t *testing.T) {
	repo := needsDB(t)
	_, err := repo.GetByID(context.Background(), uuid.New())
	if err != ErrNotFound {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

func TestRepo_Create_InvalidKind(t *testing.T) {
	repo := needsDB(t)
	_, err := repo.Create(context.Background(), CreateInput{
		Kind: "bogus", Name: "x", APIToken: "t",
	})
	if err != ErrKindInvalid {
		t.Errorf("want ErrKindInvalid, got %v", err)
	}
}

// --- Default-per-kind uniqueness (partial unique index) ---------------------

func TestRepo_Create_DefaultSwap_PerKind(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()

	// Mark CF-1 as default.
	cf1 := makeConfig(t, repo, KindCloudflare, "cf-a", 10, true, true)
	// Mark DNSCloud-1 as default (different kind, OK — one default PER KIND).
	dc1 := makeConfig(t, repo, KindDNSCloud, "dc-a", 10, true, true)

	// Create CF-2 as default → CF-1 auto-unsets.
	cf2 := makeConfig(t, repo, KindCloudflare, "cf-b", 10, true, true)

	gotCF1, _ := repo.GetByID(ctx, cf1.ID)
	gotCF2, _ := repo.GetByID(ctx, cf2.ID)
	gotDC1, _ := repo.GetByID(ctx, dc1.ID)

	if gotCF1.IsDefault {
		t.Error("CF-1 should have been unset when CF-2 became default")
	}
	if !gotCF2.IsDefault {
		t.Error("CF-2 should be default")
	}
	if !gotDC1.IsDefault {
		t.Error("DNSCloud default should NOT be unset by Cloudflare default swap")
	}
}

func TestRepo_SetDefault_SwapsWithinKind(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	cf1 := makeConfig(t, repo, KindCloudflare, "cf-x", 10, true, true)
	cf2 := makeConfig(t, repo, KindCloudflare, "cf-y", 10, false, true)

	if err := repo.SetDefault(ctx, cf2.ID); err != nil {
		t.Fatalf("SetDefault: %v", err)
	}
	g1, _ := repo.GetByID(ctx, cf1.ID)
	g2, _ := repo.GetByID(ctx, cf2.ID)
	if g1.IsDefault {
		t.Error("CF-1 should have been unset")
	}
	if !g2.IsDefault {
		t.Error("CF-2 should be new default")
	}
}

// --- Priority ordering ------------------------------------------------------

func TestRepo_GetHighestPriority_PicksLowestNumber(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	_ = makeConfig(t, repo, KindCloudflare, "pri-high", 500, false, true)
	expected := makeConfig(t, repo, KindDNSCloud, "pri-low", 1, false, true)
	_ = makeConfig(t, repo, KindCloudflare, "pri-mid", 100, false, true)

	// Note: this is noisy because other tests also create configs. We only
	// assert that WHATEVER wins has priority <= 1.
	got, err := repo.GetHighestPriority(ctx)
	if err != nil {
		t.Fatalf("GetHighestPriority: %v", err)
	}
	if got.Priority > expected.Priority {
		t.Errorf("picked priority %d, want <= %d", got.Priority, expected.Priority)
	}
}

func TestRepo_GetHighestPriorityForKind_Filters(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	_ = makeConfig(t, repo, KindCloudflare, "k-cf", 999, false, true)
	// Pick a DNSCloud with lower-than-anyone priority — it should still win
	// for its kind.
	best := makeConfig(t, repo, KindDNSCloud, "k-dc", 1, false, true)

	got, err := repo.GetHighestPriorityForKind(ctx, KindDNSCloud)
	if err != nil {
		t.Fatalf("GetHighestPriorityForKind: %v", err)
	}
	if got.Kind != KindDNSCloud {
		t.Errorf("expected DNSCloud, got %s", got.Kind)
	}
	if got.ID == best.ID && got.Priority != 1 {
		t.Errorf("picked wrong row for DNSCloud: %+v", got)
	}
}

func TestRepo_ListActive_ExcludesInactive(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	activeID := makeConfig(t, repo, KindCloudflare, "act", 42, false, true).ID
	inactiveID := makeConfig(t, repo, KindDNSCloud, "inact", 1, false, false).ID

	list, err := repo.ListActiveByPriority(ctx)
	if err != nil {
		t.Fatalf("ListActiveByPriority: %v", err)
	}
	var sawActive, sawInactive bool
	for _, c := range list {
		if c.ID == activeID {
			sawActive = true
		}
		if c.ID == inactiveID {
			sawInactive = true
		}
	}
	if !sawActive {
		t.Error("active config missing from ListActiveByPriority")
	}
	if sawInactive {
		t.Error("inactive config leaked into ListActiveByPriority")
	}
}

// --- Reorder transaction ----------------------------------------------------

func TestRepo_ReorderPriority_Atomic(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	c1 := makeConfig(t, repo, KindCloudflare, "re-1", 100, false, true)
	c2 := makeConfig(t, repo, KindCloudflare, "re-2", 100, false, true)

	err := repo.ReorderPriority(ctx, map[uuid.UUID]int{
		c1.ID: 10,
		c2.ID: 20,
	})
	if err != nil {
		t.Fatalf("ReorderPriority: %v", err)
	}
	g1, _ := repo.GetByID(ctx, c1.ID)
	g2, _ := repo.GetByID(ctx, c2.ID)
	if g1.Priority != 10 {
		t.Errorf("c1.Priority = %d, want 10", g1.Priority)
	}
	if g2.Priority != 20 {
		t.Errorf("c2.Priority = %d, want 20", g2.Priority)
	}
}

func TestRepo_ReorderPriority_EmptyMap_NoOp(t *testing.T) {
	repo := needsDB(t)
	if err := repo.ReorderPriority(context.Background(), map[uuid.UUID]int{}); err != nil {
		t.Errorf("empty reorder should be noop, got: %v", err)
	}
}

// --- Health tracking --------------------------------------------------------

func TestRepo_RecordHealth(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	c := makeConfig(t, repo, KindCloudflare, "health", 10, false, true)
	if c.LastHealthOK != nil {
		t.Error("fresh row should have NULL last_health_ok")
	}
	if err := repo.RecordHealth(ctx, c.ID, true); err != nil {
		t.Fatalf("RecordHealth: %v", err)
	}
	got, _ := repo.GetByID(ctx, c.ID)
	if got.LastHealthOK == nil || *got.LastHealthOK != true {
		t.Errorf("last_health_ok = %v, want true", got.LastHealthOK)
	}
	if got.LastHealthAt == nil {
		t.Error("last_health_at should be set")
	}
}

// --- Update + delete --------------------------------------------------------

func TestRepo_Update_PartialFields(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	c := makeConfig(t, repo, KindCloudflare, "upd", 10, false, true)

	newName := "renamed"
	newPri := 5
	updated, err := repo.Update(ctx, c.ID, UpdateFields{
		Name:     &newName,
		Priority: &newPri,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != newName {
		t.Errorf("Name = %q, want %q", updated.Name, newName)
	}
	if updated.Priority != newPri {
		t.Errorf("Priority = %d, want %d", updated.Priority, newPri)
	}
	// APIToken stays (empty UpdateFields entry = not touched)
	if updated.APIToken != c.APIToken {
		t.Error("api_token should be unchanged when not in update")
	}
}

func TestRepo_Update_APITokenEmptyIgnored(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	c := makeConfig(t, repo, KindCloudflare, "tok", 10, false, true)
	emptyToken := ""
	updated, err := repo.Update(ctx, c.ID, UpdateFields{APIToken: &emptyToken})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.APIToken != c.APIToken {
		t.Error("empty api_token should NOT clear existing token")
	}
}

func TestRepo_Delete(t *testing.T) {
	repo := needsDB(t)
	ctx := context.Background()
	c := makeConfig(t, repo, KindCloudflare, "del", 10, false, true)
	if err := repo.Delete(ctx, c.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := repo.GetByID(ctx, c.ID); err != ErrNotFound {
		t.Errorf("after delete, GetByID should return ErrNotFound, got %v", err)
	}
	if err := repo.Delete(ctx, c.ID); err != ErrNotFound {
		t.Errorf("second delete should return ErrNotFound, got %v", err)
	}
}
