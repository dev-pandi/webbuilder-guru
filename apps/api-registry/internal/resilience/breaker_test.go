package resilience

import (
	"testing"
	"time"
)

func TestBreaker_ClosedByDefault(t *testing.T) {
	b := NewBreaker(BreakerConfig{})
	if b.State() != StateClosed {
		t.Errorf("expected Closed, got %s", b.State())
	}
	if !b.Allow() {
		t.Errorf("Closed should allow")
	}
}

func TestBreaker_OpensAfterThreshold(t *testing.T) {
	b := NewBreaker(BreakerConfig{FailureThreshold: 3, CooldownPeriod: time.Second})
	for i := 0; i < 3; i++ {
		b.RecordFailure()
	}
	if b.State() != StateOpen {
		t.Errorf("expected Open after 3 failures, got %s", b.State())
	}
	if b.Allow() {
		t.Errorf("Open should NOT allow")
	}
}

func TestBreaker_HalfOpenAfterCooldown(t *testing.T) {
	b := NewBreaker(BreakerConfig{FailureThreshold: 1, CooldownPeriod: 20 * time.Millisecond})
	b.RecordFailure()
	if b.State() != StateOpen {
		t.Fatal("should be Open")
	}
	time.Sleep(30 * time.Millisecond)
	// Allow() should transition Open → HalfOpen + return true (probe slot).
	if !b.Allow() {
		t.Errorf("HalfOpen probe should be allowed")
	}
	if b.State() != StateHalfOpen {
		t.Errorf("expected HalfOpen, got %s", b.State())
	}
	// Second call — probe budget habis, deny.
	if b.Allow() {
		t.Errorf("only 1 probe allowed in HalfOpen (default)")
	}
}

func TestBreaker_HalfOpenSuccessCloses(t *testing.T) {
	b := NewBreaker(BreakerConfig{FailureThreshold: 1, CooldownPeriod: 10 * time.Millisecond})
	b.RecordFailure()
	time.Sleep(20 * time.Millisecond)
	b.Allow() // transition to HalfOpen
	b.RecordSuccess()
	if b.State() != StateClosed {
		t.Errorf("success in HalfOpen should close, got %s", b.State())
	}
	if !b.Allow() {
		t.Errorf("Closed should allow post-recovery")
	}
}

func TestBreaker_HalfOpenFailureReopens(t *testing.T) {
	b := NewBreaker(BreakerConfig{FailureThreshold: 1, CooldownPeriod: 10 * time.Millisecond})
	b.RecordFailure()
	time.Sleep(20 * time.Millisecond)
	b.Allow() // HalfOpen
	b.RecordFailure()
	if b.State() != StateOpen {
		t.Errorf("fail in HalfOpen should reopen, got %s", b.State())
	}
}

func TestRegistry_LazyCreatesPerOp(t *testing.T) {
	r := NewRegistry(BreakerConfig{})
	a := r.Get("op-a")
	b := r.Get("op-b")
	a2 := r.Get("op-a")
	if a != a2 {
		t.Errorf("Get should return same breaker per op")
	}
	if a == b {
		t.Errorf("different ops should have different breakers")
	}
}
