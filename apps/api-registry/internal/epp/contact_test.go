package epp

import (
	"strings"
	"testing"
)

func TestStreetLines_Empty(t *testing.T) {
	lines := streetLines("")
	if len(lines) != 1 || lines[0] != "(no address)" {
		t.Errorf("empty should fallback ke '(no address)', got %v", lines)
	}
}

func TestStreetLines_SingleLine(t *testing.T) {
	lines := streetLines("Jl. Sudirman No. 1")
	if len(lines) != 1 || lines[0] != "Jl. Sudirman No. 1" {
		t.Errorf("single line: got %v", lines)
	}
}

func TestStreetLines_MultiLine(t *testing.T) {
	lines := streetLines("Jl. Sudirman No. 1\nRT 05 RW 03\nJakarta")
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d: %v", len(lines), lines)
	}
	if lines[0] != "Jl. Sudirman No. 1" || lines[1] != "RT 05 RW 03" || lines[2] != "Jakarta" {
		t.Errorf("multi-line mismatch: %v", lines)
	}
}

func TestStreetLines_CappedAt3Lines(t *testing.T) {
	// RFC max 3 street lines — extras di-drop.
	lines := streetLines("A\nB\nC\nD\nE")
	if len(lines) != 3 {
		t.Fatalf("expected cap at 3 lines, got %d: %v", len(lines), lines)
	}
	if lines[0] != "A" || lines[1] != "B" || lines[2] != "C" {
		t.Errorf("cap wrong: got %v", lines)
	}
}

func TestStreetLines_StripsBlankLines(t *testing.T) {
	// Blank lines in the middle should be dropped, not counted.
	lines := streetLines("Line1\n\n\nLine2")
	if len(lines) != 2 || lines[0] != "Line1" || lines[1] != "Line2" {
		t.Errorf("blank strip fail: %v", lines)
	}
}

func TestNormalizePhoneE164(t *testing.T) {
	cases := []struct{ in, want string }{
		{"", ""},
		{"08123456789", "+628123456789"}, // ID mobile local → +62 prefix
		{"628123456789", "+628123456789"},
		{"+628123456789", "+628123456789"},
		{"+1 555-123-4567", "+15551234567"}, // strip spaces/dashes
		{"  0812 3456 789  ", "+628123456789"},
		{"5551234", "+5551234"}, // fallback: assume international
	}
	for _, tc := range cases {
		if got := normalizePhoneE164(tc.in); got != tc.want {
			t.Errorf("normalizePhoneE164(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestDefaultAuthInfo_Deterministic(t *testing.T) {
	if defaultAuthInfo("WB0000000000002a") != "WB0000000000002a-authinfo" {
		t.Errorf("authInfo mismatch")
	}
	// Same handle → same authInfo (deterministic supaya re-create idempotent).
	if defaultAuthInfo("X") != defaultAuthInfo("X") {
		t.Errorf("authInfo should be deterministic")
	}
}

func TestDeriveHandleFromExternalID_StripsUUIDDashes(t *testing.T) {
	uuid := "550e8400-e29b-41d4-a716-446655440000"
	h, err := deriveHandleFromExternalID(uuid)
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if len(h) != 16 || h[:2] != "WB" {
		t.Errorf("handle format wrong: %q", h)
	}
	if strings.Contains(h, "-") {
		t.Errorf("handle harus tanpa dash, got %q", h)
	}
}

func TestDeriveHandleFromExternalID_TooShort(t *testing.T) {
	if _, err := deriveHandleFromExternalID("abc"); err == nil {
		t.Errorf("short input should error")
	}
	if _, err := deriveHandleFromExternalID(""); err == nil {
		t.Errorf("empty input should error")
	}
	if _, err := deriveHandleFromExternalID("   "); err == nil {
		t.Errorf("whitespace-only input should error")
	}
}
