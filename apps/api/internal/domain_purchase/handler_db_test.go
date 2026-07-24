package domain_purchase

// Integration tests untuk Handler methods yang butuh Postgres + httptest.
// Same skip pattern dengan repo_db_test.go — TEST_DATABASE_URL kosong → SKIP.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/webbuilder/api/internal/registrar"
)

// makeRegistrarStub bikin httptest.Server yang serve /reseller/domain/list
// dengan paginated response. `perPage` mengatur ukuran page; total items =
// `totalItems`. `hits` counter track berapa halaman yang ter-request.
func makeRegistrarStub(t *testing.T, totalItems int, perPage int, hits *int32) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/api/user/reseller/domain/list" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		atomic.AddInt32(hits, 1)
		start := (page - 1) * perPage
		end := start + perPage
		if end > totalItems {
			end = totalItems
		}
		items := make([]map[string]any, 0, end-start)
		for i := start; i < end; i++ {
			items = append(items, map[string]any{
				"job_id":     fmt.Sprintf("stubjob-%d", i),
				"domain":     fmt.Sprintf("d%d.id", i),
				"status":     "active",
				"kind":       "register",
				"expires_at": time.Now().Add(365 * 24 * time.Hour).UTC().Format(time.RFC3339),
			})
		}
		out := map[string]any{"data": map[string]any{"items": items}}
		_ = json.NewEncoder(w).Encode(out)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newHandlerForTest(t *testing.T, baseURL string) *Handler {
	t.Helper()
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	c, err := registrar.New(registrar.Config{
		BaseURL: baseURL,
		APIKey:  "stub-jwt",
		Timeout: 2 * time.Second,
		Retries: 1,
	})
	if err != nil {
		t.Fatalf("registrar.New: %v", err)
	}
	repo := NewRepo(testPool)
	// authRepo + cloudflare + platformIPs + webhookSecret tidak dipakai di reconcile path.
	return NewHandler(repo, c, nil, nil, nil, "")
}

// TestHandler_Reconcile_PaginatesUntilExhausted — 250 item, perPage=100 default,
// jadi harus fetch 3 halaman (100, 100, 50). Hits counter memverifikasi loop.
func TestHandler_Reconcile_PaginatesUntilExhausted(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	var hits int32
	srv := makeRegistrarStub(t, 250, reconcilePerPage, &hits)
	h := newHandlerForTest(t, srv.URL)

	scanned, _, err := h.reconcile(context.Background(), "")
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if scanned != 250 {
		t.Errorf("scanned = %d, want 250 (sum of 3 pages)", scanned)
	}
	if got := atomic.LoadInt32(&hits); got != 3 {
		t.Errorf("registrar hits = %d, want 3 (page 1,2,3)", got)
	}
}

// TestHandler_Reconcile_StopsOnPartialPage — page terakhir yang < perPage
// harus jadi sinyal loop stop tanpa panggil page berikutnya. 150 items /
// perPage=100 = 2 hits (100 + 50).
func TestHandler_Reconcile_StopsOnPartialPage(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	var hits int32
	srv := makeRegistrarStub(t, 150, reconcilePerPage, &hits)
	h := newHandlerForTest(t, srv.URL)

	scanned, _, err := h.reconcile(context.Background(), "")
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if scanned != 150 {
		t.Errorf("scanned = %d, want 150", scanned)
	}
	if got := atomic.LoadInt32(&hits); got != 2 {
		t.Errorf("hits = %d, want 2 (partial page stops loop)", got)
	}
}

// TestHandler_Reconcile_EmptyRegistrarNoLoop — 0 items → 1 request → stop.
func TestHandler_Reconcile_EmptyRegistrarNoLoop(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	var hits int32
	srv := makeRegistrarStub(t, 0, reconcilePerPage, &hits)
	h := newHandlerForTest(t, srv.URL)

	scanned, updated, err := h.reconcile(context.Background(), "")
	if err != nil {
		t.Fatalf("reconcile: %v", err)
	}
	if scanned != 0 || updated != 0 {
		t.Errorf("scanned=%d updated=%d, want 0/0", scanned, updated)
	}
	if got := atomic.LoadInt32(&hits); got != 1 {
		t.Errorf("hits = %d, want 1 (single empty check)", got)
	}
}

// TestHandler_Reconcile_Page1FailurePropagates — kalau page 1 error, tidak
// ada progress, propagate error ke caller (biar user tau sync gagal).
func TestHandler_Reconcile_Page1FailurePropagates(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"error":{"code":"upstream","message":"registrar down"}}`))
	}))
	defer srv.Close()
	h := newHandlerForTest(t, srv.URL)

	_, _, err := h.reconcile(context.Background(), "")
	if err == nil {
		t.Fatal("expected error when page 1 fails")
	}
}

// TestHandler_Reconcile_ContextCancelStops — cancel di tengah loop → return
// partial success dengan ctx.Err().
func TestHandler_Reconcile_ContextCancelStops(t *testing.T) {
	if testPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Delay supaya ada waktu cancel.
		time.Sleep(500 * time.Millisecond)
		_, _ = w.Write([]byte(`{"data":{"items":[]}}`))
	}))
	defer srv.Close()
	h := newHandlerForTest(t, srv.URL)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel sebelum panggil
	_, _, err := h.reconcile(ctx, "")
	if err == nil {
		t.Fatal("expected ctx error on cancelled context")
	}
}
