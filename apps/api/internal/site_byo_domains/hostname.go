// Package site_byo_domains manages BYO (bring-your-own) .id domains attached
// to a site via Cloudflare nameserver delegation.
package site_byo_domains

import (
	"strings"
)

// idSecondLevelSuffixes — second-level TLDs under .id that are themselves
// registrable "roots" (apex) in user eyes. Any hostname that is apex is
// either `foo.id` (one dot) or `foo.<2ld>.id` (two dots with 2ld in this set).
//
// Source: PANDI registration policy. Kept small on purpose — add only when
// PANDI publishes a new 2LD. Beats pulling in the full Public Suffix List
// (go-publicsuffix pulls Mozilla PSL blob at ~50KB) for a BYO flow that
// explicitly only supports .id.
var idSecondLevelSuffixes = map[string]struct{}{
	"co.id":     {},
	"ac.id":     {},
	"sch.id":    {},
	"go.id":     {},
	"mil.id":    {},
	"net.id":    {},
	"or.id":     {},
	"web.id":    {},
	"biz.id":    {},
	"my.id":     {},
	"desa.id":   {},
	"ponpes.id": {},
}

// NormalizeHostname strips protocol prefixes, www., trailing dots, and
// uppercases users accidentally paste.
func NormalizeHostname(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ToLower(s)
	for _, p := range []string{"https://", "http://"} {
		if strings.HasPrefix(s, p) {
			s = s[len(p):]
		}
	}
	if i := strings.IndexAny(s, "/?#"); i >= 0 {
		s = s[:i]
	}
	s = strings.TrimPrefix(s, "www.")
	s = strings.TrimSuffix(s, ".")
	return s
}

// HostnameError is a stable code the handler can map to error responses.
type HostnameError string

const (
	ErrHostnameEmpty       HostnameError = "hostname_empty"
	ErrHostnameFormat      HostnameError = "invalid_hostname"
	ErrHostnameTooLong     HostnameError = "hostname_too_long"
	ErrNotID               HostnameError = "tld_not_supported"
	ErrSubdomainNotAllowed HostnameError = "subdomain_not_allowed"
)

func (e HostnameError) Error() string { return string(e) }

// ValidateApexID enforces:
//   - well-formed DNS hostname (RFC-ish subset: a-z0-9-, labels 1-63, total ≤253)
//   - TLD is .id
//   - hostname is the APEX for its registration (no subdomain)
//
// Examples:
//
//	toko.id       → ok
//	toko.co.id    → ok (co.id is a known 2LD)
//	www.toko.id   → ErrSubdomainNotAllowed
//	shop.toko.co.id → ErrSubdomainNotAllowed
//	foo.com       → ErrNotID
func ValidateApexID(host string) error {
	if host == "" {
		return ErrHostnameEmpty
	}
	if len(host) > 253 {
		return ErrHostnameTooLong
	}
	parts := strings.Split(host, ".")
	if len(parts) < 2 {
		return ErrHostnameFormat
	}
	for _, p := range parts {
		if !validLabel(p) {
			return ErrHostnameFormat
		}
	}
	if parts[len(parts)-1] != "id" {
		return ErrNotID
	}
	// Count what's "behind" the TLD. One label behind id → apex (toko.id).
	// Two labels behind id where the second is a known 2LD → apex (toko.co.id).
	// Anything else → subdomain.
	switch len(parts) {
	case 2:
		return nil
	case 3:
		if _, ok := idSecondLevelSuffixes[parts[1]+".id"]; ok {
			return nil
		}
		return ErrSubdomainNotAllowed
	default:
		return ErrSubdomainNotAllowed
	}
}

func validLabel(s string) bool {
	if len(s) == 0 || len(s) > 63 {
		return false
	}
	if s[0] == '-' || s[len(s)-1] == '-' {
		return false
	}
	for _, r := range s {
		if !(r == '-' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z')) {
			return false
		}
	}
	return true
}

// NSOverlap reports whether any nameserver in `resolved` is present in
// `assigned` (case-insensitive, trailing-dot stripped).
func NSOverlap(resolved, assigned []string) bool {
	norm := func(s string) string {
		return strings.ToLower(strings.TrimSuffix(strings.TrimSpace(s), "."))
	}
	want := make(map[string]struct{}, len(assigned))
	for _, ns := range assigned {
		want[norm(ns)] = struct{}{}
	}
	for _, ns := range resolved {
		if _, ok := want[norm(ns)]; ok {
			return true
		}
	}
	return false
}
