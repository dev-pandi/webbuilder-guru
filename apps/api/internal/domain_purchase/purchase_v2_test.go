package domain_purchase

import (
	"testing"
)

// Pure-function tests. Full PurchaseV2 flow butuh registrar+repo+users+
// invoices+gateway wired — di-cover di integration test consumer.

func TestExtractTLD(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"myshop.id", "id"},
		{"myshop.co.id", "co.id"},
		{"deep.sub.example.com", "sub.example.com"},
		{"no-tld", ""},
		{"", ""},
	}
	for _, tc := range cases {
		if got := extractTLD(tc.in); got != tc.want {
			t.Errorf("extractTLD(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
