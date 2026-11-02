package sites

// Integration test batas jumlah situs. Butuh TEST_DATABASE_URL; kalau kosong SKIP.

import (
	"context"
	"errors"
	"fmt"
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

func mkUser(t *testing.T) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	email := "sitelimit-" + uuid.NewString()[:8] + "@test.local"
	if err := testPool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, name) VALUES ($1,'x','T') RETURNING id`, email,
	).Scan(&id); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

// Situs dari pembelian domain tidak boleh tertolak limit — tiap situs di sana
// sudah dibayar lewat domainnya sendiri.
func TestCreate_TidakDibatasiLimit(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL kosong")
	}
	repo := NewRepo(testPool)
	ctx := context.Background()
	uid := mkUser(t)

	// Lewati batas dengan jelas: MaxSitesPerUser + 3.
	for i := 0; i < MaxSitesPerUser+3; i++ {
		slug := fmt.Sprintf("sl-%s-%d", uuid.NewString()[:8], i)
		if _, err := repo.Create(ctx, uid, slug, "Situs", nil, nil); err != nil {
			t.Fatalf("situs ke-%d gagal dibuat: %v", i+1, err)
		}
	}

	n, err := repo.CountByUser(ctx, uid)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != MaxSitesPerUser+3 {
		t.Errorf("jumlah situs = %d, mau %d", n, MaxSitesPerUser+3)
	}
}

// Jalur tanpa domain (POST /sites) tetap dibatasi.
func TestEnforceSiteLimit(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL kosong")
	}
	repo := NewRepo(testPool)
	ctx := context.Background()
	uid := mkUser(t)

	if err := repo.EnforceSiteLimit(ctx, uid); err != nil {
		t.Fatalf("user tanpa situs harus lolos, dapat: %v", err)
	}

	for i := 0; i < MaxSitesPerUser; i++ {
		slug := fmt.Sprintf("en-%s-%d", uuid.NewString()[:8], i)
		if _, err := repo.Create(ctx, uid, slug, "Situs", nil, nil); err != nil {
			t.Fatalf("seed situs ke-%d: %v", i+1, err)
		}
	}

	if err := repo.EnforceSiteLimit(ctx, uid); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("mau ErrLimitReached di situs ke-%d, dapat: %v", MaxSitesPerUser+1, err)
	}
}
