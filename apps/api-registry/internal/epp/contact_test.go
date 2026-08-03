package epp

import (
	"strings"
	"testing"
)

func TestStreetLines_EmptyBoth(t *testing.T) {
	lines := streetLines("", "")
	if len(lines) != 1 || lines[0] != "(no address)" {
		t.Errorf("empty both should fallback ke '(no address)', got %v", lines)
	}
}

func TestStreetLines_AddressOnly(t *testing.T) {
	lines := streetLines("Jl. Sudirman No. 1", "")
	if len(lines) != 1 || lines[0] != "Jl. Sudirman No. 1" {
		t.Errorf("address only: got %v", lines)
	}
}

func TestStreetLines_NIKOnly(t *testing.T) {
	lines := streetLines("", "3201234567890001")
	if len(lines) != 1 || lines[0] != "NIK:3201234567890001" {
		t.Errorf("NIK only: got %v", lines)
	}
}

func TestStreetLines_AddressAndNIK(t *testing.T) {
	lines := streetLines("Jl. Sudirman No. 1", "3201234567890001")
	if len(lines) != 2 || lines[0] != "Jl. Sudirman No. 1" || lines[1] != "NIK:3201234567890001" {
		t.Errorf("addr+NIK: got %v", lines)
	}
}

func TestStreetLines_MultiLineAddressAndNIK(t *testing.T) {
	// 2-line address + NIK → NIK harusnya di baris ke-3, dan reader
	// harus scan semua baris (bukan cuma index 1).
	lines := streetLines("Jl. Sudirman No. 1\nRT 05 RW 03", "3201234567890001")
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines, got %d: %v", len(lines), lines)
	}
	if lines[2] != "NIK:3201234567890001" {
		t.Errorf("NIK should be at index 2, got %v", lines)
	}
}

func TestStreetLines_AddressCappedAt2Lines(t *testing.T) {
	// Address 4 lines → cap ke 2 supaya NIK dapat slot.
	lines := streetLines("A\nB\nC\nD", "NIKX")
	// Expect: 2 address + 1 NIK.
	if len(lines) != 3 {
		t.Fatalf("expected 3 lines (2 addr + 1 NIK), got %d: %v", len(lines), lines)
	}
	if lines[0] != "A" || lines[1] != "B" || lines[2] != "NIK:NIKX" {
		t.Errorf("cap wrong: got %v", lines)
	}
}

// Simulate roundtrip: streetLines → parse back → NIK & address must be recoverable
// regardless of where NIK ended up in the array.
func TestStreetLines_RoundtripRecoversNIK(t *testing.T) {
	cases := []struct {
		address, nik string
	}{
		{"Jl. Sudirman No. 1", "3201234567890001"},
		{"Jl. Sudirman No. 1\nRT 05 RW 03", "3201234567890001"}, // NIK at index 2
		{"", "3201234567890001"},                                 // NIK at index 0
		{"single line", ""},                                      // no NIK
	}
	for _, tc := range cases {
		street := streetLines(tc.address, tc.nik)
		// Recovery logic mirror ke getContactByHandle.
		var addrLines []string
		var recoveredNIK string
		for _, s := range street {
			if strings.HasPrefix(s, "NIK:") {
				recoveredNIK = strings.TrimPrefix(s, "NIK:")
				continue
			}
			if s != "" && s != "(no address)" {
				addrLines = append(addrLines, s)
			}
		}
		recoveredAddr := strings.Join(addrLines, "\n")

		if recoveredNIK != tc.nik {
			t.Errorf("NIK roundtrip fail: input=%q recovered=%q (street=%v)", tc.nik, recoveredNIK, street)
		}
		// Address roundtrip: strip trailing empty lines; only compare non-empty user input.
		if tc.address != "" && !strings.Contains(recoveredAddr, strings.Split(tc.address, "\n")[0]) {
			t.Errorf("address roundtrip fail: input=%q recovered=%q", tc.address, recoveredAddr)
		}
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
