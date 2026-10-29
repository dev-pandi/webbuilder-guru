package litera

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// stubConfig — isi cache ConfigRepo langsung supaya client bisa dites tanpa
// pool Postgres (Get() short-circuit selama cache belum expired).
func stubConfig(baseURL string) *ConfigRepo {
	return &ConfigRepo{
		cached:   &Config{APIKey: "k", BaseURL: baseURL, Enabled: true},
		cachedAt: time.Now(),
		cacheTTL: time.Minute,
	}
}

// Litera balas 202 saat intent dibuat tapi belum di-mint admin. Itu sukses,
// bukan gagal — regresi ini bikin artikel tercatat "Gagal" di admin padahal
// sudah terdaftar.
func TestRegister_202IsSuccess(t *testing.T) {
	body := `{"success":true,"data":{"created":true,"intent":{"id":"intent-123",` +
		`"articleUrl":"https://guru.id/cerita/x","title":"X","status":"REGISTERED"},` +
		`"embedCode":"<div id=\"litera\"></div>"},"meta":{"correlationId":"corr-1"}}`

	for _, code := range []int{http.StatusOK, http.StatusCreated, http.StatusAccepted} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(code)
			_, _ = w.Write([]byte(body))
		}))

		out, err := NewClient(stubConfig(srv.URL), nil).
			Register(context.Background(), RegisterRequest{Title: "X"})
		if err != nil {
			t.Fatalf("status %d: mau sukses, dapat error: %v", code, err)
		}
		if out.Data.Intent.ID != "intent-123" {
			t.Errorf("status %d: intent id = %q, mau intent-123", code, out.Data.Intent.ID)
		}
		if out.Data.Intent.Status != "REGISTERED" {
			t.Errorf("status %d: intent status = %q, mau REGISTERED", code, out.Data.Intent.Status)
		}
		srv.Close()
	}
}

// Jangan sampai pelonggaran 202 ikut meloloskan status gagal yang sebenarnya.
func TestRegister_ErrorStatusesStillFail(t *testing.T) {
	cases := []struct {
		code     int
		sentinel error
	}{
		{http.StatusForbidden, ErrDomainNotAllowed},
		{http.StatusTooManyRequests, ErrRateLimit},
		{http.StatusInternalServerError, nil},
		{http.StatusUnauthorized, nil},
	}
	for _, tc := range cases {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(tc.code)
			_, _ = w.Write([]byte(`{"success":false}`))
		}))

		_, err := NewClient(stubConfig(srv.URL), nil).
			Register(context.Background(), RegisterRequest{})
		if err == nil {
			t.Errorf("status %d: mau error, dapat nil", tc.code)
		}
		if tc.sentinel != nil && !errors.Is(err, tc.sentinel) {
			t.Errorf("status %d: mau sentinel %v, dapat %v", tc.code, tc.sentinel, err)
		}
		srv.Close()
	}
}
