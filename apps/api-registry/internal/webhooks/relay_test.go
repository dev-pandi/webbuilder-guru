package webhooks

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func TestVerifyUpstream_MatchesRegistrarSignature(t *testing.T) {
	secret := "shared-registrar-secret"
	body := []byte(`{"event_id":"evt-1","job_id":"job-1","status":"active"}`)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	r := NewRelay(Config{UpstreamSecret: secret})
	if err := r.VerifyUpstream(sig, "", body); err != nil {
		t.Errorf("expected valid signature, got err: %v", err)
	}
}

func TestVerifyUpstream_TamperedBody(t *testing.T) {
	secret := "s"
	signed := []byte(`{"amount":100}`)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(signed)
	sig := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	r := NewRelay(Config{UpstreamSecret: secret})
	tampered := []byte(`{"amount":999}`)
	err := r.VerifyUpstream(sig, "", tampered)
	if err == nil || !strings.Contains(err.Error(), "mismatch") {
		t.Errorf("expected mismatch error, got %v", err)
	}
}

func TestVerifyUpstream_MissingHeaderRejected(t *testing.T) {
	r := NewRelay(Config{UpstreamSecret: "s"})
	if err := r.VerifyUpstream("", "", []byte(`{}`)); err == nil {
		t.Errorf("expected error for missing header")
	}
}

func TestVerifyUpstream_EmptySecretPasses(t *testing.T) {
	r := NewRelay(Config{UpstreamSecret: ""})
	if err := r.VerifyUpstream("", "", []byte(`{}`)); err != nil {
		t.Errorf("dev mode should pass, got %v", err)
	}
}

func TestForward_SignsAndPosts(t *testing.T) {
	var seenBody []byte
	var seenSig, seenTs string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenBody, _ = io.ReadAll(r.Body)
		seenSig = r.Header.Get("X-Signature")
		seenTs = r.Header.Get("X-Timestamp")
		w.WriteHeader(200)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer target.Close()

	r := NewRelay(Config{
		WebbuilderURL:    target.URL + "/webhook",
		WebbuilderSecret: "wb-secret",
	})
	if !r.Enabled() {
		t.Fatal("relay should be enabled")
	}

	body := []byte(`{"job_id":"x","status":"active"}`)
	status, _, err := r.Forward(context.Background(), body)
	if err != nil {
		t.Fatal(err)
	}
	if status != 200 {
		t.Errorf("expected 200, got %d", status)
	}
	if !bytes.Equal(seenBody, body) {
		t.Errorf("body not forwarded verbatim")
	}
	if !strings.HasPrefix(seenSig, "sha256=") {
		t.Errorf("signature not set: %q", seenSig)
	}
	// Verify signature nyocok.
	if _, err := strconv.ParseInt(seenTs, 10, 64); err != nil {
		t.Errorf("timestamp invalid: %v", err)
	}
	mac := hmac.New(sha256.New, []byte("wb-secret"))
	mac.Write([]byte(seenTs))
	mac.Write([]byte{'.'})
	mac.Write([]byte("POST"))
	mac.Write([]byte("/webhook"))
	mac.Write([]byte{'.'})
	mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if seenSig != expected {
		t.Errorf("signature mismatch:\ngot:  %s\nwant: %s", seenSig, expected)
	}
}

func TestForward_DisabledReturnsError(t *testing.T) {
	r := NewRelay(Config{}) // WebbuilderURL kosong
	if r.Enabled() {
		t.Fatal("relay should be disabled")
	}
	_, _, err := r.Forward(context.Background(), []byte(`{}`))
	if err == nil {
		t.Errorf("expected error when disabled")
	}
}

func TestExtractPath(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"http://host/webhook", "/webhook"},
		{"https://web.example.com/api/v1/webhooks/registry", "/api/v1/webhooks/registry"},
		{"http://host/", "/"},
		{"malformed", "/"},
	}
	for _, tc := range cases {
		if got := extractPath(tc.in); got != tc.want {
			t.Errorf("extractPath(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// Kompilasi trigger untuk memastikan struct valid.
var _ = json.Marshal
