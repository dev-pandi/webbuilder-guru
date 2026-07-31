package provider

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// mockUpstream — httptest server simulate registrar-api. Setiap test
// mount handler ke path yang di-expect + return payload sesuai kontrak.
func mockUpstream(t *testing.T, routes map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	for path, h := range routes {
		mux.HandleFunc(path, h)
	}
	return httptest.NewServer(mux)
}

func TestPandiWrapper_CheckDomain_Roundtrip(t *testing.T) {
	srv := mockUpstream(t, map[string]http.HandlerFunc{
		"/v1/api/user/reseller/domain/check": func(w http.ResponseWriter, r *http.Request) {
			if r.Method != "POST" {
				t.Errorf("expected POST, got %s", r.Method)
			}
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			if body["domain"] != "myshop" {
				t.Errorf("body domain mismatch: %+v", body)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"data":{"query":"myshop","allowed_zones":["id","co.id"],"results":[
				{"domain":"myshop.id","tld":"id","available":true,"price":{"currency":"IDR","register":250000,"renew":250000,"transfer":300000}},
				{"domain":"myshop.co.id","tld":"co.id","available":false,"reason":"registered"}
			]}}`))
		},
	})
	defer srv.Close()

	p, err := NewPandiWrapper(PandiWrapperConfig{
		BaseURL:     srv.URL,
		StaticToken: "test-token",
	})
	if err != nil {
		t.Fatal(err)
	}
	res, err := p.CheckDomain(context.Background(), CheckRequest{Domain: "myshop"})
	if err != nil {
		t.Fatalf("CheckDomain error: %v", err)
	}
	if len(res.AllowedZones) != 2 {
		t.Errorf("expected 2 zones, got %v", res.AllowedZones)
	}
	if len(res.Results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(res.Results))
	}
	if !res.Results[0].Available || res.Results[0].Price == nil {
		t.Errorf("first result should be available with price: %+v", res.Results[0])
	}
	if res.Results[1].Reason != "registered" {
		t.Errorf("second result reason mismatch: %+v", res.Results[1])
	}
}

func TestPandiWrapper_RegisterDomain_Forward(t *testing.T) {
	var seenAuth string
	srv := mockUpstream(t, map[string]http.HandlerFunc{
		"/v1/api/user/reseller/domain/register": func(w http.ResponseWriter, r *http.Request) {
			seenAuth = r.Header.Get("Authorization")
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			if body["years"].(float64) != 2 {
				t.Errorf("expected years=2, got %v", body["years"])
			}
			w.Write([]byte(`{"data":{"job_id":"job_123","status":"pending_payment","invoice_id":"inv-abc"}}`))
		},
	})
	defer srv.Close()

	p, err := NewPandiWrapper(PandiWrapperConfig{BaseURL: srv.URL, StaticToken: "abc-123"})
	if err != nil {
		t.Fatal(err)
	}
	res, err := p.RegisterDomain(context.Background(), RegisterRequest{
		Domain:         "test.id",
		Years:          2,
		ExternalUserID: "user-1",
		IdempotencyKey: "idem-1",
		Contact:        Contact{Name: "A", Email: "a@b.com"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.JobID != "job_123" {
		t.Errorf("job_id mismatch: %+v", res)
	}
	if seenAuth != "Bearer abc-123" {
		t.Errorf("Authorization header not forwarded: %q", seenAuth)
	}
}

func TestPandiWrapper_NotFoundMapped(t *testing.T) {
	srv := mockUpstream(t, map[string]http.HandlerFunc{
		"/v1/api/user/reseller/contacts/999": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
			w.Write([]byte(`{"error":{"code":"not_found","message":"contact tidak ditemukan"}}`))
		},
	})
	defer srv.Close()

	p, _ := NewPandiWrapper(PandiWrapperConfig{BaseURL: srv.URL, StaticToken: "t"})
	_, err := p.GetContact(context.Background(), 999)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestPandiWrapper_UnauthorizedTriggersReauth(t *testing.T) {
	// First register call → 401. Login endpoint → issue new token. Retry → 200.
	var registerAttempts int
	var loginCalls int
	srv := mockUpstream(t, map[string]http.HandlerFunc{
		"/v1/api/user/login": func(w http.ResponseWriter, r *http.Request) {
			loginCalls++
			w.Write([]byte(`{"data":{"token":"new-jwt"}}`))
		},
		"/v1/api/user/reseller/domain/register": func(w http.ResponseWriter, r *http.Request) {
			registerAttempts++
			auth := r.Header.Get("Authorization")
			if registerAttempts == 1 && strings.Contains(auth, "old") {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			// Kalau pakai token baru, sukses.
			w.Write([]byte(`{"data":{"job_id":"job_x","status":"pending_payment"}}`))
		},
	})
	defer srv.Close()

	p, _ := NewPandiWrapper(PandiWrapperConfig{
		BaseURL:     srv.URL,
		StaticToken: "old-token",
		Email:       "reseller@example.com",
		Password:    "changeme",
	})
	res, err := p.RegisterDomain(context.Background(), RegisterRequest{
		Domain: "auto.id", Years: 1, ExternalUserID: "u1", IdempotencyKey: "k1",
		Contact: Contact{Name: "X", Email: "x@y.com"},
	})
	if err != nil {
		t.Fatalf("expected success after reauth, got %v", err)
	}
	if res.JobID != "job_x" {
		t.Errorf("job_id mismatch: %+v", res)
	}
	if loginCalls != 1 {
		t.Errorf("expected 1 login, got %d", loginCalls)
	}
	if registerAttempts != 2 {
		t.Errorf("expected 2 register attempts (401 + retry), got %d", registerAttempts)
	}
}

func TestPandiWrapper_BulkCheck_FanOut(t *testing.T) {
	var calls int
	srv := mockUpstream(t, map[string]http.HandlerFunc{
		"/v1/api/user/reseller/domain/check": func(w http.ResponseWriter, r *http.Request) {
			calls++
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			d := body["domain"]
			w.Write([]byte(`{"data":{"query":"` + d + `","allowed_zones":["id"],"results":[
				{"domain":"` + d + `.id","tld":"id","available":true}
			]}}`))
		},
	})
	defer srv.Close()

	p, _ := NewPandiWrapper(PandiWrapperConfig{BaseURL: srv.URL, StaticToken: "t"})
	res, err := p.BulkCheckDomains(context.Background(), BulkCheckRequest{
		Domains: []string{"foo", "bar", "baz"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 3 {
		t.Errorf("expected 3 upstream calls (fan-out), got %d", calls)
	}
	if len(res.Results) != 3 {
		t.Errorf("expected 3 results, got %d", len(res.Results))
	}
}

func TestPandiWrapper_ListDomains_QueryString(t *testing.T) {
	srv := mockUpstream(t, map[string]http.HandlerFunc{
		"/v1/api/user/reseller/domain/list": func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Query().Get("external_user_id") != "user-1" {
				t.Errorf("external_user_id mismatch: %s", r.URL.RawQuery)
			}
			if r.URL.Query().Get("page") != "2" {
				t.Errorf("page mismatch: %s", r.URL.RawQuery)
			}
			w.Write([]byte(`{"data":{"items":[{"job_id":"j1","domain":"a.id","status":"active","kind":"register","external_user_id":"user-1","created_at":"2025-01-01T00:00:00Z"}],"pagination":{"page":2,"total":15}}}`))
		},
	})
	defer srv.Close()

	p, _ := NewPandiWrapper(PandiWrapperConfig{BaseURL: srv.URL, StaticToken: "t"})
	res, err := p.ListDomains(context.Background(), ListDomainsFilter{
		ExternalUserID: "user-1", Page: 2, PerPage: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Items) != 1 || res.Items[0].Domain != "a.id" {
		t.Errorf("items mismatch: %+v", res)
	}
	if res.Pagination == nil {
		t.Errorf("pagination should pass-through")
	}
}
