package registrar

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestUseAPIRegistry_TogglesWithConfig — smoke test predicate helper.
func TestUseAPIRegistry_TogglesWithConfig(t *testing.T) {
	// Tanpa APIRegistryURL — legacy mode.
	legacy, err := New(Config{BaseURL: "http://legacy.local"})
	if err != nil {
		t.Fatalf("New legacy: %v", err)
	}
	if legacy.useAPIRegistry() {
		t.Errorf("empty APIRegistryURL should not enable api-registry backend")
	}

	// Dengan APIRegistryURL — dual-backend enabled.
	dual, err := New(Config{
		BaseURL:        "http://legacy.local",
		APIRegistryURL: "http://api-registry:5000",
	})
	if err != nil {
		t.Fatalf("New dual: %v", err)
	}
	if !dual.useAPIRegistry() {
		t.Errorf("APIRegistryURL set should enable api-registry backend")
	}
}

// TestNew_RejectsRelativeAPIRegistryURL — mirror validation ke BaseURL.
func TestNew_RejectsRelativeAPIRegistryURL(t *testing.T) {
	_, err := New(Config{
		BaseURL:        "http://legacy.local",
		APIRegistryURL: "api-registry:5000", // missing scheme
	})
	if err == nil {
		t.Fatal("expected error for relative APIRegistryURL")
	}
}

// TestCheckDomain_RoutesToAPIRegistryWhenEnabled — hard evidence bahwa
// switch benar-benar re-route request ke endpoint api-registry (bukan
// registrar-api PANDI).
func TestCheckDomain_RoutesToAPIRegistryWhenEnabled(t *testing.T) {
	// Mock api-registry service — respond dengan shape { data: {...} }.
	apiRegistryHits := 0
	apiRegistrySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiRegistryHits++
		if r.URL.Path != "/v1/domains/check" {
			t.Errorf("api-registry: expected /v1/domains/check, got %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("api-registry: expected POST, got %s", r.Method)
		}
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["domain"] != "myshop.id" {
			t.Errorf("api-registry: body.domain = %v, want myshop.id", body["domain"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"query":"myshop.id","allowed_zones":["id"],"results":[{"domain":"myshop.id","tld":"id","available":true}]}}`))
	}))
	defer apiRegistrySrv.Close()

	// Legacy registrar-api mock — MUST NOT be called.
	legacyHits := 0
	legacySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		legacyHits++
		t.Errorf("legacy registrar-api hit unexpectedly: %s %s", r.Method, r.URL.Path)
	}))
	defer legacySrv.Close()

	c, err := New(Config{
		BaseURL:        legacySrv.URL,
		APIKey:         "legacy-token",
		APIRegistryURL: apiRegistrySrv.URL,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	res, err := c.CheckDomain(context.Background(), "myshop.id")
	if err != nil {
		t.Fatalf("CheckDomain: %v", err)
	}
	if apiRegistryHits != 1 {
		t.Errorf("api-registry expected 1 hit, got %d", apiRegistryHits)
	}
	if legacyHits != 0 {
		t.Errorf("legacy registrar-api expected 0 hits, got %d", legacyHits)
	}
	if res.Query != "myshop.id" || len(res.Results) != 1 || !res.Results[0].Available {
		t.Errorf("unexpected response shape: %+v", res)
	}
	// Price + Zone harus nil (api-registry tidak expose per arsitektur).
	if res.Results[0].Price != nil || res.Results[0].Zone != nil {
		t.Errorf("api-registry route should not populate Price/Zone (enrich di web builder); got %+v", res.Results[0])
	}
}

// TestCheckDomain_LegacyModeUnchanged — kalau APIRegistryURL kosong,
// behavior identik dengan sebelum Fase 1c.
func TestCheckDomain_LegacyModeUnchanged(t *testing.T) {
	legacyHits := 0
	legacySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		legacyHits++
		if r.URL.Path != "/v1/api/user/reseller/domain/check" {
			t.Errorf("legacy: expected reseller domain check path, got %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"query":"myshop.id","allowed_zones":["id"],"results":[{"domain":"myshop.id","tld":"id","available":true}]}}`))
	}))
	defer legacySrv.Close()

	c, err := New(Config{
		BaseURL: legacySrv.URL,
		APIKey:  "legacy-token",
		// APIRegistryURL sengaja kosong.
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := c.CheckDomain(context.Background(), "myshop.id"); err != nil {
		t.Fatalf("CheckDomain: %v", err)
	}
	if legacyHits != 1 {
		t.Errorf("legacy expected 1 hit, got %d", legacyHits)
	}
}

// TestWhois_RoutesToAPIRegistryWhenEnabled — Whois pindah endpoint saat flag on.
func TestWhois_RoutesToAPIRegistryWhenEnabled(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.URL.Path != "/v1/whois" {
			t.Errorf("expected /v1/whois, got %s", r.URL.Path)
		}
		if r.URL.Query().Get("domain") != "myshop.id" {
			t.Errorf("expected ?domain=myshop.id, got %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"domain":"myshop.id","status":"clientTransferProhibited","registrar":"PANDI","created_at":"2020-01-15T10:00:00Z","expires_at":"2030-01-15T10:00:00Z","owner_masked":"Bu***an"}}`))
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: "http://legacy-unused.local", APIRegistryURL: srv.URL})
	res, err := c.Whois(context.Background(), "myshop.id")
	if err != nil {
		t.Fatalf("Whois: %v", err)
	}
	if hits != 1 {
		t.Errorf("expected 1 hit, got %d", hits)
	}
	if res == nil || res.Domain != "myshop.id" || res.Registrar != "PANDI" || res.OwnerMasked != "Bu***an" {
		t.Errorf("unexpected shape: %+v", res)
	}
}

// TestWhois_AvailableReturnsNil — konvention lama: kalau domain available
// (belum registered), return nil (bukan Whois populated dengan status=available).
func TestWhois_AvailableReturnsNil(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"domain":"free.id","status":"available"}}`))
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: "http://legacy-unused.local", APIRegistryURL: srv.URL})
	res, err := c.Whois(context.Background(), "free.id")
	if err != nil {
		t.Fatalf("Whois: %v", err)
	}
	if res != nil {
		t.Errorf("available domain should return nil, got %+v", res)
	}
}

// TestGetNameservers_RoutesToAPIRegistryWhenEnabled — GET NS pindah endpoint.
func TestGetNameservers_RoutesToAPIRegistryWhenEnabled(t *testing.T) {
	hits := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.Method != http.MethodGet || r.URL.Path != "/v1/domains/myshop.id/nameservers" {
			t.Errorf("expected GET /v1/domains/myshop.id/nameservers, got %s %s", r.Method, r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"domain":"myshop.id","nameservers":["ns1.pandi.id","ns2.pandi.id"]}}`))
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: "http://legacy-unused.local", APIRegistryURL: srv.URL})
	res, err := c.GetNameservers(context.Background(), "myshop.id")
	if err != nil {
		t.Fatalf("GetNameservers: %v", err)
	}
	if hits != 1 {
		t.Errorf("expected 1 hit, got %d", hits)
	}
	if res.Domain != "myshop.id" || len(res.Nameservers) != 2 {
		t.Errorf("unexpected shape: %+v", res)
	}
}

