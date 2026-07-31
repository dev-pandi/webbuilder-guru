package client

import (
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

func TestClient_SignsRequest(t *testing.T) {
	var gotSig, gotTs, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSig = r.Header.Get("X-Signature")
		gotTs = r.Header.Get("X-Timestamp")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"query": "test", "allowed_zones": []string{}, "results": []any{}}})
	}))
	defer srv.Close()

	c, err := New(Config{BaseURL: srv.URL, Secret: "my-secret"})
	if err != nil {
		t.Fatal(err)
	}
	res, err := c.CheckDomain(context.Background(), CheckRequest{Domain: "example"})
	if err != nil {
		t.Fatalf("call err: %v", err)
	}
	if res.Query != "test" {
		t.Errorf("query mismatch: %s", res.Query)
	}
	if !strings.HasPrefix(gotSig, "sha256=") {
		t.Errorf("signature should start with sha256=, got %q", gotSig)
	}
	if _, err := strconv.ParseInt(gotTs, 10, 64); err != nil {
		t.Errorf("invalid timestamp: %v", err)
	}

	// Verify signature nyocok dengan compute manual.
	expected := computeSignature([]byte("my-secret"), gotTs, "POST", "/v1/domains/check", []byte(gotBody))
	if strings.TrimPrefix(gotSig, "sha256=") != expected {
		t.Errorf("signature mismatch:\ngot:  %s\nwant: sha256=%s", gotSig, expected)
	}

	// Verify HMAC valid (bypass client — recompute lokal).
	mac := hmac.New(sha256.New, []byte("my-secret"))
	mac.Write([]byte(gotTs))
	mac.Write([]byte{'.'})
	mac.Write([]byte("POST"))
	mac.Write([]byte("/v1/domains/check"))
	mac.Write([]byte{'.'})
	mac.Write([]byte(gotBody))
	want := hex.EncodeToString(mac.Sum(nil))
	if want != expected {
		t.Errorf("independent HMAC verify failed:\nwant %s\nsig  %s", want, expected)
	}
}

func TestClient_ErrorEnvelopeParsed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(404)
		w.Write([]byte(`{"error":{"code":"not_found","message":"domain tidak ada"}}`))
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: srv.URL})
	_, err := c.GetContact(context.Background(), 42)
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("expected APIError, got %T", err)
	}
	if apiErr.Status != 404 || apiErr.Code != "not_found" || apiErr.Message != "domain tidak ada" {
		t.Errorf("APIError not parsed: %+v", apiErr)
	}
}

func TestClient_NoSecretSkipsSigning(t *testing.T) {
	var gotSig string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSig = r.Header.Get("X-Signature")
		w.WriteHeader(200)
		w.Write([]byte(`{"data":{"query":"","allowed_zones":[],"results":[]}}`))
	}))
	defer srv.Close()

	c, _ := New(Config{BaseURL: srv.URL})
	_, _ = c.CheckDomain(context.Background(), CheckRequest{Domain: "test"})
	if gotSig != "" {
		t.Errorf("expected no signature when secret empty, got %q", gotSig)
	}
}
