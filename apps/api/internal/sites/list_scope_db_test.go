package sites

// "Situs Saya" harus memuat situs milik sendiri saja. Situs klien yang cuma
// di-kolaborasikan muncul di halaman Kolaborator (/collaborations).

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestListSitesAccessibleTo_ScopeOwner(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL kosong")
	}
	repo := NewRepo(testPool)
	ctx := context.Background()

	agent := mkUser(t)
	klien := mkUser(t)

	// Situs milik agent sendiri.
	milikSendiri, err := repo.Create(ctx, agent, "own-"+uuid.NewString()[:8], "Situs Agent", nil, nil)
	if err != nil {
		t.Fatalf("buat situs agent: %v", err)
	}
	// Situs milik klien, agent jadi editor (persis alur beli domain on-behalf-of).
	milikKlien, err := repo.Create(ctx, klien, "cli-"+uuid.NewString()[:8], "Situs Klien", nil, nil)
	if err != nil {
		t.Fatalf("buat situs klien: %v", err)
	}
	if err := repo.AddMember(ctx, milikKlien.ID, agent, RoleEditor, &agent); err != nil {
		t.Fatalf("add member: %v", err)
	}

	owned, err := repo.ListSitesAccessibleTo(ctx, agent, RoleOwner)
	if err != nil {
		t.Fatalf("list owner: %v", err)
	}
	var ids []string
	for _, s := range owned {
		ids = append(ids, s.ID.String())
	}
	if len(owned) != 1 || owned[0].ID != milikSendiri.ID {
		t.Fatalf("Situs Saya = %v, mau hanya %s", ids, milikSendiri.ID)
	}

	// Situs klien tidak boleh hilang — harus tetap terjangkau sebagai kolaborasi.
	all, err := repo.ListSitesAccessibleTo(ctx, agent)
	if err != nil {
		t.Fatalf("list semua: %v", err)
	}
	found := false
	for _, s := range all {
		if s.ID == milikKlien.ID && s.Role == RoleEditor {
			found = true
		}
	}
	if !found {
		t.Fatalf("situs klien hilang dari scope kolaborasi (%d baris)", len(all))
	}
}
