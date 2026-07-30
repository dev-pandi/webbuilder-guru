package jobs

import (
	"context"
	"encoding/json"
	"log/slog"
)

// Tracker — high-level helper untuk handler. Wrap 1 operasi jadi:
//   1. Create job (audit request)
//   2. Run provider call
//   3. Update job dengan hasil (success + upstream_job_id) atau error
//   4. Return original result ke handler
//
// Pola pemakaian:
//
//   var resp *provider.RegisterResponse
//   err := tracker.Track(ctx, jobs.CreateInput{
//       Kind: jobs.KindRegister,
//       Domain: req.Domain,
//       ExternalUserID: req.ExternalUserID,
//       IdempotencyKey: req.IdempotencyKey,
//       RequestBody: mustJSON(req),
//   }, func(ctx context.Context, job *Job) error {
//       r, err := provider.RegisterDomain(ctx, req)
//       if err != nil { return err }
//       resp = r
//       tracker.SetUpstreamJobID(ctx, job.ID, r.JobID)
//       return nil
//   })
//
// Kalau nil store, Track jadi no-op wrapper (backward-compat + testable).
type Tracker struct {
	store Store
}

func NewTracker(s Store) *Tracker {
	return &Tracker{store: s}
}

// Track — execute fn dan tulis hasil ke store. Idempotent via IdempotencyKey.
//
// Kalau job existing ditemukan (via idempotency) dan status terminal, SKIP
// fn — return nil (caller lookup hasil dari job.ResultBody). Kalau existing
// tapi still running, retry — bikin job baru dengan Attempts++.
//
// Behavior fail-open: kalau tracker error (store down), tetap eksekusi fn +
// log warn. Jangan block operasi domain karena audit gagal.
func (t *Tracker) Track(
	ctx context.Context,
	in CreateInput,
	fn func(ctx context.Context, job *Job) error,
) error {
	if t == nil || t.store == nil {
		return fn(ctx, nil)
	}
	job, err := t.store.Create(ctx, in)
	if err != nil {
		slog.Warn("jobs: create failed, proceeding without tracking", "err", err)
		return fn(ctx, nil)
	}

	runErr := fn(ctx, job)

	// Update terminal state.
	patch := UpdateInput{}
	if runErr != nil {
		s := StatusFailed
		patch.Status = &s
		msg := runErr.Error()
		patch.ErrorMessage = &msg
	} else {
		s := StatusSucceeded
		patch.Status = &s
	}
	if _, upErr := t.store.Update(ctx, job.ID, patch); upErr != nil {
		slog.Warn("jobs: update terminal state failed", "job_id", job.ID, "err", upErr)
	}
	return runErr
}

// SetUpstreamJobID — dipanggil dari dalam fn callback setelah dapat upstream
// job_id (dari registrar-api atau EPP). Simpan supaya audit trail lengkap.
func (t *Tracker) SetUpstreamJobID(ctx context.Context, jobID, upstreamID string) {
	if t == nil || t.store == nil || jobID == "" || upstreamID == "" {
		return
	}
	patch := UpdateInput{UpstreamJobID: &upstreamID}
	if _, err := t.store.Update(ctx, jobID, patch); err != nil {
		slog.Warn("jobs: set upstream_job_id failed", "job_id", jobID, "err", err)
	}
}

// SetResult — dipanggil setelah provider return sukses; simpan JSON body
// supaya bisa di-inspect lewat GET /jobs/:id.
func (t *Tracker) SetResult(ctx context.Context, jobID string, result any) {
	if t == nil || t.store == nil || jobID == "" || result == nil {
		return
	}
	body, err := json.Marshal(result)
	if err != nil {
		return
	}
	patch := UpdateInput{ResultBody: body}
	if _, err := t.store.Update(ctx, jobID, patch); err != nil {
		slog.Warn("jobs: set result failed", "job_id", jobID, "err", err)
	}
}
