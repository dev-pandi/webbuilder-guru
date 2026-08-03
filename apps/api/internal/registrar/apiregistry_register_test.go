package registrar

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestRegisterDomainDirect_RequiresAPIRegistry — kalau APIRegistryURL kosong,
// method harus reject dengan 501 supaya operator sadar mereka pakai legacy
// mode.
func TestRegisterDomainDirect_RequiresAPIRegistry(t *testing.T) {
	c, err := New(Config{BaseURL: "http://legacy.local"})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	_, err = c.RegisterDomainDirect(context.Background(), RegisterRequest{
		Domain: "test.id", Years: 1, ExternalUserID: "user-1",
	})
	if err == nil {
		t.Fatal("expected error tanpa API_REGISTRY_URL")
	}
	var ae *APIError
	if !errors.As(err, &ae) || ae.Status != 501 {
		t.Errorf("expected 501 APIError, got %v", err)
	}
	if !strings.Contains(ae.Code, "api_registry_not_configured") {
		t.Errorf("code = %q, expected api_registry_not_configured", ae.Code)
	}
}

// TestRegisterDomainDirect_RoutesToAPIRegistry — bukti hard bahwa
// method benar-benar hit /v1/domains/register di api-registry (bukan
// registrar-api PANDI), TANPA field payment_method/promo/document_ids.
func TestRegisterDomainDirect_RoutesToAPIRegistry(t *testing.T) {
	var receivedPath string
	var receivedBody []byte

	// Fake api-registry endpoint.
	apiRegistrySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		receivedBody, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"job_id":"epp_test_id_20260803120000","status":"active"}}`))
	}))
	defer apiRegistrySrv.Close()

	// Legacy — must NOT be hit.
	legacyHits := 0
	legacySrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		legacyHits++
		t.Errorf("legacy registrar-api hit unexpectedly: %s %s", r.Method, r.URL.Path)
	}))
	defer legacySrv.Close()

	c, err := New(Config{
		BaseURL:        legacySrv.URL,
		APIKey:         "legacy-jwt",
		APIRegistryURL: apiRegistrySrv.URL,
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	res, err := c.RegisterDomainDirect(context.Background(), RegisterRequest{
		Domain:         "myshop.id",
		Years:          2,
		ExternalUserID: "user-abc-def-ghi",
		IdempotencyKey: "idem-12345",
		Contact: Contact{
			Name:        "Budi Setiawan",
			Email:       "budi@example.com",
			Phone:       "08123456789",
			Address:     "Jl. Sudirman 1",
			City:        "Jakarta",
			PostalCode:  "10001",
			CountryCode: "ID",
			Nik:         "3201234567890001", // must NOT be forwarded
		},
		// Payment-related fields — must NOT be forwarded.
		PaymentMethod: "midtrans",
		ReturnURL:     "https://web.example.com",
		PromoCode:     "SUMMER50",
		DocumentIDs:   []uint64{1, 2, 3},
	})
	if err != nil {
		t.Fatalf("RegisterDomainDirect: %v", err)
	}
	if res.JobID == "" || res.Status != "active" {
		t.Errorf("unexpected response: %+v", res)
	}
	if legacyHits != 0 {
		t.Errorf("legacy hit %d times — should be 0", legacyHits)
	}
	if receivedPath != "/v1/domains/register" {
		t.Errorf("expected /v1/domains/register, got %q", receivedPath)
	}

	// Verify body: payment fields + NIK must NOT be present.
	bodyStr := string(receivedBody)
	forbidden := []string{"payment_method", "return_url", "promo_code", "document_ids", "midtrans", "SUMMER50", "3201234567890001"}
	for _, f := range forbidden {
		if strings.Contains(bodyStr, f) {
			t.Errorf("body leaked forbidden field %q: %s", f, bodyStr)
		}
	}
	// Verify body: required fields present.
	var body map[string]any
	if err := json.Unmarshal(receivedBody, &body); err != nil {
		t.Fatalf("unmarshal body: %v", err)
	}
	if body["domain"] != "myshop.id" {
		t.Errorf("domain = %v", body["domain"])
	}
	// Years JSON number → float64.
	if body["years"].(float64) != 2 {
		t.Errorf("years = %v", body["years"])
	}
	if body["external_user_id"] != "user-abc-def-ghi" {
		t.Errorf("external_user_id = %v", body["external_user_id"])
	}
	if body["idempotency_key"] != "idem-12345" {
		t.Errorf("idempotency_key = %v", body["idempotency_key"])
	}
	// Contact hadir tapi tanpa nik.
	contact, ok := body["contact"].(map[string]any)
	if !ok {
		t.Fatalf("contact not object: %v", body["contact"])
	}
	if contact["name"] != "Budi Setiawan" {
		t.Errorf("contact.name = %v", contact["name"])
	}
	if _, hasNik := contact["nik"]; hasNik {
		t.Errorf("contact.nik should NOT be in body")
	}
}

func TestRegisterDomainDirect_ValidatesInput(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: srv.URL, APIRegistryURL: srv.URL})

	cases := []struct {
		name string
		req  RegisterRequest
	}{
		{"empty domain", RegisterRequest{Years: 1, ExternalUserID: "u"}},
		{"years 0", RegisterRequest{Domain: "x.id", ExternalUserID: "u"}},
		{"empty external user id", RegisterRequest{Domain: "x.id", Years: 1}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := c.RegisterDomainDirect(context.Background(), tc.req); err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestRenewDomainDirect_RoutesAndValidates(t *testing.T) {
	var receivedPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"job_id":"epp_renew_test_id_20260803120000","status":"active"}}`))
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: "http://legacy-unused.local", APIRegistryURL: srv.URL})

	res, err := c.RenewDomainDirect(context.Background(), "myshop.id", RenewRequest{
		Years: 1, IdempotencyKey: "renew-idem", ExternalUserID: "user-x",
	})
	if err != nil {
		t.Fatalf("RenewDomainDirect: %v", err)
	}
	if res.Status != "active" {
		t.Errorf("status = %q", res.Status)
	}
	if !strings.Contains(receivedPath, "/renew") {
		t.Errorf("path = %q, expected .../renew", receivedPath)
	}

	// Invalid input — empty domain / years 0.
	if _, err := c.RenewDomainDirect(context.Background(), "", RenewRequest{Years: 1}); err == nil {
		t.Error("expected error for empty domain")
	}
	if _, err := c.RenewDomainDirect(context.Background(), "x.id", RenewRequest{Years: 0}); err == nil {
		t.Error("expected error for years=0")
	}
}

func TestRenewDomainDirect_RequiresAPIRegistry(t *testing.T) {
	c, _ := New(Config{BaseURL: "http://legacy.local"})
	_, err := c.RenewDomainDirect(context.Background(), "test.id", RenewRequest{Years: 1})
	if err == nil {
		t.Fatal("expected error tanpa API_REGISTRY_URL")
	}
}
