package domain_purchase

import (
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
