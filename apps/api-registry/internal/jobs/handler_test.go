package jobs

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// buildJobsApp — helper mount jobs handler untuk test.
func buildJobsApp(store Store) *fiber.App {
	app := fiber.New()
	h := NewHandler(store)
	app.Get("/v1/jobs", h.List)
	app.Get("/v1/jobs/:id", h.Get)
	return app
}

func TestHandler_Get_NoStore(t *testing.T) {
	app := buildJobsApp(nil)
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs/anything", nil))
	if resp.StatusCode != 503 {
		t.Errorf("expected 503 for nil store, got %d", resp.StatusCode)
	}
}

func TestHandler_Get_NotFound(t *testing.T) {
	app := buildJobsApp(NewMemoryStore(100))
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs/does-not-exist", nil))
	if resp.StatusCode != 404 {
		t.Errorf("expected 404 for missing job, got %d", resp.StatusCode)
	}
}

func TestHandler_Get_Success(t *testing.T) {
	store := NewMemoryStore(100)
	ctx := context.Background()
	created, err := store.Create(ctx, CreateInput{
		Kind:           KindRegister,
		Domain:         "myshop.id",
		ExternalUserID: "u1",
		RequestBody:    []byte(`{"years":1}`),
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	app := buildJobsApp(store)
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs/"+created.ID, nil))
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "myshop.id") {
		t.Errorf("body missing domain: %s", body)
	}
	if !strings.Contains(string(body), created.ID) {
		t.Errorf("body missing job id: %s", body)
	}
}

func TestHandler_List_NoStore(t *testing.T) {
	app := buildJobsApp(nil)
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs", nil))
	if resp.StatusCode != 503 {
		t.Errorf("expected 503 for nil store, got %d", resp.StatusCode)
	}
}

func TestHandler_List_Empty(t *testing.T) {
	app := buildJobsApp(NewMemoryStore(100))
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs", nil))
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		Data struct {
			Items  []Job `json:"items"`
			Total  int   `json:"total"`
			Limit  int   `json:"limit"`
			Offset int   `json:"offset"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("decode: %v (body %s)", err, body)
	}
	if out.Data.Total != 0 {
		t.Errorf("expected total=0, got %d", out.Data.Total)
	}
	if len(out.Data.Items) != 0 {
		t.Errorf("expected empty items, got %d", len(out.Data.Items))
	}
	// Default limit 50 kalau tidak di-set.
	if out.Data.Limit != 50 {
		t.Errorf("expected default limit=50, got %d", out.Data.Limit)
	}
}

func TestHandler_List_FilterByDomain(t *testing.T) {
	store := NewMemoryStore(100)
	ctx := context.Background()
	_, _ = store.Create(ctx, CreateInput{Kind: KindRegister, Domain: "one.id"})
	_, _ = store.Create(ctx, CreateInput{Kind: KindRegister, Domain: "two.id"})
	_, _ = store.Create(ctx, CreateInput{Kind: KindRenew, Domain: "one.id"})

	app := buildJobsApp(store)
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs?domain=one.id", nil))
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		Data struct {
			Items []Job `json:"items"`
			Total int   `json:"total"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &out)
	if out.Data.Total != 2 {
		t.Errorf("filter domain=one.id should return 2 jobs, got %d", out.Data.Total)
	}
	for _, j := range out.Data.Items {
		if j.Domain != "one.id" {
			t.Errorf("filter leak: got domain %q", j.Domain)
		}
	}
}

func TestHandler_List_FilterByKind(t *testing.T) {
	store := NewMemoryStore(100)
	ctx := context.Background()
	_, _ = store.Create(ctx, CreateInput{Kind: KindRegister, Domain: "a.id"})
	_, _ = store.Create(ctx, CreateInput{Kind: KindRenew, Domain: "b.id"})

	app := buildJobsApp(store)
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs?kind=renew", nil))
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		Data struct{ Total int `json:"total"` } `json:"data"`
	}
	_ = json.Unmarshal(body, &out)
	if out.Data.Total != 1 {
		t.Errorf("filter kind=renew should return 1, got %d", out.Data.Total)
	}
}

func TestHandler_List_PaginationParams(t *testing.T) {
	app := buildJobsApp(NewMemoryStore(100))
	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/jobs?limit=10&offset=5", nil))
	body, _ := io.ReadAll(resp.Body)
	var out struct {
		Data struct {
			Limit  int `json:"limit"`
			Offset int `json:"offset"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &out)
	if out.Data.Limit != 10 {
		t.Errorf("limit not honored: got %d", out.Data.Limit)
	}
	if out.Data.Offset != 5 {
		t.Errorf("offset not honored: got %d", out.Data.Offset)
	}
}
