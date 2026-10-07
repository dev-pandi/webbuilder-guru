package dnscloud

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/webbuilder/api/internal/dnsprovider"
)

// --- pure function tests ----------------------------------------------------

func TestProblemError(t *testing.T) {
	p := &Problem{Code: "RATE_LIMITED", Detail: "Terlalu banyak permintaan"}
	msg := p.Error()
	if !strings.Contains(msg, "RATE_LIMITED") {
		t.Errorf("Error() missing code: %q", msg)
	}
	if !strings.Contains(msg, "Terlalu banyak permintaan") {
		t.Errorf("Error() missing detail: %q", msg)
	}

	pNoDetail := &Problem{Code: "UNAUTHORIZED"}
	if got := pNoDetail.Error(); got != "dnscloud: UNAUTHORIZED" {
		t.Errorf("Error() without detail = %q", got)
	}
}

func TestIsCode(t *testing.T) {
	p := &Problem{Code: "ZONE_EXISTS"}
	if !IsCode(p, "ZONE_EXISTS") {
		t.Error("IsCode should match stable code")
	}
	if IsCode(p, "WRONG_CODE") {
		t.Error("IsCode should not match different code")
	}
	if IsCode(errors.New("plain"), "ZONE_EXISTS") {
		t.Error("IsCode should return false for non-Problem errors")
	}
	if IsCode(nil, "ZONE_EXISTS") {
		t.Error("IsCode should return false for nil")
	}
}

func TestRecordToRdata(t *testing.T) {
	cases := []struct {
		rec     dnsprovider.Record
		wantKey string
		wantVal string
	}{
		{dnsprovider.Record{Type: "A", Content: "103.10.20.30"}, "ip", "103.10.20.30"},
		{dnsprovider.Record{Type: "AAAA", Content: "2001:db8::1"}, "ip", "2001:db8::1"},
		{dnsprovider.Record{Type: "CNAME", Content: "target.id"}, "target", "target.id"},
		{dnsprovider.Record{Type: "TXT", Content: "v=spf1 -all"}, "text", "v=spf1 -all"},
		{dnsprovider.Record{Type: "NS", Content: "ns1.example.id"}, "nsdname", "ns1.example.id"},
		// Case-insensitive type
		{dnsprovider.Record{Type: "a", Content: "1.1.1.1"}, "ip", "1.1.1.1"},
	}
	for _, c := range cases {
		got, err := recordToRdata(c.rec)
		if err != nil {
			t.Errorf("recordToRdata(%s) err: %v", c.rec.Type, err)
			continue
		}
		if got[c.wantKey] != c.wantVal {
			t.Errorf("recordToRdata(%s)[%s] = %v, want %q", c.rec.Type, c.wantKey, got[c.wantKey], c.wantVal)
		}
	}

	// Unsupported type → error
	if _, err := recordToRdata(dnsprovider.Record{Type: "SRV", Content: "x"}); err == nil {
		t.Error("recordToRdata(SRV) should return error for unsupported type")
	}
}

