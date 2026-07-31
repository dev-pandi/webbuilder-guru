// Package resilience — circuit breaker + retry decorator untuk Provider.
// Cegah upstream cascading failure — kalau registrar-api/EPP down, kita
// fast-fail sementara instead of pump traffic + hang consumer.
//
// State machine:
//
//   ┌────────┐  N failures in window   ┌──────┐
//   │ Closed │ ──────────────────────► │ Open │
//   │ (pass) │                          │(fail)│
//   └────────┘                          └──┬───┘
//        ▲                                 │ cooldown expired
//        │ ok in half-open trial           ▼
//        │                          ┌───────────┐
//        └───────── success ─────── │ HalfOpen  │ ─── fail ──► Open (reset cooldown)
//                                   │ (1 probe) │
//                                   └───────────┘
//
// Skope circuit: per-provider-operation. Kalau `register_domain` gagal 5×
// tapi `check_domain` OK, cuma register yang open — check tetap jalan.
package resilience

import (
	"errors"
	"sync"
	"sync/atomic"
	"time"
)

// State — circuit state enum.
type State int32

const (
	StateClosed State = iota
	StateOpen
	StateHalfOpen
)

func (s State) String() string {
	switch s {
	case StateClosed:
		return "closed"
	case StateOpen:
		return "open"
	case StateHalfOpen:
		return "half_open"
	}
	return "unknown"
}

// ErrCircuitOpen — return dari Do() kalau circuit lagi open (fast-fail
// tanpa call upstream). Consumer bisa errors.Is untuk map ke 503.
var ErrCircuitOpen = errors.New("resilience: circuit breaker open — upstream unavailable")

// BreakerConfig — per-operation config. Semua opsional dengan default sensible.
type BreakerConfig struct {
	// FailureThreshold — jumlah consecutive failure sebelum open. Default 5.
	FailureThreshold int
	// CooldownPeriod — durasi open state sebelum coba half-open probe.
	// Default 30s.
	CooldownPeriod time.Duration
	// HalfOpenMaxProbes — jumlah probe request yang di-allow di half-open
	// state. Default 1 (single probe → open|closed).
	HalfOpenMaxProbes int
}

// Breaker — 1 circuit per operation.
type Breaker struct {
	cfg BreakerConfig

	state        atomic.Int32 // State
	failures     atomic.Int32
	openedAt     atomic.Int64 // Unix nano; 0 = tidak open
	halfOpenLeft atomic.Int32 // probe budget di half-open
}

func NewBreaker(cfg BreakerConfig) *Breaker {
	if cfg.FailureThreshold <= 0 {
		cfg.FailureThreshold = 5
	}
	if cfg.CooldownPeriod <= 0 {
		cfg.CooldownPeriod = 30 * time.Second
	}
	if cfg.HalfOpenMaxProbes <= 0 {
		cfg.HalfOpenMaxProbes = 1
	}
	return &Breaker{cfg: cfg}
}

// State — current state (safe untuk read tanpa lock).
func (b *Breaker) State() State {
	return State(b.state.Load())
}

// Allow — check apakah request boleh proceed. Update state transitions
// (Open → HalfOpen kalau cooldown expired) di sini supaya lazy.
func (b *Breaker) Allow() bool {
	switch b.State() {
	case StateClosed:
		return true
	case StateOpen:
		// Cek cooldown expired.
		openedAt := b.openedAt.Load()
		if openedAt == 0 {
			return true // safety fallback
		}
		if time.Since(time.Unix(0, openedAt)) >= b.cfg.CooldownPeriod {
			// Transition Open → HalfOpen dengan CAS supaya cuma 1 goroutine
			// yang trigger transition (avoid race).
			if b.state.CompareAndSwap(int32(StateOpen), int32(StateHalfOpen)) {
				b.halfOpenLeft.Store(int32(b.cfg.HalfOpenMaxProbes))
			}
			return b.tryProbeSlot()
		}
		return false
	case StateHalfOpen:
		return b.tryProbeSlot()
	}
	return true
}

func (b *Breaker) tryProbeSlot() bool {
	// Decrement halfOpenLeft. Kalau > 0, kita dapat slot.
	for {
		cur := b.halfOpenLeft.Load()
		if cur <= 0 {
			return false
		}
		if b.halfOpenLeft.CompareAndSwap(cur, cur-1) {
			return true
		}
	}
}

// RecordSuccess — dipanggil pasca operation sukses.
func (b *Breaker) RecordSuccess() {
	switch b.State() {
	case StateHalfOpen:
		// Sukses di half-open → tutup circuit.
		b.reset()
	case StateClosed:
		// Reset counter kalau streak fail sebelum sukses.
		b.failures.Store(0)
	}
}

// RecordFailure — dipanggil pasca operation gagal (dengan error yang
// termasuk kategori transient — decision di caller wrapper).
func (b *Breaker) RecordFailure() {
	switch b.State() {
	case StateClosed:
		n := b.failures.Add(1)
		if n >= int32(b.cfg.FailureThreshold) {
			// Trip circuit.
			if b.state.CompareAndSwap(int32(StateClosed), int32(StateOpen)) {
				b.openedAt.Store(time.Now().UnixNano())
			}
		}
	case StateHalfOpen:
		// Fail di half-open → re-open + reset cooldown.
		b.state.Store(int32(StateOpen))
		b.openedAt.Store(time.Now().UnixNano())
	}
}

// reset — set state ke Closed + zero counters.
func (b *Breaker) reset() {
	b.state.Store(int32(StateClosed))
	b.failures.Store(0)
	b.openedAt.Store(0)
}

// Registry — factory untuk breaker per operation. Lazy-create supaya cuma
// bikin breaker untuk operation yang di-panggil.
type Registry struct {
	mu       sync.RWMutex
	cfg      BreakerConfig
	breakers map[string]*Breaker
}

func NewRegistry(cfg BreakerConfig) *Registry {
	return &Registry{
		cfg:      cfg,
		breakers: make(map[string]*Breaker),
	}
}

// Get — lazy create breaker untuk operation.
func (r *Registry) Get(op string) *Breaker {
	r.mu.RLock()
	b, ok := r.breakers[op]
	r.mu.RUnlock()
	if ok {
		return b
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if b, ok := r.breakers[op]; ok {
		return b
	}
	b = NewBreaker(r.cfg)
	r.breakers[op] = b
	return b
}
