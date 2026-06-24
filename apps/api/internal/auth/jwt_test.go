package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestTokenIssuer_RoundTrip(t *testing.T) {
	issuer := NewTokenIssuer("test-secret-for-jwt", 5*time.Minute, time.Hour)
	uid := uuid.New()
	tok, _, err := issuer.IssueAccess(uid, "u@example.com", "user")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	cl, err := issuer.Parse(tok)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if cl.UserID != uid {
		t.Errorf("uid mismatch: got %s want %s", cl.UserID, uid)
	}
	if cl.Email != "u@example.com" {
		t.Errorf("email mismatch: got %s", cl.Email)
	}
	if cl.Role != "user" {
		t.Errorf("role mismatch: got %s", cl.Role)
	}
}

func TestTokenIssuer_RejectsWrongSecret(t *testing.T) {
	a := NewTokenIssuer("secret-a", time.Minute, time.Minute)
	b := NewTokenIssuer("secret-b", time.Minute, time.Minute)
	tok, _, _ := a.IssueAccess(uuid.New(), "x@y", "user")
	if _, err := b.Parse(tok); err == nil {
		t.Fatalf("expected parse error with foreign secret")
	}
}

func TestTokenIssuer_RejectsExpired(t *testing.T) {
	issuer := NewTokenIssuer("s", -time.Minute, time.Minute)
	tok, _, _ := issuer.IssueAccess(uuid.New(), "x@y", "user")
	_, err := issuer.Parse(tok)
	if err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expected expired error, got %v", err)
	}
}

func TestGenerateOpaqueToken_ShapeAndHash(t *testing.T) {
	raw, hash, err := GenerateOpaqueToken()
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) != 64 || len(hash) != 64 {
		t.Fatalf("expected 64-hex chars each, got raw=%d hash=%d", len(raw), len(hash))
	}
	// HashOpaqueToken must be deterministic and match.
	if got := HashOpaqueToken(raw); got != hash {
		t.Fatalf("hash mismatch: got %s want %s", got, hash)
	}
	// Different raw -> different hash.
	raw2, _, _ := GenerateOpaqueToken()
	if raw == raw2 {
		t.Fatalf("expected unique tokens")
	}
}