func TestPathEscape(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"toko.id", "toko.id"},
		{"@", "%40"},
		{"abc-123_x.y~z", "abc-123_x.y~z"},
		{"has space", "has%20space"},
		{"café", "caf%C3%A9"},
	}
	for _, c := range cases {
		got := pathEscape(c.in)
		if got != c.want {
			t.Errorf("pathEscape(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// --- HTTP mock tests --------------------------------------------------------

func TestClient_CreateZone_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/zones" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer dcid_test" {
			t.Errorf("missing/wrong Authorization header: %q", auth)
		}
		var body createZoneReq
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Name != "toko.id" {
			t.Errorf("body.Name = %q, want toko.id", body.Name)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(createZoneResp{
			Zone: struct {
				ID     string `json:"id"`
				Name   string `json:"name"`
				Status string `json:"status"`
			}{ID: "zone-abc", Name: "toko.id", Status: "pending_verification"},
			Delegation: struct {
				Nameservers []string `json:"nameservers"`
				Instruksi   string   `json:"instruksi"`
			}{Nameservers: []string{"kate.ns.dnscloud.id", "theo.ns.dnscloud.id"}},
		})
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	zone, err := p.CreateZone(context.Background(), "toko.id")
	if err != nil {
		t.Fatalf("CreateZone err: %v", err)
	}
	if zone.ID != "zone-abc" {
		t.Errorf("zone.ID = %q, want zone-abc", zone.ID)
	}
	if len(zone.Nameservers) != 2 || zone.Nameservers[0] != "kate.ns.dnscloud.id" {
		t.Errorf("zone.Nameservers = %v", zone.Nameservers)
	}
}

func TestClient_CreateZone_ProblemError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(409)
		_ = json.NewEncoder(w).Encode(Problem{
			Type: "https://api.dnscloud.id/errors/zone-exists",
			Title: "Zona sudah ada",
			Status: 409,
			Detail: "Domain sudah terdaftar — ajukan klaim.",
			Code: "ZONE_EXISTS",
		})
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	_, err := p.CreateZone(context.Background(), "duplicate.id")
	if err == nil {
		t.Fatal("want error for 409, got nil")
	}
	// Provider adapter MUST normalize ZONE_EXISTS → dnsprovider sentinel
	// supaya caller (tryAttachToDNS, BYO Connect) bisa pakai errors.Is
	// tanpa coupling ke DNSCloud problem codes.
	if !errors.Is(err, dnsprovider.ErrZoneAlreadyExists) {
		t.Errorf("want ErrZoneAlreadyExists, got %v", err)
	}
}

func TestProvider_UpsertRecord_RRsetPath(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		// Go's HTTP server decodes URL before setting r.URL.Path. The wire
		// format is `%40` (verified via r.URL.RawPath); decoded path is `@`.
		wantPath := "/zones/zone-abc/rrsets/@/A"
		if r.Method != http.MethodPut || r.URL.Path != wantPath {
			t.Errorf("req = %s %s, want PUT %s (raw=%s)",
				r.Method, r.URL.Path, wantPath, r.URL.RawPath)
		}
		if !strings.Contains(r.URL.RawPath, "%40") {
			t.Errorf("wire-format RawPath should contain %%40 for @, got %q", r.URL.RawPath)
		}
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	err := p.UpsertRecord(context.Background(), "zone-abc", dnsprovider.Record{
		Type: "A", Name: "@", Content: "103.10.20.30", Proxied: true,
	})
	if err != nil {
		t.Fatalf("UpsertRecord err: %v", err)
	}
	if !called {
		t.Fatal("server never received request")
	}
}

func TestProvider_EnableProxy_KetatMode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Decoded path = /zones/zone-abc/proxy/@ ; wire = %40
		if r.Method != http.MethodPut || r.URL.Path != "/zones/zone-abc/proxy/@" {
			t.Errorf("req = %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["mode_tls"] != "ketat" {
			t.Errorf("mode_tls = %v, want ketat", body["mode_tls"])
		}
		if body["proxied"] != true {
			t.Errorf("proxied = %v, want true", body["proxied"])
		}
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	if err := p.EnableProxy(context.Background(), "zone-abc", "@"); err != nil {
		t.Fatalf("EnableProxy err: %v", err)
	}
}

func TestProvider_QueueVerify_RateLimitedSwallowed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(429)
		_ = json.NewEncoder(w).Encode(Problem{
			Status: 429, Code: "RATE_LIMITED", Detail: "Terlalu sering",
		})
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	// RATE_LIMITED is treated as "already queued" — not fatal.
	if err := p.QueueVerify(context.Background(), "zone-abc"); err != nil {
		t.Errorf("QueueVerify should swallow RATE_LIMITED, got: %v", err)
	}
}

func TestProvider_CheckVerify_StateMapping(t *testing.T) {
	cases := []struct {
		name       string
		resp       verificationStatusResp
		wantVer    bool
		wantPend   bool
	}{
		{"delegated-true", verificationStatusResp{Delegated: true}, true, false},
		{"status-active", verificationStatusResp{Status: "active"}, true, false},
		{"status-ok-case", verificationStatusResp{Status: "OK"}, true, false},
		{"status-pending", verificationStatusResp{Status: "pending"}, false, true},
		{"status-queued", verificationStatusResp{Status: "queued"}, false, true},
		{"empty-status", verificationStatusResp{}, false, true},
		{"status-failed", verificationStatusResp{Status: "failed"}, false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(c.resp)
			}))
			defer srv.Close()
			p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
			s, err := p.CheckVerify(context.Background(), "zone-abc", "toko.id", nil)
			if err != nil {
				t.Fatalf("CheckVerify err: %v", err)
			}
			if s.Verified != c.wantVer {
				t.Errorf("Verified = %v, want %v (resp=%+v)", s.Verified, c.wantVer, c.resp)
			}
			if s.Pending != c.wantPend {
				t.Errorf("Pending = %v, want %v (resp=%+v)", s.Pending, c.wantPend, c.resp)
			}
		})
	}
}

