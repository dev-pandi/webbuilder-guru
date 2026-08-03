package payments

import (
	"encoding/json"
	"strings"
	"testing"
)

// Pure-function tests untuk mask + validation logic — no DB.

func TestValidType(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		{"gateway", true},
		{"manual", true},
		{"wallet", true},
		{"", false},
		{"Gateway", false}, // case-sensitive
		{"random", false},
	}
	for _, tc := range cases {
		if got := validType(tc.in); got != tc.want {
			t.Errorf("validType(%q) = %v, want %v", tc.in, got, tc.want)
		}
	}
}

func TestMaskCredentials_Midtrans(t *testing.T) {
	// Midtrans config: server_key + client_key harus di-mask, snap_url +
	// is_production tetap plaintext.
	cfg := json.RawMessage(`{"server_key":"SB-Mid-server-xxx","client_key":"SB-Mid-client-yyy","is_production":false,"snap_url":"https://app.sandbox.midtrans.com/snap/snap.js"}`)
	masked := maskCredentials(CodeMidtrans, cfg)

	var got map[string]any
	if err := json.Unmarshal(masked, &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got["server_key"] != "***" {
		t.Errorf("server_key not masked: %v", got["server_key"])
	}
	if got["client_key"] != "***" {
		t.Errorf("client_key not masked: %v", got["client_key"])
	}
	if got["snap_url"] != "https://app.sandbox.midtrans.com/snap/snap.js" {
		t.Errorf("snap_url should be plaintext, got: %v", got["snap_url"])
	}
	// is_production is JSON bool → decoded ke bool, bukan string.
	if got["is_production"] != false {
		t.Errorf("is_production should be plaintext bool false, got: %v (%T)", got["is_production"], got["is_production"])
	}
}

func TestMaskCredentials_Paylabs(t *testing.T) {
	cfg := json.RawMessage(`{"merchant_id":"MC-123","api_key":"secret-xxx","endpoint":"https://api.paylabs.co.id/v1"}`)
	masked := maskCredentials(CodePaylabs, cfg)

	if !strings.Contains(string(masked), `"api_key":"***"`) {
		t.Errorf("api_key not masked: %s", masked)
	}
	if !strings.Contains(string(masked), `"merchant_id":"***"`) {
		t.Errorf("merchant_id not masked: %s", masked)
	}
	if !strings.Contains(string(masked), `"endpoint":"https://api.paylabs.co.id/v1"`) {
		t.Errorf("endpoint should be plaintext: %s", masked)
	}
}

func TestMaskCredentials_ManualBank_NoMask(t *testing.T) {
	// Manual bank tidak punya credential — bank list + instructions tetap plaintext.
	cfg := json.RawMessage(`{"banks":[{"name":"BCA","account_number":"1234567890","account_holder":"PT Web Builder"}],"instructions_md":"Silakan transfer ke rekening berikut."}`)
	masked := maskCredentials(CodeManualBank, cfg)
	if string(masked) != string(cfg) {
		t.Errorf("manual_bank should pass through unchanged, got: %s", masked)
	}
}

func TestMaskCredentials_UnknownCode_NoMask(t *testing.T) {
	// Custom gateway yang tidak dikenal — pass through unchanged.
	cfg := json.RawMessage(`{"whatever":"value"}`)
	masked := maskCredentials("custom_unknown", cfg)
	if string(masked) != string(cfg) {
		t.Errorf("unknown code should pass through, got: %s", masked)
	}
}

func TestMaskCredentials_InvalidJSON_ReturnsAsIs(t *testing.T) {
	// Broken JSON → don't panic, return as-is (caller decide handling).
	broken := json.RawMessage(`{not valid`)
	got := maskCredentials(CodeMidtrans, broken)
	if string(got) != string(broken) {
		t.Errorf("invalid JSON should be returned as-is")
	}
}
