package settings

import (
	"testing"
	"time"
)

// Pure-function tests untuk parse helpers — tidak butuh DB.

func TestParseBool(t *testing.T) {
	cases := []struct {
		in  string
		def bool
		out bool
	}{
		{"true", false, true},
		{"TRUE", false, true},
		{"1", false, true},
		{"yes", false, true},
		{"on", false, true},
		{"false", true, false},
		{"0", true, false},
		{"no", true, false},
		{"off", true, false},
		{"", true, true},         // empty → default
		{"", false, false},       // empty → default
		{"gibberish", true, true}, // invalid → default
		{"  true  ", false, true}, // trims
	}
	for _, tc := range cases {
		if got := parseBool(tc.in, tc.def); got != tc.out {
			t.Errorf("parseBool(%q, %v) = %v, want %v", tc.in, tc.def, got, tc.out)
		}
	}
}

func TestParseFloat(t *testing.T) {
	cases := []struct {
		in  string
		def float64
		out float64
	}{
		{"0.11", 0.0, 0.11},
		{"1.5", 0.0, 1.5},
		{"  0.05  ", 0.0, 0.05},
		{"", 0.11, 0.11},
		{"gibberish", 0.11, 0.11},
		{"0", 0.11, 0.0},
	}
	for _, tc := range cases {
		if got := parseFloat(tc.in, tc.def); got != tc.out {
			t.Errorf("parseFloat(%q, %v) = %v, want %v", tc.in, tc.def, got, tc.out)
		}
	}
}

// Test defaults fallback — Service constructed dengan nil repo (unused
// karena test tidak hit DB path — hanya cek defaults map integrity).
func TestDefaults_AllKeysCovered(t *testing.T) {
	// Semua Key* constants harus punya entry di defaults map — cegah bug
	// dimana consumer request key yang tidak ada default → dapat ""
	// meskipun value semantik-nya harusnya non-empty (mis. PPN rate).
	required := []string{
		KeyPPNEnabled, KeyPPNRate, KeyPPNLabel,
		KeyBrandName, KeyBrandSupportEmail, KeyBrandSupportPhone,
		KeyBrandCompanyName, KeyBrandAddress, KeyBrandTaxID,
	}
	for _, k := range required {
		if _, ok := defaults[k]; !ok {
			t.Errorf("key %q tidak punya entry di defaults map", k)
		}
	}
}

// Cache invalidate test — pakai in-memory state langsung karena Service
// struct membolehkan manipulasi cache map dari dalam package.
func TestService_InvalidateClearsCachedEntry(t *testing.T) {
	// Konstruksi Service tanpa repo (nil-safe untuk invalidate ops).
	s := &Service{cache: map[string]cacheEntry{
		"x.y": {value: "cached", expires: farFuture()},
	}}
	s.Invalidate("x.y")
	if _, ok := s.cache["x.y"]; ok {
		t.Error("Invalidate should remove entry")
	}
}

func TestService_InvalidateAllFlushesCache(t *testing.T) {
	s := &Service{cache: map[string]cacheEntry{
		"a": {value: "1", expires: farFuture()},
		"b": {value: "2", expires: farFuture()},
	}}
	s.InvalidateAll()
	if len(s.cache) != 0 {
		t.Errorf("InvalidateAll should empty cache, got %d entries", len(s.cache))
	}
}

func farFuture() time.Time {
	return time.Now().Add(24 * time.Hour)
}
