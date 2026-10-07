package epp

import (
	"testing"
)

func TestTldOf(t *testing.T) {
	cases := []struct{ in, want string }{
		{"myshop.id", "id"},
		{"myshop.co.id", "co.id"},
		{"a.b.c.d", "b.c.d"},
		{"no-tld", ""},
		{"", ""},
	}
	for _, tc := range cases {
		if got := tldOf(tc.in); got != tc.want {
			t.Errorf("tldOf(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSetOf_NormalizesToLower(t *testing.T) {
	s := setOf([]string{"Ns1.Example.com", "ns2.example.com", "  NS3.example.COM  "})
	if len(s) != 3 {
		t.Errorf("expected 3 unique, got %d", len(s))
	}
	if !s["ns1.example.com"] || !s["ns2.example.com"] || !s["ns3.example.com"] {
		t.Errorf("set membership fail: %v", s)
	}
}

// Trailing-dot form (DNS wire format) harus di-normalize ke tanpa-dot supaya
// cocok dengan EPP registry representation. Jarang-handle bug ini bikin
// domain:update hostObj kena 2303 "object does not exist" padahal host ada.
func TestSetOf_StripsTrailingDot(t *testing.T) {
	s := setOf([]string{"candra.ns.dnscloud.id.", "DEWI.ns.dnscloud.id.", "ns3.example.com"})
	if len(s) != 3 {
		t.Errorf("expected 3 unique, got %d: %v", len(s), s)
	}
	for _, want := range []string{"candra.ns.dnscloud.id", "dewi.ns.dnscloud.id", "ns3.example.com"} {
		if !s[want] {
			t.Errorf("missing normalized key %q in %v", want, s)
		}
	}
	// Pastikan form dengan dot TIDAK ada.
	if s["candra.ns.dnscloud.id."] {
		t.Error("set should not contain trailing-dot form")
	}
}

// Empty string + whitespace-only harus di-skip, bukan masuk sebagai "" key.
func TestSetOf_SkipsEmpty(t *testing.T) {
	s := setOf([]string{"ns1.example.com", "", "  ", "."})
	if len(s) != 1 {
		t.Errorf("expected 1 unique (empty skipped), got %d: %v", len(s), s)
	}
}

func TestJoinStatuses(t *testing.T) {
	if joinStatuses(nil) != "unknown" {
		t.Errorf("empty should be 'unknown'")
	}
	if joinStatuses([]string{"ok"}) != "ok" {
		t.Errorf("single mismatch")
	}
	if joinStatuses([]string{"ok", "serverHold"}) != "ok,serverHold" {
		t.Errorf("multi mismatch")
	}
}

func TestContactHandleFromID_Deterministic(t *testing.T) {
	h1 := contactHandleFromID(42)
	h2 := contactHandleFromID(42)
	if h1 != h2 {
		t.Errorf("same ID should produce same handle: %s vs %s", h1, h2)
	}
	if len(h1) != 16 {
		t.Errorf("handle length = %d, expected 16 (PANDI max)", len(h1))
	}
	if h1[:2] != "WB" {
		t.Errorf("handle should start with WB, got %s", h1[:2])
	}
}

func TestContactHandleFromID_Uniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := uint64(1); i <= 100; i++ {
		h := contactHandleFromID(i)
		if seen[h] {
			t.Errorf("collision at id=%d handle=%s", i, h)
		}
		seen[h] = true
	}
}

func TestIdFromContactHandle_Roundtrip(t *testing.T) {
	original := uint64(0xdeadbeef)
	handle := contactHandleFromID(original)
	got := idFromContactHandle(handle)
	if got != original {
		t.Errorf("roundtrip fail: original=%d handle=%s got=%d", original, handle, got)
	}
}

func TestIdFromContactHandle_InvalidReturns0(t *testing.T) {
	cases := []string{"", "short", "WB", "WBnotHex1234567", "PANDI-42"}
	for _, tc := range cases {
		if got := idFromContactHandle(tc); got != 0 {
			t.Errorf("invalid handle %q should return 0, got %d", tc, got)
		}
	}
}

func TestJobIDForRegister(t *testing.T) {
	got := jobIDForRegister("myshop.co.id", "20260731120000")
	want := "epp_myshop_co_id_20260731120000"
	if got != want {
		t.Errorf("jobIDForRegister = %q, want %q", got, want)
	}
}

func TestJobIDForRenew(t *testing.T) {
	got := jobIDForRenew("myshop.id", "20260731120000")
	want := "epp_renew_myshop_id_20260731120000"
	if got != want {
		t.Errorf("jobIDForRenew = %q, want %q", got, want)
	}
}

func TestExtractDomainFromJobID(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"epp_myshop_id_20260731120000", "myshop.id"},
		{"epp_renew_myshop_co_id_20260731120000", "myshop.co.id"},
		{"epp_bad_format", "bad.format"},
		{"invalid_prefix", ""},
		{"", ""},
	}
	for _, tc := range cases {
		if got := extractDomainFromJobID(tc.in); got != tc.want {
			t.Errorf("extractDomainFromJobID(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
