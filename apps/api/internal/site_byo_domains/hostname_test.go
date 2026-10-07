package site_byo_domains

import "testing"

func TestNormalizeHostname(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"TOKO.ID", "toko.id"},
		{" toko.id ", "toko.id"},
		{"https://toko.id/", "toko.id"},
		{"http://www.toko.id", "toko.id"},
		{"www.Toko.id.", "toko.id"},
		{"toko.id/path?x=1", "toko.id"},
	}
	for _, c := range cases {
		got := NormalizeHostname(c.in)
		if got != c.want {
			t.Errorf("NormalizeHostname(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestValidateApexID(t *testing.T) {
	ok := []string{
		"toko.id",
		"a.id",
		"toko.co.id",
		"sekolah.sch.id",
		"brand.my.id",
		"warung.biz.id",
	}
	for _, h := range ok {
		if err := ValidateApexID(h); err != nil {
			t.Errorf("want ok for %q, got %v", h, err)
		}
	}

	notID := []string{"toko.com", "toko.net", "toko", "toko.co", "toko.id.xx"}
	for _, h := range notID {
		if err := ValidateApexID(h); err != ErrNotID && err != ErrHostnameFormat && err != ErrSubdomainNotAllowed {
			t.Errorf("want tld/format error for %q, got %v", h, err)
		}
	}

	subdomain := []string{
		"www.toko.id",
		"shop.toko.id",
		"api.toko.co.id",
		"deep.sub.toko.id",
	}
	for _, h := range subdomain {
		if err := ValidateApexID(h); err != ErrSubdomainNotAllowed {
			t.Errorf("want subdomain_not_allowed for %q, got %v", h, err)
		}
	}

	bad := []string{"", ".id", "-toko.id", "toko-.id", "to!ko.id", "to..id"}
	for _, h := range bad {
		if err := ValidateApexID(h); err == nil {
			t.Errorf("want format error for %q, got nil", h)
		}
	}
}

func TestNSOverlap(t *testing.T) {
	assigned := []string{"kate.ns.cloudflare.com", "theo.ns.cloudflare.com"}

	if !NSOverlap([]string{"kate.ns.cloudflare.com."}, assigned) {
		t.Error("case-insensitive + trailing-dot should match")
	}
	if !NSOverlap([]string{"KATE.NS.CLOUDFLARE.COM"}, assigned) {
		t.Error("uppercase should match")
	}
	if NSOverlap([]string{"ns1.registrar.co.id", "ns2.registrar.co.id"}, assigned) {
		t.Error("non-overlapping NS should return false")
	}
	if NSOverlap(nil, assigned) {
		t.Error("empty resolved should return false")
	}
	if NSOverlap([]string{"kate.ns.cloudflare.com"}, nil) {
		t.Error("empty assigned should return false")
	}
}