func TestProvider_DeleteRecord_IdempotentOn404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			t.Errorf("want DELETE, got %s", r.Method)
		}
		if !strings.Contains(r.URL.Path, "/rrsets/www/CNAME") {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(404)
		_ = json.NewEncoder(w).Encode(Problem{
			Status: 404, Code: "RRSET_NOT_FOUND", Detail: "sudah tidak ada",
		})
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	// 404 should be swallowed so cleanup pattern is safe to call repeatedly.
	if err := p.DeleteRecord(context.Background(), "zone-abc", "CNAME", "www"); err != nil {
		t.Errorf("DeleteRecord should swallow 404, got: %v", err)
	}
}

func TestProvider_DeleteRecord_Success(t *testing.T) {
	called := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.Method != http.MethodDelete || !strings.Contains(r.URL.Path, "/rrsets/www/CNAME") {
			t.Errorf("req = %s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(204)
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	if err := p.DeleteRecord(context.Background(), "zone-abc", "CNAME", "www"); err != nil {
		t.Errorf("DeleteRecord err: %v", err)
	}
	if !called {
		t.Error("server never received delete request")
	}
}

func TestProvider_DeleteZone_IdempotentOn404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/problem+json")
		w.WriteHeader(404)
		_ = json.NewEncoder(w).Encode(Problem{
			Status: 404, Code: "ZONE_NOT_FOUND", Detail: "sudah dihapus",
		})
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	// 404 should be swallowed so orphan reconciler can retry safely.
	if err := p.DeleteZone(context.Background(), "ghost-zone"); err != nil {
		t.Errorf("DeleteZone should swallow 404, got: %v", err)
	}
}

func TestClient_Ping_HitsZonesList(t *testing.T) {
	// Ping must probe a token-friendly endpoint. /auth/me rejects tokens with
	// 403 (bound to session identity); /zones?limit=1 accepts tokens with
	// zones:read scope and returns 200 even for an empty account.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/zones" {
			t.Errorf("Ping should hit /zones, got %s", r.URL.Path)
		}
		if r.URL.Query().Get("limit") != "1" {
			t.Errorf("Ping should pass limit=1, got %q", r.URL.Query().Get("limit"))
		}
		if r.Header.Get("Authorization") != "Bearer dcid_test" {
			t.Error("missing Authorization header")
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"zones":[],"next_cursor":null}`))
	}))
	defer srv.Close()

	c := NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"})
	if err := c.Ping(context.Background()); err != nil {
		t.Errorf("Ping err: %v", err)
	}
}

func TestProvider_FindZoneByDomain_Found(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/zones":
			// Search list — return matching zone.
			if r.URL.Query().Get("search") != "found.id" {
				t.Errorf("unexpected search query: %q", r.URL.Query().Get("search"))
			}
			_, _ = w.Write([]byte(`{"zones":[{"id":"zid-123","name":"found.id.","status":"active"}],"next_cursor":null}`))
		case "/zones/zid-123":
			// Detail call to fetch nameservers.
			_, _ = w.Write([]byte(`{"zone":{"id":"zid-123","name":"found.id."},"nameservers":["ns1.dnscloud.id","ns2.dnscloud.id"]}`))
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	zone, err := p.FindZoneByDomain(context.Background(), "found.id")
	if err != nil {
		t.Fatalf("FindZoneByDomain err: %v", err)
	}
	if zone == nil {
		t.Fatal("want zone, got nil")
	}
	if zone.ID != "zid-123" {
		t.Errorf("ID = %q, want zid-123", zone.ID)
	}
	if len(zone.Nameservers) != 2 {
		t.Errorf("nameservers = %v, want 2 items", zone.Nameservers)
	}
}

func TestProvider_FindZoneByDomain_NotFound_ReturnsNilNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"zones":[],"next_cursor":null}`))
	}))
	defer srv.Close()

	p := NewProvider(NewClient(Config{BaseURL: srv.URL, APIToken: "dcid_test"}))
	zone, err := p.FindZoneByDomain(context.Background(), "missing.id")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if zone != nil {
		t.Errorf("not-found should return nil zone, got %+v", zone)
	}
}

func TestClient_Kind(t *testing.T) {
	p := NewProvider(NewClient(Config{}))
	if p.Kind() != dnsprovider.KindDNSCloud {
		t.Errorf("Kind() = %v, want KindDNSCloud", p.Kind())
	}
}

func TestNewClient_Defaults(t *testing.T) {
	c := NewClient(Config{APIToken: "x"})
	if c.cfg.BaseURL != DefaultBaseURL {
		t.Errorf("default BaseURL = %q", c.cfg.BaseURL)
	}
	if c.cfg.Timeout == 0 {
		t.Error("default Timeout not set")
	}
}
