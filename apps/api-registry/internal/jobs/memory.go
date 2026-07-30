package jobs

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"
)

// ErrNotFound sentinel — konsumer bisa errors.Is untuk map ke 404.
var ErrNotFound = errors.New("jobs: not found")

// MemoryStore — in-memory job registry. Aman untuk MVP (wrapper mode) di
// mana tracking cuma untuk audit — kehilangan data saat restart acceptable.
// Fase 2 swap dengan Postgres/Redis kalau butuh persistence.
//
// Concurrency: sync.RWMutex protect map. Idempotency index terpisah untuk
// O(1) lookup by (kind + key) tanpa scan.
type MemoryStore struct {
	mu       sync.RWMutex
	jobs     map[string]*Job // id → job
	idemIdx  map[string]string // "kind:key" → id
	maxKeep  int // capacity — evict oldest LRU-style
}

// NewMemoryStore — construct dengan capacity limit. Default 10000 jobs
// (evict oldest kalau overflow). Set 0 = unbounded (hati-hati OOM).
func NewMemoryStore(capacity int) *MemoryStore {
	if capacity <= 0 {
		capacity = 10000
	}
	return &MemoryStore{
		jobs:    make(map[string]*Job, capacity),
		idemIdx: make(map[string]string),
		maxKeep: capacity,
	}
}

// Create — insert job baru. Kalau IdempotencyKey provided + sudah ada,
// return existing (idempotent behavior).
func (s *MemoryStore) Create(ctx context.Context, in CreateInput) (*Job, error) {
	// Cek idempotency dulu (di luar lock write supaya cepat kalau hit).
	if in.IdempotencyKey != "" {
		if existing, _ := s.FindByIdempotencyKey(ctx, in.Kind, in.IdempotencyKey); existing != nil {
			return existing, nil
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	job := &Job{
		ID:             NewID(),
		Kind:           in.Kind,
		Status:         StatusRunning, // wrapper mode: langsung running
		Domain:         in.Domain,
		ExternalUserID: in.ExternalUserID,
		IdempotencyKey: in.IdempotencyKey,
		RequestBody:    cloneBytes(in.RequestBody),
		Attempts:       1,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	s.jobs[job.ID] = job
	if in.IdempotencyKey != "" {
		s.idemIdx[idemKey(in.Kind, in.IdempotencyKey)] = job.ID
	}

	// Evict kalau overflow — buang yang paling lama.
	if len(s.jobs) > s.maxKeep {
		s.evictOldest(len(s.jobs) - s.maxKeep)
	}
	return copyJob(job), nil
}

func (s *MemoryStore) Get(ctx context.Context, id string) (*Job, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	job, ok := s.jobs[id]
	if !ok {
		return nil, ErrNotFound
	}
	return copyJob(job), nil
}

func (s *MemoryStore) Update(ctx context.Context, id string, patch UpdateInput) (*Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	job, ok := s.jobs[id]
	if !ok {
		return nil, ErrNotFound
	}
	now := time.Now().UTC()
	if patch.Status != nil {
		job.Status = *patch.Status
		// Terminal state → set CompletedAt + DurationMs.
		if isTerminal(*patch.Status) && job.CompletedAt == nil {
			job.CompletedAt = &now
			job.DurationMs = now.Sub(job.CreatedAt).Milliseconds()
		}
	}
	if patch.UpstreamJobID != nil {
		job.UpstreamJobID = *patch.UpstreamJobID
	}
	if len(patch.ResultBody) > 0 {
		job.ResultBody = cloneBytes(patch.ResultBody)
	}
	if patch.ErrorMessage != nil {
		job.ErrorMessage = *patch.ErrorMessage
	}
	if patch.ErrorCode != nil {
		job.ErrorCode = *patch.ErrorCode
	}
	if patch.Attempts != nil {
		job.Attempts = *patch.Attempts
	}
	job.UpdatedAt = now
	return copyJob(job), nil
}

func (s *MemoryStore) List(ctx context.Context, f ListFilter) ([]Job, int, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Filter + collect ke slice.
	out := make([]Job, 0, len(s.jobs))
	for _, j := range s.jobs {
		if f.Kind != "" && j.Kind != f.Kind {
			continue
		}
		if f.Status != "" && j.Status != f.Status {
			continue
		}
		if f.Domain != "" && j.Domain != f.Domain {
			continue
		}
		if f.ExternalUserID != "" && j.ExternalUserID != f.ExternalUserID {
			continue
		}
		out = append(out, *copyJob(j))
	}
	total := len(out)

	// Sort DESC by CreatedAt (newest first).
	sort.Slice(out, func(i, k int) bool { return out[i].CreatedAt.After(out[k].CreatedAt) })

	// Paginate.
	start := f.Offset
	if start > total {
		start = total
	}
	end := start + f.Limit
	if end > total {
		end = total
	}
	return out[start:end], total, nil
}

func (s *MemoryStore) FindByIdempotencyKey(ctx context.Context, kind Kind, key string) (*Job, error) {
	if key == "" {
		return nil, nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	id, ok := s.idemIdx[idemKey(kind, key)]
	if !ok {
		return nil, nil
	}
	job, ok := s.jobs[id]
	if !ok {
		return nil, nil
	}
	return copyJob(job), nil
}

// evictOldest — hapus n job terlama (dipanggil dari lock-held caller).
func (s *MemoryStore) evictOldest(n int) {
	if n <= 0 {
		return
	}
	type kv struct {
		id string
		ts time.Time
	}
	arr := make([]kv, 0, len(s.jobs))
	for id, j := range s.jobs {
		arr = append(arr, kv{id, j.CreatedAt})
	}
	sort.Slice(arr, func(i, k int) bool { return arr[i].ts.Before(arr[k].ts) })
	for i := 0; i < n && i < len(arr); i++ {
		if job, ok := s.jobs[arr[i].id]; ok && job.IdempotencyKey != "" {
			delete(s.idemIdx, idemKey(job.Kind, job.IdempotencyKey))
		}
		delete(s.jobs, arr[i].id)
	}
}

func idemKey(kind Kind, key string) string { return string(kind) + ":" + key }

func isTerminal(s Status) bool {
	return s == StatusSucceeded || s == StatusFailed || s == StatusCanceled
}

func cloneBytes(b []byte) []byte {
	if len(b) == 0 {
		return nil
	}
	dup := make([]byte, len(b))
	copy(dup, b)
	return dup
}

// copyJob — return deep-ish copy supaya caller tidak bisa mutate store state.
func copyJob(j *Job) *Job {
	if j == nil {
		return nil
	}
	dup := *j
	dup.RequestBody = cloneBytes(j.RequestBody)
	dup.ResultBody = cloneBytes(j.ResultBody)
	if j.CompletedAt != nil {
		t := *j.CompletedAt
		dup.CompletedAt = &t
	}
	return &dup
}

// Compile-time guard.
var _ Store = (*MemoryStore)(nil)
