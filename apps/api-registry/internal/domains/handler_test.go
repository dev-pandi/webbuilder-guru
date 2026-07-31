package domains

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/jobs"
	"github.com/webbuilder/api-registry/internal/provider"
)

// buildApp — helper: bootstrap Fiber app dengan handler yang di-inject
// dependency test-scope. Return app + jobStore untuk assertion.
func buildApp(fake *provider.FakeProvider) (*fiber.App, jobs.Store) {
	store := jobs.NewMemoryStore(100)
	tracker := jobs.NewTracker(store)
	h := NewHandler(fake, tracker)
	app := fiber.New()
	app.Get("/domains", h.List)
	app.Post("/domains/check", h.Check)
	app.Post("/domains/bulk-check", h.BulkCheck)
	app.Post("/domains/register", h.Register)
	app.Post("/domains/:name/renew", h.Renew)
	app.Get("/domains/register/:job_id/status", h.Status)
	app.Post("/domains/register/:job_id/retry", h.Retry)
	app.Post("/domains/register/:job_id/cancel", h.Cancel)
	app.Get("/domains/:name/info", h.Info)
	return app, store
}

func doJSON(t *testing.T, app *fiber.App, method, path string, body any) (int, []byte) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test err: %v", err)
	}
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

func TestCheck_Success(t *testing.T) {
	fake := provider.NewFake()
	fake.CheckFn = func(ctx context.Context, req provider.CheckRequest) (*provider.CheckResponse, error) {
		return &provider.CheckResponse{
			Query:        req.Domain,
			AllowedZones: []string{"id"},
			Results: []provider.CheckEntry{
				{Domain: req.Domain + ".id", Available: true},
			},
		}, nil
	}
	app, _ := buildApp(fake)

	status, body := doJSON(t, app, "POST", "/domains/check", map[string]string{"domain": "myshop"})
	if status != 200 {
		t.Fatalf("status=%d body=%s", status, body)
	}
	if !strings.Contains(string(body), `"myshop.id"`) {
		t.Errorf("expected myshop.id in body: %s", body)
	}
	if fake.CallCount("CheckDomain") != 1 {
		t.Errorf("expected 1 CheckDomain call, got %d", fake.CallCount("CheckDomain"))
	}
}

func TestCheck_MissingDomain(t *testing.T) {
	app, _ := buildApp(provider.NewFake())
	status, _ := doJSON(t, app, "POST", "/domains/check", map[string]string{})
	if status != 400 {
		t.Errorf("expected 400 missing domain, got %d", status)
	}
}

func TestRegister_RequiresIdempotencyKey(t *testing.T) {
	app, _ := buildApp(provider.NewFake())
	status, body := doJSON(t, app, "POST", "/domains/register", map[string]any{
		"domain": "x.id", "years": 1, "external_user_id": "u",
	})
	if status != 400 {
		t.Errorf("expected 400 missing idempotency_key, got %d body=%s", status, body)
	}
}

func TestRegister_SuccessTracksJob(t *testing.T) {
	fake := provider.NewFake()
	app, store := buildApp(fake)

	status, _ := doJSON(t, app, "POST", "/domains/register", map[string]any{
		"domain": "hello.id", "years": 2, "external_user_id": "u-1",
		"idempotency_key": "k-1",
		"contact":         map[string]string{"name": "A", "email": "a@b.com"},
	})
	if status != 202 {
		t.Errorf("expected 202 accepted, got %d", status)
	}
	// Job tracked in-memory.
	items, total, _ := store.List(context.Background(), jobs.ListFilter{})
	if total != 1 {
		t.Errorf("expected 1 tracked job, got %d", total)
	}
	if len(items) == 1 && items[0].Status != jobs.StatusSucceeded {
		t.Errorf("expected succeeded status, got %q", items[0].Status)
	}
	if fake.CallCount("RegisterDomain") != 1 {
		t.Errorf("expected 1 RegisterDomain, got %d", fake.CallCount("RegisterDomain"))
	}
}

func TestRegister_ProviderErrorMarksJobFailed(t *testing.T) {
	fake := provider.NewFake()
	fake.RegisterFn = func(ctx context.Context, req provider.RegisterRequest) (*provider.RegisterResponse, error) {
		return nil, provider.ErrConflict
	}
	app, store := buildApp(fake)

	status, _ := doJSON(t, app, "POST", "/domains/register", map[string]any{
		"domain": "dup.id", "years": 1, "external_user_id": "u",
		"idempotency_key": "k",
		"contact":         map[string]string{"name": "A", "email": "a@b.com"},
	})
	if status != 409 {
		t.Errorf("expected 409 conflict mapped, got %d", status)
	}
	items, _, _ := store.List(context.Background(), jobs.ListFilter{})
	if len(items) == 1 && items[0].Status != jobs.StatusFailed {
		t.Errorf("expected failed job, got %q", items[0].Status)
	}
}

func TestBulkCheck_EmptyRejected(t *testing.T) {
	app, _ := buildApp(provider.NewFake())
	status, _ := doJSON(t, app, "POST", "/domains/bulk-check", map[string]any{"domains": []string{}})
	if status != 400 {
		t.Errorf("expected 400 empty domains, got %d", status)
	}
}

func TestList_QueryParams(t *testing.T) {
	fake := provider.NewFake()
	fake.ListDomainsFn = func(ctx context.Context, f provider.ListDomainsFilter) (*provider.DomainListResponse, error) {
		if f.ExternalUserID != "user-x" || f.Page != 2 || f.PerPage != 25 {
			t.Errorf("filter mismatch: %+v", f)
		}
		return &provider.DomainListResponse{Items: []provider.DomainListItem{{Domain: "a.id"}}}, nil
	}
	app, _ := buildApp(fake)
	status, _ := doJSON(t, app, "GET", "/domains?external_user_id=user-x&page=2&per_page=25", nil)
	if status != 200 {
		t.Errorf("expected 200, got %d", status)
	}
}

func TestStatus_NotFoundMapped(t *testing.T) {
	fake := provider.NewFake()
	fake.GetRegisterStatusFn = func(ctx context.Context, jobID string) (*provider.RegisterStatus, error) {
		return nil, provider.ErrNotFound
	}
	app, _ := buildApp(fake)
	status, _ := doJSON(t, app, "GET", "/domains/register/nonexistent/status", nil)
	if status != 404 {
		t.Errorf("expected 404, got %d", status)
	}
}

func TestCancel_Success(t *testing.T) {
	app, store := buildApp(provider.NewFake())
	status, _ := doJSON(t, app, "POST", "/domains/register/job-1/cancel", nil)
	if status != 200 {
		t.Errorf("expected 200, got %d", status)
	}
	items, _, _ := store.List(context.Background(), jobs.ListFilter{Kind: jobs.KindCancelRegister})
	if len(items) != 1 {
		t.Errorf("expected 1 cancel job tracked, got %d", len(items))
	}
}

func TestInfo_CapabilityMissing(t *testing.T) {
	// Fake default InfoDomain return ErrCapabilityMissing.
	app, _ := buildApp(provider.NewFake())
	status, _ := doJSON(t, app, "GET", "/domains/foo.id/info", nil)
	if status != 503 {
		t.Errorf("expected 503 capability missing, got %d", status)
	}
}

// Compile-time check.
var _ = errors.Is
