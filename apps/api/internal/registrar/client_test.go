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

func TestDecodeError_RegistrarMessagesPluralShape(t *testing.T) {
	// Registrar-api (Gin) balik {"code":400,"messages":"..."} — beda dari
	// {"error":{...}} pattern web builder. Verify parser handle keduanya.
	raw := []byte(`{"code":400,"messages":"contact.nik wajib untuk domain .id"}`)
	e := decodeError(400, raw)
	if e.Msg != "contact.nik wajib untuk domain .id" {
		t.Errorf("Msg = %q, want clean 'contact.nik wajib ...' (bukan raw JSON)", e.Msg)
	}
	if e.Code != "400" {
		t.Errorf("Code = %q, want '400' (dari field code int)", e.Code)
	}
}

func TestDecodeError_MessagesArrayShape(t *testing.T) {
	// Validator balik "messages":["field1 wajib","field2 invalid"] → join dengan ";".
	raw := []byte(`{"code":422,"messages":["email wajib","password minimal 8"]}`)
	e := decodeError(422, raw)
	if e.Msg != "email wajib; password minimal 8" {
		t.Errorf("Msg = %q, want joined array", e.Msg)
	}
}

func TestDecodeError_ErrorStringShape(t *testing.T) {
	// Beberapa gateway balik {"error":"..."} string flat.
	raw := []byte(`{"error":"upstream timeout"}`)
	e := decodeError(504, raw)
	if e.Msg != "upstream timeout" {
		t.Errorf("Msg = %q, want 'upstream timeout'", e.Msg)
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

func TestClient_401_AutoRecover_LoginAndRetry(t *testing.T) {
	// Simulasi: JWT lama "stale-jwt" → server balik 401. Login endpoint balik
	// JWT baru "fresh-jwt". Client harus retry request awal pakai fresh-jwt.
	var authHeaders []string
	var loginHits int32

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/api/user/login" {
			atomic.AddInt32(&loginHits, 1)
			_, _ = io.WriteString(w, `{"token":"fresh-jwt"}`)
			return
		}
		auth := r.Header.Get("Authorization")
		authHeaders = append(authHeaders, auth)
		if auth == "Bearer fresh-jwt" {
			_, _ = io.WriteString(w, `{"data":{"ok":true}}`)
			return
		}
		// stale JWT → 401
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"code":"jwt_invalid","message":"expired"}}`)
	}))
	defer srv.Close()

	c, err := New(Config{BaseURL: srv.URL, APIKey: "stale-jwt", Timeout: 2 * time.Second, Retries: 2})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	c.SetCredentials("test@example.com", "secret")

	if err := c.do(context.Background(), "GET", "/some/resource", nil, nil); err != nil {
		t.Fatalf("expected success after reauth, got %v", err)
	}
	if atomic.LoadInt32(&loginHits) != 1 {
		t.Errorf("login should be called exactly once, got %d", loginHits)
	}
	if len(authHeaders) != 2 {
		t.Fatalf("expected 2 request auths (stale + fresh), got %d: %v", len(authHeaders), authHeaders)
	}
	if authHeaders[0] != "Bearer stale-jwt" || authHeaders[1] != "Bearer fresh-jwt" {
		t.Errorf("auth headers = %v, want [stale, fresh]", authHeaders)
	}
	if c.APIKey() != "fresh-jwt" {
		t.Errorf("APIKey after reauth = %q, want fresh-jwt", c.APIKey())
	}
}

func TestClient_401_NoRecoverWithoutCredentials(t *testing.T) {
	// Tanpa SetCredentials, 401 langsung propagate — client tidak coba login.
	var loginHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/api/user/login" {
			atomic.AddInt32(&loginHits, 1)
			_, _ = io.WriteString(w, `{"token":"whatever"}`)
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"code":"jwt_invalid","message":"expired"}}`)
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: srv.URL, APIKey: "stale", Timeout: time.Second, Retries: 2})
	err := c.do(context.Background(), "GET", "/x", nil, nil)
	if err == nil {
		t.Fatal("expected 401 error to propagate")
	}
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 401 {
		t.Errorf("expected APIError status=401, got %v", err)
	}
	if atomic.LoadInt32(&loginHits) != 0 {
		t.Errorf("login should NOT be called without credentials, got %d hits", loginHits)
	}
}

func TestClient_401_LoginPathDoesNotRecurse(t *testing.T) {
	// Guard: kalau /v1/api/user/login sendiri balik 401 (credential salah),
	// jangan trigger reauth ulang — akan infinite recurse. Login harus fail-fast.
	var loginHits int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&loginHits, 1)
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"code":"bad_credentials","message":"wrong password"}}`)
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: srv.URL, Timeout: time.Second, Retries: 2})
	c.SetCredentials("wrong@example.com", "wrong")

	_, err := c.Login(context.Background(), "wrong@example.com", "wrong")
	if err == nil {
		t.Fatal("expected Login to fail with 401")
	}
	// Login endpoint hit paling banyak `Retries` kali (2), TIDAK loop reauth.
	if n := atomic.LoadInt32(&loginHits); n > 2 {
		t.Errorf("login hit %d times, expected ≤2 (no reauth recursion)", n)
	}
}
