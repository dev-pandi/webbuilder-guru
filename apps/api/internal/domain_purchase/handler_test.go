package domain_purchase

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
)

func TestIsTerminal(t *testing.T) {
	cases := map[string]bool{
		StatusActive:              true,
		StatusFailed:              true,
		StatusExpired:             true,
		StatusCancelled:           true,
		StatusPendingPayment:      false,
		StatusPendingDocument:     false,
		StatusPendingProvisioning: false,
		"":                        false,
		"unknown":                 false,
	}
	for status, want := range cases {
		if got := IsTerminal(status); got != want {
			t.Errorf("IsTerminal(%q) = %v, want %v", status, got, want)
		}
	}
}

func TestMissingProfileFields(t *testing.T) {
	cases := []struct {
		name string
		u    *auth.User
		want []string
	}{
		{
			name: "all present → empty",
			u: &auth.User{
				Name: "Budi", PhoneNumber: "+628123", Address: "Jl. Merdeka 1",
				City: "Jakarta", PostalCode: "12345",
			},
			want: nil,
		},
		{
			name: "all empty → 5 missing",
			u:    &auth.User{},
			want: []string{"nama", "nomor HP", "alamat", "kota", "kode pos"},
		},
		{
			name: "whitespace counts as empty",
			u: &auth.User{
				Name: "  ", PhoneNumber: "+628", Address: "\t",
				City: "Bandung", PostalCode: "\n",
			},
			want: []string{"nama", "alamat", "kode pos"},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := missingProfileFields(c.u)
			if !equalStringSlice(got, c.want) {
				t.Errorf("missing = %v, want %v", got, c.want)
			}
		})
	}
}

func TestVerifyHMAC(t *testing.T) {
	secret := "s3cret"
	body := []byte(`{"job_id":"abc","status":"active"}`)

	// Buat signature valid dulu.
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	validHex := hex.EncodeToString(mac.Sum(nil))

	cases := []struct {
		name   string
		secret string
		header string
		body   []byte
		want   bool
	}{
		{"valid signature", secret, "sha256=" + validHex, body, true},
		{"wrong secret", "other", "sha256=" + validHex, body, false},
		{"tampered body", secret, "sha256=" + validHex, []byte(`{"job_id":"tampered"}`), false},
		{"missing prefix", secret, validHex, body, false},
		{"non-hex signature", secret, "sha256=nothex!!", body, false},
		{"empty header", secret, "", body, false},
		{"empty body still verifiable", secret, "sha256=" + hexHMAC(secret, nil), nil, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := verifyHMAC(c.secret, c.header, c.body); got != c.want {
				t.Errorf("verifyHMAC = %v, want %v", got, c.want)
			}
		})
	}
}

func TestToResp(t *testing.T) {
	uid := uuid.New()
	exp := time.Date(2027, 3, 1, 10, 30, 0, 0, time.UTC)

	t.Run("with expiry", func(t *testing.T) {
		p := &Purchase{
			ID: uid, RegistrarJobID: "job-123", Domain: "myshop.id",
			Status: StatusActive, Kind: KindRegister, Reason: "",
			PaymentURL: "https://pay.example/xyz", ExpiresAt: &exp,
		}
		r := toResp(p)
		if r.JobID != "job-123" || r.Domain != "myshop.id" {
			t.Errorf("basic fields wrong: %+v", r)
		}
		if r.ExpiresAt != "2027-03-01T10:30:00Z" {
			t.Errorf("ExpiresAt = %q, want RFC3339 UTC", r.ExpiresAt)
		}
		if r.Kind != KindRegister {
			t.Errorf("Kind not propagated: %q", r.Kind)
		}
	})

	t.Run("nil expiry → empty string", func(t *testing.T) {
		p := &Purchase{RegistrarJobID: "j", Domain: "d", Status: StatusPendingPayment}
		r := toResp(p)
		if r.ExpiresAt != "" {
			t.Errorf("ExpiresAt should be empty when nil, got %q", r.ExpiresAt)
		}
	})
}

// --- helpers ---

func hexHMAC(secret string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

func equalStringSlice(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if strings.TrimSpace(a[i]) != strings.TrimSpace(b[i]) {
			return false
		}
	}
	return true
}
