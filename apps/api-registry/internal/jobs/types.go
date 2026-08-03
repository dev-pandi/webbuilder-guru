// Package jobs — local job tracking untuk audit + observability. Simpan
// setiap request domain lifecycle yang api-registry terima dari web builder,
// termasuk hasil call ke provider (upstream job_id, status, error).
//
// Mode wrapper (pandi_wrapper): provider = registrar-api PANDI yang own job
// state sebenarnya. Local job di sini fungsinya AUDIT + REPLAY / debug (siapa
// panggil apa, kapan, hasilnya gimana). Web builder tetap poll status ke
// upstream via GET /v1/domains/register/:job_id/status.
//
// Mode direct (epp_direct): api-registry own job state penuh. In-memory
// store cocok untuk single-instance MVP; production multi-node butuh swap
// ke Redis/Postgres + Asynq worker untuk async EPP call (Fase 2a).
//
// Interface Store dibikin abstract supaya swap implementation zero-touch.
package jobs

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Kind — jenis operasi. Enum-like string supaya JSON-friendly + debuggable.
type Kind string

const (
	KindRegister       Kind = "register"
	KindRenew          Kind = "renew"
	KindTransfer       Kind = "transfer"
	KindContactUpdate  Kind = "contact_update"
	KindNSUpdate       Kind = "nameserver_update"
	KindRetryRegister  Kind = "retry_register"
	KindCancelRegister Kind = "cancel_register"
)

// Status — state machine. Transisi:
//
//   queued → running → succeeded | failed | canceled
//
// `queued` cuma dipakai kalau ada async worker (Fase 2). Wrapper mode
// langsung `running` → `succeeded`/`failed` dalam 1 request.
type Status string

const (
	StatusQueued    Status = "queued"
	StatusRunning   Status = "running"
	StatusSucceeded Status = "succeeded"
	StatusFailed    Status = "failed"
	StatusCanceled  Status = "canceled"
)

// Job — 1 record audit. Snapshot request + hasil upstream. RequestBody /
// ResultBody sengaja `json.RawMessage`-style ([]byte) supaya flexible per
// operasi tanpa breaking store interface.
type Job struct {
	ID              string     `json:"id"`
	Kind            Kind       `json:"kind"`
	Status          Status     `json:"status"`
	Domain          string     `json:"domain,omitempty"`
	ExternalUserID  string     `json:"external_user_id,omitempty"`
	UpstreamJobID   string     `json:"upstream_job_id,omitempty"` // job_id dari provider (registrar-api / EPP)
	IdempotencyKey  string     `json:"idempotency_key,omitempty"`
	RequestBody     []byte     `json:"request_body,omitempty"`     // JSON — audit trail
	ResultBody      []byte     `json:"result_body,omitempty"`      // JSON — provider response
	ErrorMessage    string     `json:"error_message,omitempty"`    // kalau failed
	ErrorCode       string     `json:"error_code,omitempty"`
	Attempts        int        `json:"attempts"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
	DurationMs      int64      `json:"duration_ms,omitempty"`     // completed_at - created_at
}

// CreateInput — payload buat bikin job baru. ID auto-generate kalau kosong.
type CreateInput struct {
	Kind           Kind
	Domain         string
	ExternalUserID string
	IdempotencyKey string
	RequestBody    []byte
}

// UpdateInput — patch state pasca upstream call. Cuma field non-nil yang
// di-update supaya partial update aman.
type UpdateInput struct {
	Status        *Status
	UpstreamJobID *string
	ResultBody    []byte
	ErrorMessage  *string
	ErrorCode     *string
	Attempts      *int
}

// ListFilter — query param untuk browse jobs.
type ListFilter struct {
	Kind           Kind
	Status         Status
	Domain         string
	ExternalUserID string
	Limit          int // default 50, max 200
	Offset         int
}

// Store — abstraction storage. In-memory (MVP) atau Postgres/Redis (Fase 2).
type Store interface {
	Create(ctx context.Context, in CreateInput) (*Job, error)
	Get(ctx context.Context, id string) (*Job, error)
	Update(ctx context.Context, id string, patch UpdateInput) (*Job, error)
	List(ctx context.Context, f ListFilter) ([]Job, int, error) // items, total
	// Idempotency: kalau IdempotencyKey sudah pernah dipakai untuk kind sama,
	// return job existing (bukan create dobel). Nil = no existing.
	FindByIdempotencyKey(ctx context.Context, kind Kind, key string) (*Job, error)
}

// NewID — helper generate UUID untuk job ID. Exposed supaya caller test
// bisa fake generator.
func NewID() string {
	return "job_" + uuid.NewString()
}
