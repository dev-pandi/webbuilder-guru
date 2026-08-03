package epp

import (
	"strings"
	"testing"
)

func TestParseWhois_NotFoundReturnsAvailable(t *testing.T) {
	cases := []string{
		"Domain not found",
		"No match for domain.id",
		"No data found",
		"NOT FOUND",
	}
	for _, resp := range cases {
		out := parseWhoisResponse("example.id", []byte(resp))
		if out.Status != "available" {
			t.Errorf("response %q should map ke 'available', got %q", resp, out.Status)
		}
	}
}

func TestParseWhois_RegisteredDomain(t *testing.T) {
	raw := `
% WHOIS server v1.0
Domain Name: myshop.id
Sponsoring Registrar: PANDI
Domain Status: clientTransferProhibited
Creation Date: 2020-01-15T10:00:00Z
Expiration Date: 2030-01-15T10:00:00Z
Registrant Name: Budi Setiawan
`
	out := parseWhoisResponse("myshop.id", []byte(raw))
	if out.Status != "clientTransferProhibited" {
		t.Errorf("status = %q", out.Status)
	}
	if out.Registrar != "PANDI" {
		t.Errorf("registrar = %q", out.Registrar)
	}
	if out.CreatedAt != "2020-01-15T10:00:00Z" {
		t.Errorf("createdAt = %q", out.CreatedAt)
	}
	if out.ExpiresAt != "2030-01-15T10:00:00Z" {
		t.Errorf("expiresAt = %q", out.ExpiresAt)
	}
	if !strings.HasPrefix(out.OwnerMasked, "Bu") || !strings.Contains(out.OwnerMasked, "***") {
		t.Errorf("owner tidak masked: %q", out.OwnerMasked)
	}
}

func TestParseWhois_IgnoresCommentsAndBlank(t *testing.T) {
	raw := `
% This is a comment
# Also a comment

Domain Name: test.id
Sponsoring Registrar: TestRegistrar
`
	out := parseWhoisResponse("test.id", []byte(raw))
	if out.Registrar != "TestRegistrar" {
		t.Errorf("registrar mismatch: %q", out.Registrar)
	}
}

func TestParseWhois_DefaultStatusRegistered(t *testing.T) {
	// Response with data but no status field.
	raw := `Domain Name: test.id
Sponsoring Registrar: X`
	out := parseWhoisResponse("test.id", []byte(raw))
	if out.Status != "registered" {
		t.Errorf("expected default 'registered', got %q", out.Status)
	}
}

func TestNormalizeWhoisKey(t *testing.T) {
	cases := []struct{ in, want string }{
		{"Sponsoring Registrar", "sponsoringregistrar"},
		{"Domain Name", "domainname"},
		{"Registry   Expiry   Date", "registryexpirydate"},
		{"", ""},
	}
	for _, tc := range cases {
		if got := normalizeWhoisKey(tc.in); got != tc.want {
			t.Errorf("normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSplitWhoisKV(t *testing.T) {
	k, v, ok := splitWhoisKV("Domain Name: myshop.id")
	if !ok || k != "Domain Name" || v != "myshop.id" {
		t.Errorf("split fail: k=%q v=%q ok=%v", k, v, ok)
	}
	// Handle colon in value.
	k, v, ok = splitWhoisKV("Creation Date: 2020-01-15T10:00:00Z")
	if !ok || k != "Creation Date" || v != "2020-01-15T10:00:00Z" {
		t.Errorf("colon-in-value fail: k=%q v=%q", k, v)
	}
	// No colon → not ok.
	_, _, ok = splitWhoisKV("no separator")
	if ok {
		t.Errorf("no-colon line should return ok=false")
	}
}

func TestMaskOwner(t *testing.T) {
	cases := []struct{ in, want string }{
		{"AB", "***"},
		{"ABC", "***"},
		{"ABCDE", "AB***"},
		{"Budi Setiawan", "Bu***an"},
	}
	for _, tc := range cases {
		if got := maskOwner(tc.in); got != tc.want {
			t.Errorf("maskOwner(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
