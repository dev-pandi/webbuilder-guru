// Package domains — HTTP handler untuk domain lifecycle. Handler cuma
// parse request + call provider + envelope response. Semua business logic
// (pricing, invoice, wallet) TIDAK di sini — itu di web builder.
package domains

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/httpx"
	"github.com/webbuilder/api-registry/internal/jobs"
	"github.com/webbuilder/api-registry/internal/provider"
)

type Handler struct {
	provider provider.Provider
	tracker  *jobs.Tracker // nil-safe (Track jadi no-op wrapper)
}

func NewHandler(p provider.Provider, t *jobs.Tracker) *Handler {
	return &Handler{provider: p, tracker: t}
}

// mustJSON — marshal untuk audit trail. Kalau gagal, kembalikan nil supaya
// tracker tetap tulis record tanpa body (partial audit better than none).
func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return b
}

// mapErr — helper: konversi sentinel error → HTTP response.
func mapErr(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, provider.ErrNotFound):
		return httpx.NotFound(c, err.Error())
	case errors.Is(err, provider.ErrConflict):
		return httpx.Conflict(c, err.Error())
	case errors.Is(err, provider.ErrValidation):
		return httpx.BadRequest(c, err.Error())
	case errors.Is(err, provider.ErrRateLimit):
		return httpx.Err(c, fiber.StatusTooManyRequests, "rate_limited", err.Error())
	case errors.Is(err, provider.ErrCapabilityMissing):
		return httpx.ServiceUnavailable(c, "capability_missing", err.Error())
	case errors.Is(err, provider.ErrUnauthorized):
		return httpx.BadGateway(c, "provider auth failed: "+err.Error())
	default:
		return httpx.BadGateway(c, err.Error())
	}
}

// Check — POST /v1/domains/check
// Body: { domain: "myshop" | "myshop.co.id", external_user_id?: "uuid" }
func (h *Handler) Check(c *fiber.Ctx) error {
	var req provider.CheckRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Domain == "" {
		return httpx.BadRequest(c, "domain wajib")
	}
	res, err := h.provider.CheckDomain(c.Context(), req)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

// BulkCheck — POST /v1/domains/bulk-check
// Body: { domains: [...], external_user_id?: string }
func (h *Handler) BulkCheck(c *fiber.Ctx) error {
	var req provider.BulkCheckRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if len(req.Domains) == 0 {
		return httpx.BadRequest(c, "domains wajib (array non-empty)")
	}
	res, err := h.provider.BulkCheckDomains(c.Context(), req)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

// List — GET /v1/domains?external_user_id=&page=&per_page=
func (h *Handler) List(c *fiber.Ctx) error {
	page := c.QueryInt("page", 0)
	perPage := c.QueryInt("per_page", 0)
	f := provider.ListDomainsFilter{
		ExternalUserID: c.Query("external_user_id"),
		Page:           page,
		PerPage:        perPage,
	}
	res, err := h.provider.ListDomains(c.Context(), f)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

// Register — POST /v1/domains/register
// Body: RegisterRequest (contact + years + external_user_id + idempotency_key + ...)
// Tracked di jobs store — audit trail + idempotency dedup.
func (h *Handler) Register(c *fiber.Ctx) error {
	var req provider.RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Domain == "" {
		return httpx.BadRequest(c, "domain wajib")
	}
	if req.Years < 1 {
		return httpx.BadRequest(c, "years wajib >= 1")
	}
	if req.ExternalUserID == "" {
		return httpx.BadRequest(c, "external_user_id wajib")
	}
	if req.IdempotencyKey == "" {
		return httpx.BadRequest(c, "idempotency_key wajib (cegah double register)")
	}

	var res *provider.RegisterResponse
	err := h.tracker.Track(c.Context(), jobs.CreateInput{
		Kind:           jobs.KindRegister,
		Domain:         req.Domain,
		ExternalUserID: req.ExternalUserID,
		IdempotencyKey: req.IdempotencyKey,
		RequestBody:    mustJSON(req),
	}, func(ctx context.Context, job *jobs.Job) error {
		r, err := h.provider.RegisterDomain(ctx, req)
		if err != nil {
			return err
		}
		res = r
		if job != nil {
			h.tracker.SetUpstreamJobID(ctx, job.ID, r.JobID)
			h.tracker.SetResult(ctx, job.ID, r)
		}
		return nil
	})
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.Accepted(c, res)
}

// Renew — POST /v1/domains/:name/renew
func (h *Handler) Renew(c *fiber.Ctx) error {
	name := c.Params("name")
	var req provider.RenewRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Years < 1 {
		return httpx.BadRequest(c, "years wajib >= 1")
	}
	if req.IdempotencyKey == "" {
		return httpx.BadRequest(c, "idempotency_key wajib")
	}

	var res *provider.RegisterResponse
	err := h.tracker.Track(c.Context(), jobs.CreateInput{
		Kind:           jobs.KindRenew,
		Domain:         name,
		ExternalUserID: req.ExternalUserID,
		IdempotencyKey: req.IdempotencyKey,
		RequestBody:    mustJSON(req),
	}, func(ctx context.Context, job *jobs.Job) error {
		r, err := h.provider.RenewDomain(ctx, name, req)
		if err != nil {
			return err
		}
		res = r
		if job != nil {
			h.tracker.SetUpstreamJobID(ctx, job.ID, r.JobID)
			h.tracker.SetResult(ctx, job.ID, r)
		}
		return nil
	})
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.Accepted(c, res)
}

// Status — GET /v1/domains/register/:job_id/status
func (h *Handler) Status(c *fiber.Ctx) error {
	jobID := c.Params("job_id")
	res, err := h.provider.GetRegisterStatus(c.Context(), jobID)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

// Retry — POST /v1/domains/register/:job_id/retry
// Audit trail only — pakai upstream_job_id sebagai payload identifier.
func (h *Handler) Retry(c *fiber.Ctx) error {
	jobID := c.Params("job_id")
	var res *provider.RegisterStatus
	err := h.tracker.Track(c.Context(), jobs.CreateInput{
		Kind:        jobs.KindRetryRegister,
		RequestBody: mustJSON(map[string]string{"upstream_job_id": jobID}),
	}, func(ctx context.Context, job *jobs.Job) error {
		r, err := h.provider.RetryRegister(ctx, jobID)
		if err != nil {
			return err
		}
		res = r
		if job != nil {
			h.tracker.SetUpstreamJobID(ctx, job.ID, jobID)
			h.tracker.SetResult(ctx, job.ID, r)
		}
		return nil
	})
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.Accepted(c, res)
}

// Cancel — POST /v1/domains/register/:job_id/cancel
func (h *Handler) Cancel(c *fiber.Ctx) error {
	jobID := c.Params("job_id")
	err := h.tracker.Track(c.Context(), jobs.CreateInput{
		Kind:        jobs.KindCancelRegister,
		RequestBody: mustJSON(map[string]string{"upstream_job_id": jobID}),
	}, func(ctx context.Context, job *jobs.Job) error {
		if job != nil {
			h.tracker.SetUpstreamJobID(ctx, job.ID, jobID)
		}
		return h.provider.CancelRegister(ctx, jobID)
	})
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// Info — GET /v1/domains/:name/info
func (h *Handler) Info(c *fiber.Ctx) error {
	name := c.Params("name")
	res, err := h.provider.InfoDomain(c.Context(), name)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}
