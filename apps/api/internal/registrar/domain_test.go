package registrar

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// dispatch = handler yang match by (method, path prefix) → response body/status.
// Simplifikasi test tanpa net/http/httptest.NewServer boilerplate berulang.
type route struct {
	method   string
	pathHead string // strings.HasPrefix
	body     string
	status   int
}

func newRouterServer(t *testing.T, routes []route) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, rt := range routes {
			if rt.method == r.Method && strings.HasPrefix(r.URL.Path, rt.pathHead) {
				if rt.status != 0 {
					w.WriteHeader(rt.status)
				}
				_, _ = io.WriteString(w, rt.body)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"error":{"code":"not_found","message":"no route"}}`)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func clientTo(t *testing.T, url string) *Client {
	t.Helper()
	c, err := New(Config{BaseURL: url, APIKey: "k", Timeout: time.Second, Retries: 1})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestGetDomainPrice_Success(t *testing.T) {
	srv := newRouterServer(t, []route{{
		method:   "GET",
		pathHead: "/v1/api/get-domain-price/",
		body:     `{"data":{"domain":"toko.id","tld":"id","currency":"IDR","register":250000,"renew":250000,"transfer":300000}}`,
	}})
	c := clientTo(t, srv.URL)
	got, err := c.GetDomainPrice(context.Background(), " Toko.ID ")
	if err != nil {
		t.Fatalf("GetDomainPrice: %v", err)
	}
	if got.Domain != "toko.id" || got.Register != 250000 {
		t.Errorf("unexpected: %+v", got)
	}
}

func TestGetDomainPrice_EmptyDomain(t *testing.T) {
	c := clientTo(t, "http://ignored")
	_, err := c.GetDomainPrice(context.Background(), "  ")
	if err == nil {
		t.Fatal("expected error on empty domain")
	}
}

func TestWhois_AvailableStatusNormalisedToNil(t *testing.T) {
	srv := newRouterServer(t, []route{{
		method:   "GET",
		pathHead: "/v1/api/whois",
		body:     `{"data":{"domain":"free.id","status":"available"}}`,
	}})
	c := clientTo(t, srv.URL)
	w, err := c.Whois(context.Background(), "free.id")
	if err != nil {
		t.Fatalf("Whois: %v", err)
	}
	if w != nil {
		t.Errorf("expected nil for 'available', got %+v", w)
	}
}

func TestWhois_404NormalisedToNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"error":{"code":"not_found","message":"no whois"}}`)
	}))
	defer srv.Close()
	c := clientTo(t, srv.URL)
	w, err := c.Whois(context.Background(), "unregistered.id")
	if err != nil {
		t.Fatalf("Whois: %v", err)
	}
	if w != nil {
		t.Errorf("expected nil on 404, got %+v", w)
	}
}

func TestWhois_RegisteredReturnsRecord(t *testing.T) {
	srv := newRouterServer(t, []route{{
		method:   "GET",
		pathHead: "/v1/api/whois",
		body:     `{"data":{"domain":"taken.id","status":"registered","registrar":"pandi","expires_at":"2027-01-01T00:00:00Z"}}`,
	}})
	c := clientTo(t, srv.URL)
	w, err := c.Whois(context.Background(), "taken.id")
	if err != nil {
		t.Fatalf("Whois: %v", err)
	}
	if w == nil || w.Status != "registered" {
		t.Errorf("expected registered record, got %+v", w)
	}
}

func TestCheckDomain_SLDOnly_ReturnsMultiZoneEnvelope(t *testing.T) {
	// SLD input "myshop" → registrar batch check → response include allowed_zones
	// + results per zone. Verify client parse semua field dengan benar termasuk
	// nested Price (float64) + Zone flags.
	body := `{"data":{
		"query":"myshop",
		"allowed_zones":["id","co.id","com"],
		"results":[
			{"domain":"myshop.id","tld":"id","available":true,"price":{"currency":"IDR","register":250000,"renew":250000,"transfer":300000},"zone":{"name":"id","require_document":true,"auto_approved":false,"nik_auto_approved":true}},
			{"domain":"myshop.co.id","tld":"co.id","available":false,"reason":"registered"},
			{"domain":"myshop.com","tld":"com","available":true,"price":{"currency":"IDR","register":180000,"renew":180000,"transfer":180000}}
		]
	}}`
	srv := newRouterServer(t, []route{{
		method:   "POST",
		pathHead: "/v1/api/user/reseller/domain/check",
		body:     body,
	}})
	c := clientTo(t, srv.URL)

	res, err := c.CheckDomain(context.Background(), "myshop")
	if err != nil {
		t.Fatalf("CheckDomain: %v", err)
	}
	if res.Query != "myshop" {
		t.Errorf("Query = %q, want myshop", res.Query)
	}
	if len(res.AllowedZones) != 3 {
		t.Errorf("AllowedZones len = %d, want 3", len(res.AllowedZones))
	}
	if len(res.Results) != 3 {
		t.Fatalf("Results len = %d, want 3", len(res.Results))
	}

	// Row 1: available + price + zone with NIK flag.
	r0 := res.Results[0]
	if r0.Domain != "myshop.id" || !r0.Available {
		t.Errorf("row0 = %+v", r0)
	}
	if r0.Price == nil || r0.Price.Register != 250000 {
		t.Errorf("row0 Price = %+v, want Register=250000", r0.Price)
	}
	if r0.Zone == nil || !r0.Zone.RequireDocument || !r0.Zone.NikAutoApproved {
		t.Errorf("row0 Zone flags = %+v", r0.Zone)
	}

	// Row 2: unavailable, reason only, no price/zone.
	r1 := res.Results[1]
	if r1.Available || r1.Reason != "registered" {
		t.Errorf("row1 unavailability wrong: %+v", r1)
	}
	if r1.Price != nil || r1.Zone != nil {
		t.Errorf("row1 should have nil Price/Zone: %+v", r1)
	}

	// Row 3: available, price, no zone (silent-absent).
	r2 := res.Results[2]
	if !r2.Available || r2.Price == nil || r2.Zone != nil {
		t.Errorf("row2 shape wrong: %+v (price=%v zone=%v)", r2, r2.Price, r2.Zone)
	}
}

