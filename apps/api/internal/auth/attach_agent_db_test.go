package auth

// Integration test AttachAgent. Butuh TEST_DATABASE_URL; kalau kosong SKIP.

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/webbuilder/api/internal/db"
)

var attachPool *pgxpool.Pool

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
	attachPool = pool
	os.Exit(m.Run())
}

// mkUser bikin user dengan role tertentu langsung lewat SQL — CreateUser
// selalu memakai default 'client'.
func mkUser(t *testing.T, role string, parent *uuid.UUID) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	email := "t-" + uuid.NewString()[:8] + "@test.local"
	err := attachPool.QueryRow(context.Background(),
		`INSERT INTO users (email, password_hash, name, role, parent_reseller_id)
		 VALUES ($1, 'x', 'T', $2, $3) RETURNING id`,
		email, role, parent,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert user(%s): %v", role, err)
	}
	t.Cleanup(func() {
		_, _ = attachPool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

func roleAndParent(t *testing.T, id uuid.UUID) (string, *uuid.UUID) {
	t.Helper()
	var role string
	var parent *uuid.UUID
	if err := attachPool.QueryRow(context.Background(),
		`SELECT role, parent_reseller_id FROM users WHERE id = $1`, id,
	).Scan(&role, &parent); err != nil {
		t.Fatalf("read user: %v", err)
	}
	return role, parent
}

func TestAttachAgent(t *testing.T) {
	if attachPool == nil {
		t.Skip("TEST_DATABASE_URL kosong")
	}
	repo := NewRepo(attachPool)
	ctx := context.Background()

	t.Run("client jadi agent", func(t *testing.T) {
		reseller := mkUser(t, RoleReseller, nil)
		client := mkUser(t, RoleClient, nil)

		if err := repo.AttachAgent(ctx, client, reseller); err != nil {
			t.Fatalf("mau sukses, dapat: %v", err)
		}
		role, parent := roleAndParent(t, client)
		if role != RoleAgent {
			t.Errorf("role = %q, mau agent", role)
		}
		if parent == nil || *parent != reseller {
			t.Errorf("parent = %v, mau %v", parent, reseller)
		}
	})

	t.Run("agent yatim (reseller lamanya dihapus) bisa diambil", func(t *testing.T) {
		reseller := mkUser(t, RoleReseller, nil)
		orphan := mkUser(t, RoleAgent, nil)

		if err := repo.AttachAgent(ctx, orphan, reseller); err != nil {
			t.Fatalf("mau sukses, dapat: %v", err)
		}
		if _, parent := roleAndParent(t, orphan); parent == nil || *parent != reseller {
			t.Errorf("parent = %v, mau %v", parent, reseller)
		}
	})

	t.Run("agent milik reseller lain ditolak", func(t *testing.T) {
		r1 := mkUser(t, RoleReseller, nil)
		r2 := mkUser(t, RoleReseller, nil)
		agent := mkUser(t, RoleAgent, &r1)

		err := repo.AttachAgent(ctx, agent, r2)
		if !errors.Is(err, ErrAgentAttachBlocked) {
			t.Fatalf("mau ErrAgentAttachBlocked, dapat: %v", err)
		}
		// Yang penting: kepemilikan lama TIDAK berubah.
		if _, parent := roleAndParent(t, agent); parent == nil || *parent != r1 {
			t.Errorf("parent berubah jadi %v, harusnya tetap %v", parent, r1)
		}
	})

	t.Run("reseller tidak bisa dijadikan agent", func(t *testing.T) {
		r1 := mkUser(t, RoleReseller, nil)
		other := mkUser(t, RoleReseller, nil)

		if err := repo.AttachAgent(ctx, other, r1); !errors.Is(err, ErrAgentAttachBlocked) {
			t.Fatalf("mau ErrAgentAttachBlocked, dapat: %v", err)
		}
		if role, _ := roleAndParent(t, other); role != RoleReseller {
			t.Errorf("role berubah jadi %q", role)
		}
	})

	t.Run("admin tidak bisa dijadikan agent", func(t *testing.T) {
		r1 := mkUser(t, RoleReseller, nil)
		adm := mkUser(t, RoleAdmin, nil)

		if err := repo.AttachAgent(ctx, adm, r1); !errors.Is(err, ErrAgentAttachBlocked) {
			t.Fatalf("mau ErrAgentAttachBlocked, dapat: %v", err)
		}
		if role, _ := roleAndParent(t, adm); role != RoleAdmin {
			t.Errorf("role admin berubah jadi %q", role)
		}
	})
}
