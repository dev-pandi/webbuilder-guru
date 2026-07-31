package jobs

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestMemoryStore_CreateGet(t *testing.T) {
	s := NewMemoryStore(100)
	ctx := context.Background()

	job, err := s.Create(ctx, CreateInput{
		Kind:           KindRegister,
		Domain:         "myshop.id",
		ExternalUserID: "user-1",
		IdempotencyKey: "key-a",
		RequestBody:    []byte(`{"foo":"bar"}`),
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if job.ID == "" || !strings.HasPrefix(job.ID, "job_") {
		t.Errorf("expected job ID prefix job_, got %q", job.ID)
	}
	if job.Status != StatusRunning {
		t.Errorf("initial status = %q, want %q", job.Status, StatusRunning)
	}
	if job.Attempts != 1 {
		t.Errorf("attempts = %d, want 1", job.Attempts)
	}

	got, err := s.Get(ctx, job.ID)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if got.Domain != "myshop.id" || got.ExternalUserID != "user-1" {
		t.Errorf("Get mismatch: %+v", got)
	}
	// Deep copy — mutation caller tidak affect store.
	got.Domain = "mutated.id"
	got2, _ := s.Get(ctx, job.ID)
	if got2.Domain != "myshop.id" {
		t.Errorf("store leaked mutation: got %q", got2.Domain)
	}
}

func TestMemoryStore_IdempotencyReturnsExisting(t *testing.T) {
	s := NewMemoryStore(100)
	ctx := context.Background()

	first, _ := s.Create(ctx, CreateInput{
		Kind:           KindRegister,
		Domain:         "myshop.id",
		IdempotencyKey: "same-key",
	})

	second, err := s.Create(ctx, CreateInput{
		Kind:           KindRegister,
		Domain:         "myshop.id",
		IdempotencyKey: "same-key",
	})
	if err != nil {
		t.Fatalf("Create 2nd failed: %v", err)
	}
	if first.ID != second.ID {
		t.Errorf("idempotency broken: first=%s second=%s", first.ID, second.ID)
	}

	// Different kind + same key = new job (kind namespaced).
	third, _ := s.Create(ctx, CreateInput{
		Kind:           KindRenew,
		Domain:         "myshop.id",
		IdempotencyKey: "same-key",
	})
	if third.ID == first.ID {
		t.Errorf("expected new job untuk kind lain, dapat same ID %s", third.ID)
	}
}

func TestMemoryStore_UpdateTerminalSetsCompletedAt(t *testing.T) {
	s := NewMemoryStore(100)
	ctx := context.Background()

	job, _ := s.Create(ctx, CreateInput{Kind: KindRegister, Domain: "x.id"})
	if job.CompletedAt != nil {
		t.Fatal("CompletedAt should be nil for running")
	}

	terminal := StatusSucceeded
	upstreamID := "upstream-123"
	updated, err := s.Update(ctx, job.ID, UpdateInput{
		Status:        &terminal,
		UpstreamJobID: &upstreamID,
	})
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	if updated.Status != StatusSucceeded {
		t.Errorf("status = %q, want %q", updated.Status, StatusSucceeded)
	}
	if updated.UpstreamJobID != upstreamID {
		t.Errorf("upstream_job_id = %q, want %q", updated.UpstreamJobID, upstreamID)
	}
	if updated.CompletedAt == nil {
		t.Errorf("CompletedAt should be set on terminal")
	}
}

func TestMemoryStore_GetNotFound(t *testing.T) {
	s := NewMemoryStore(100)
	_, err := s.Get(context.Background(), "does-not-exist")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestMemoryStore_ListFilterAndPaginate(t *testing.T) {
	s := NewMemoryStore(100)
	ctx := context.Background()

	// Seed 5 jobs, mixed kind.
	for i := 0; i < 3; i++ {
		s.Create(ctx, CreateInput{Kind: KindRegister, Domain: "a.id"})
		time.Sleep(time.Millisecond)
	}
	for i := 0; i < 2; i++ {
		s.Create(ctx, CreateInput{Kind: KindRenew, Domain: "b.id"})
		time.Sleep(time.Millisecond)
	}

	// Filter by kind.
	items, total, err := s.List(ctx, ListFilter{Kind: KindRegister})
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 {
		t.Errorf("total register = %d, want 3", total)
	}
	if len(items) != 3 {
		t.Errorf("len items = %d, want 3", len(items))
	}

	// Filter by domain.
	items, total, _ = s.List(ctx, ListFilter{Domain: "b.id"})
	if total != 2 {
		t.Errorf("total b.id = %d, want 2", total)
	}

	// Paginate: limit 2, offset 1.
	items, total, _ = s.List(ctx, ListFilter{Limit: 2, Offset: 1})
	if total != 5 {
		t.Errorf("total all = %d, want 5", total)
	}
	if len(items) != 2 {
		t.Errorf("paginated len = %d, want 2", len(items))
	}
}

func TestMemoryStore_EvictOldestOnOverflow(t *testing.T) {
	s := NewMemoryStore(3)
	ctx := context.Background()

	var firstID string
	for i := 0; i < 5; i++ {
		j, _ := s.Create(ctx, CreateInput{Kind: KindRegister, Domain: "x.id"})
		if i == 0 {
			firstID = j.ID
		}
		time.Sleep(time.Millisecond)
	}
	// Store hanya keep 3 terakhir; first + second should be evicted.
	if _, err := s.Get(ctx, firstID); !errors.Is(err, ErrNotFound) {
		t.Errorf("first job should be evicted, err=%v", err)
	}
	_, total, _ := s.List(ctx, ListFilter{})
	if total != 3 {
		t.Errorf("total after eviction = %d, want 3", total)
	}
}