func TestCheckDomain_FullDomain_ReturnsSingleResult(t *testing.T) {
	body := `{"data":{
		"query":"myshop.co.id",
		"allowed_zones":["id","co.id","com"],
		"results":[{"domain":"myshop.co.id","tld":"co.id","available":true,"price":{"currency":"IDR","register":300000,"renew":300000,"transfer":300000}}]
	}}`
	srv := newRouterServer(t, []route{{
		method:   "POST",
		pathHead: "/v1/api/user/reseller/domain/check",
		body:     body,
	}})
	c := clientTo(t, srv.URL)

	res, err := c.CheckDomain(context.Background(), "myshop.co.id")
	if err != nil {
		t.Fatalf("CheckDomain: %v", err)
	}
	if len(res.Results) != 1 || res.Results[0].Domain != "myshop.co.id" {
		t.Errorf("expected single co.id entry, got %+v", res.Results)
	}
}

func TestCheckDomain_EmptyDomain(t *testing.T) {
	c := clientTo(t, "http://ignored")
	if _, err := c.CheckDomain(context.Background(), "  "); err == nil {
		t.Fatal("expected error on empty domain")
	}
}

func TestCheckAvailability_FallbackWhenResellerFails(t *testing.T) {
	// Reseller check → 500. Whois public → 200 "registered".
	// Client harus fallback ke Whois dan report available=false.
	var checkAttempts, whoisAttempts int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" && strings.Contains(r.URL.Path, "/reseller/domain/check") {
			atomic.AddInt32(&checkAttempts, 1)
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = io.WriteString(w, `{"error":{"code":"upstream","message":"epp down"}}`)
			return
		}
		if r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/v1/api/whois") {
			atomic.AddInt32(&whoisAttempts, 1)
			_, _ = io.WriteString(w, `{"data":{"domain":"taken.id","status":"registered"}}`)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()
	c := clientTo(t, srv.URL)

	avail, err := c.CheckAvailability(context.Background(), "taken.id")
	if err != nil {
		t.Fatalf("CheckAvailability: %v", err)
	}
	if avail.Available {
		t.Errorf("expected Available=false via whois fallback, got %+v", avail)
	}
	if atomic.LoadInt32(&checkAttempts) == 0 {
		t.Error("reseller check should have been attempted")
	}
	if atomic.LoadInt32(&whoisAttempts) == 0 {
		t.Error("whois fallback should have been called")
	}
}

func TestListDomains_QueryParamEncoding(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.URL.RawQuery
		_, _ = io.WriteString(w, `{"data":{"items":[],"pagination":null}}`)
	}))
	defer srv.Close()
	c := clientTo(t, srv.URL)

	if _, err := c.ListDomains(context.Background(), "user-uuid-123", 3, 50); err != nil {
		t.Fatalf("ListDomains: %v", err)
	}
	// Setelah url.Values.Encode(): key alphabetically sorted → external_user_id, page, perPage
	want := "external_user_id=user-uuid-123&page=3&perPage=50"
	if seen != want {
		t.Errorf("query = %q, want %q", seen, want)
	}
}

func TestListDomains_NoFiltersOmitsAll(t *testing.T) {
	var seen string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = r.URL.RawQuery
		_, _ = io.WriteString(w, `{"data":{"items":[]}}`)
	}))
	defer srv.Close()
	c := clientTo(t, srv.URL)

	if _, err := c.ListDomains(context.Background(), "", 0, 0); err != nil {
		t.Fatalf("ListDomains: %v", err)
	}
	if seen != "" {
		t.Errorf("expected no query, got %q", seen)
	}
}

func TestListDomains_ParsesItems(t *testing.T) {
	body, _ := json.Marshal(map[string]any{
		"data": map[string]any{
			"items": []map[string]any{
				{"job_id": "j1", "domain": "a.id", "status": "active", "kind": "register", "expires_at": "2027-01-01T00:00:00Z"},
				{"job_id": "j2", "domain": "b.com", "status": "pending_payment", "kind": "register"},
			},
		},
	})
	srv := newRouterServer(t, []route{{
		method:   "GET",
		pathHead: "/v1/api/user/reseller/domain/list",
		body:     string(body),
	}})
	c := clientTo(t, srv.URL)

	got, err := c.ListDomains(context.Background(), "u", 1, 10)
	if err != nil {
		t.Fatalf("ListDomains: %v", err)
	}
	if len(got.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(got.Items))
	}
	if got.Items[0].JobID != "j1" || got.Items[0].Status != "active" {
		t.Errorf("first item wrong: %+v", got.Items[0])
	}
	if got.Items[1].ExpiresAt != "" {
		t.Errorf("second item should have empty ExpiresAt, got %q", got.Items[1].ExpiresAt)
	}
}
