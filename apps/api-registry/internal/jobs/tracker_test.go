package jobs

import (
	"context"
	"errors"
	"testing"
)

func TestTracker_Track_SuccessCase(t *testing.T) {
	s := NewMemoryStore(100)
	tr := NewTracker(s)
	ctx := context.Background()

	var seen *Job
	err := tr.Track(ctx, CreateInput{
		Kind:           KindRegister,
		Domain:         "foo.id",
		IdempotencyKey: "k1",
	}, func(ctx context.Context, job *Job) error {
		seen = job
		tr.SetUpstreamJobID(ctx, job.ID, "upstream-abc")
		tr.SetResult(ctx, job.ID, map[string]string{"result": "ok"})
		return nil
	})
	if err != nil {
		t.Fatalf("Track error: %v", err)
	}
	if seen == nil {
		t.Fatal("callback not invoked")
	}
	updated, _ := s.Get(ctx, seen.ID)
	if updated.Status != StatusSucceeded {
		t.Errorf("final status = %q, want succeeded", updated.Status)
	}
	if updated.UpstreamJobID != "upstream-abc" {
		t.Errorf("upstream_job_id = %q", updated.UpstreamJobID)
	}
	if len(updated.ResultBody) == 0 {
		t.Errorf("result body not set")
	}
}

func TestTracker_Track_FailurePropagatesError(t *testing.T) {
	s := NewMemoryStore(100)
	tr := NewTracker(s)
	ctx := context.Background()

	boom := errors.New("upstream boom")
	err := tr.Track(ctx, CreateInput{Kind: KindRegister, Domain: "bar.id"},
		func(ctx context.Context, job *Job) error {
			return boom
		},
	)
	if !errors.Is(err, boom) {
		t.Errorf("expected boom, got %v", err)
	}

	// Job status harus failed + error message ke-record.
	items, _, _ := s.List(ctx, ListFilter{Kind: KindRegister})
	if len(items) != 1 {
		t.Fatalf("expected 1 job, got %d", len(items))
	}
	if items[0].Status != StatusFailed {
		t.Errorf("status = %q, want failed", items[0].Status)
	}
	if items[0].ErrorMessage != "upstream boom" {
		t.Errorf("error message = %q", items[0].ErrorMessage)
	}
}

func TestTracker_Track_NilStoreIsNoop(t *testing.T) {
	var tr *Tracker // nil receiver
	called := false
	err := tr.Track(context.Background(), CreateInput{Kind: KindRegister}, func(ctx context.Context, job *Job) error {
		called = true
		if job != nil {
			t.Errorf("job should be nil, got %+v", job)
		}
		return nil
	})
	if err != nil || !called {
		t.Errorf("nil tracker seharusnya tetap execute fn (called=%v, err=%v)", called, err)
	}
}
