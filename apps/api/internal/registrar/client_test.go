package registrar

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// helper: bikin client + backend httptest.Server dgn handler custom.
func newTestClient(t *testing.T, handler http.HandlerFunc) (*Client, *httptest.Server) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c, err := New(Config{
		BaseURL: srv.URL,
		APIKey:  "test-jwt",
		Timeout: 2 * time.Second,
		Retries: 2,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if c == nil {
		t.Fatal("expected non-nil client")
	}
	return c, srv
}

func TestNew_EmptyBaseURL_ReturnsNil(t *testing.T) {
	c, err := New(Config{BaseURL: ""})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c != nil {
		t.Errorf("expected nil client when BaseURL empty, got %+v", c)
	}
}

func TestNew_RelativeBaseURL_Errors(t *testing.T) {
	_, err := New(Config{BaseURL: "registrar.local"})
	if err == nil || !strings.Contains(err.Error(), "absolute") {
		t.Errorf("expected 'absolute' error, got %v", err)
	}
}

func TestClient_AuthHeader_SentAsBearer(t *testing.T) {
	var gotAuth string
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = io.WriteString(w, `{"data":{"ok":true}}`)
	})

	var out struct {
		Data struct{ OK bool } `json:"data"`
	}
	if err := c.do(context.Background(), "GET", "/x", nil, &out); err != nil {
		t.Fatalf("do: %v", err)
	}
	if gotAuth != "Bearer test-jwt" {
		t.Errorf("Authorization = %q, want %q", gotAuth, "Bearer test-jwt")
	}
}

func TestClient_APIKey_NoHeaderWhenEmpty(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		_, _ = io.WriteString(w, `{"data":null}`)
	}))
	defer srv.Close()
	c, _ := New(Config{BaseURL: srv.URL, Timeout: time.Second})
	if err := c.do(context.Background(), "GET", "/x", nil, nil); err != nil {
		t.Fatalf("do: %v", err)
	}
	if gotAuth != "" {
		t.Errorf("expected empty Authorization when APIKey empty, got %q", gotAuth)
	}
}

func TestClient_Retries_On5xxThenSuccess(t *testing.T) {
	var attempts int32
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n == 1 {
			w.WriteHeader(http.StatusBadGateway)
			_, _ = io.WriteString(w, `{"error":{"code":"upstream","message":"bad"}}`)
			return
		}
		_, _ = io.WriteString(w, `{"data":{"ok":true}}`)
	})

	if err := c.do(context.Background(), "GET", "/x", nil, nil); err != nil {
		t.Fatalf("do failed after retry: %v", err)
	}
	if n := atomic.LoadInt32(&attempts); n != 2 {
		t.Errorf("attempts = %d, want 2", n)
	}
}

func TestClient_NoRetry_On4xx(t *testing.T) {
	var attempts int32
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"code":"bad_request","message":"nope"}}`)
	})

	err := c.do(context.Background(), "GET", "/x", nil, nil)
	if err == nil {
		t.Fatal("expected error on 400")
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("expected APIError, got %T: %v", err, err)
	}
	if apiErr.Status != 400 || apiErr.Code != "bad_request" {
		t.Errorf("status/code = %d/%q, want 400/bad_request", apiErr.Status, apiErr.Code)
	}
	if n := atomic.LoadInt32(&attempts); n != 1 {
		t.Errorf("attempts = %d, want 1 (no retry on 4xx)", n)
	}
}

func TestClient_ContextCancellation_StopsRetries(t *testing.T) {
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // sudah cancel sebelum call
	err := c.do(ctx, "GET", "/x", nil, nil)
	if err == nil {
		t.Fatal("expected error on cancelled ctx")
	}
}

func TestClient_SetAPIKey_ConcurrentSafe(t *testing.T) {
	// Race detector akan fail kalau mu tidak guard apiKey properly.
	c, _ := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"data":null}`)
	})

	var wg sync.WaitGroup
	// 50 writer goroutine rotate JWT
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			c.SetAPIKey("rotated-" + string(rune('a'+(i%26))))
		}(i)
	}
	// 50 reader — panggil do() yang membaca APIKey().
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = c.do(context.Background(), "GET", "/x", nil, nil)
		}()
	}
	wg.Wait()

	// APIKey() harus tetap bisa dibaca setelah semua goroutine selesai
	if k := c.APIKey(); !strings.HasPrefix(k, "rotated-") {
		t.Errorf("APIKey after rotate = %q, want prefix 'rotated-'", k)
	}
}

func TestDecodeError_NestedShape(t *testing.T) {
	raw := []byte(`{"error":{"code":"insufficient_balance","message":"saldo kurang"}}`)
	e := decodeError(402, raw)
	if e.Status != 402 || e.Code != "insufficient_balance" || e.Msg != "saldo kurang" {
		t.Errorf("decoded = %+v, want status=402 code+msg populated", e)
	}
}

func TestDecodeError_FlatMessageFallback(t *testing.T) {
	raw := []byte(`{"message":"gateway timeout"}`)
	e := decodeError(504, raw)
	if e.Msg != "gateway timeout" {
		t.Errorf("Msg = %q, want 'gateway timeout'", e.Msg)
	}
	if e.Code != "" {
		t.Errorf("Code should be empty on flat shape, got %q", e.Code)
	}
}

func TestDecodeError_NonJSON_ReturnsSnippedBody(t *testing.T) {
	raw := []byte("<html>500 Internal Error</html>")
	e := decodeError(500, raw)
	if !strings.Contains(e.Msg, "500 Internal Error") {
		t.Errorf("Msg = %q, expected raw body", e.Msg)
	}
}

func TestIsAPIError(t *testing.T) {
	if IsAPIError(errors.New("network down")) {
		t.Error("IsAPIError(network err) should be false")
	}
	if !IsAPIError(&APIError{Status: 500}) {
		t.Error("IsAPIError(APIError) should be true")
	}
	if !IsAPIError(errWrap(&APIError{Status: 500})) {
		t.Error("IsAPIError should unwrap errors.As")
	}
}

// errWrap emulates errors.Wrap to test errors.As unwrap path.
type wrappedErr struct{ inner error }

func (w wrappedErr) Error() string { return "wrap: " + w.inner.Error() }
func (w wrappedErr) Unwrap() error { return w.inner }
func errWrap(e error) error        { return wrappedErr{inner: e} }