// TestUpdateNameservers_RoutesToAPIRegistryWhenEnabled — POST NS body diteruskan.
func TestUpdateNameservers_RoutesToAPIRegistryWhenEnabled(t *testing.T) {
	hits := 0
	var receivedNS []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		if r.Method != http.MethodPost || r.URL.Path != "/v1/domains/myshop.id/nameservers" {
			t.Errorf("expected POST /v1/domains/myshop.id/nameservers, got %s %s", r.Method, r.URL.Path)
		}
		var body map[string][]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		receivedNS = body["nameservers"]
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"domain":"myshop.id","nameservers":["ns1.example.com","ns2.example.com"]}}`))
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: "http://legacy-unused.local", APIRegistryURL: srv.URL})
	res, err := c.UpdateNameservers(context.Background(), "myshop.id", []string{"ns1.example.com", "ns2.example.com"})
	if err != nil {
		t.Fatalf("UpdateNameservers: %v", err)
	}
	if hits != 1 {
		t.Errorf("expected 1 hit, got %d", hits)
	}
	if len(receivedNS) != 2 || receivedNS[0] != "ns1.example.com" {
		t.Errorf("body NS not forwarded correctly: %v", receivedNS)
	}
	if len(res.Nameservers) != 2 {
		t.Errorf("response NS: %+v", res)
	}
}

// TestCheckDomain_APIRegistryErrorTranslated — kalau api-registry return
// error envelope, consumer harus tetap dapat *APIError yang bisa di-pattern-
// match (bukan raw apiregistry.APIError yang caller belum tahu).
func TestCheckDomain_APIRegistryErrorTranslated(t *testing.T) {
	apiRegistrySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"code":"invalid_domain","message":"domain tidak valid"}}`))
	}))
	defer apiRegistrySrv.Close()

	c, _ := New(Config{
		BaseURL:        "http://legacy-unused.local",
		APIRegistryURL: apiRegistrySrv.URL,
	})
	_, err := c.CheckDomain(context.Background(), "myshop.id")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	var ae *APIError
	if !errors.As(err, &ae) {
		t.Fatalf("expected *registrar.APIError, got %T: %v", err, err)
	}
	if ae.Status != http.StatusBadRequest {
		t.Errorf("APIError.Status = %d, want 400", ae.Status)
	}
	if ae.Code != "invalid_domain" {
		t.Errorf("APIError.Code = %q, want invalid_domain", ae.Code)
	}
	if !strings.Contains(ae.Msg, "domain tidak valid") {
		t.Errorf("APIError.Msg = %q, missing upstream message", ae.Msg)
	}
}
