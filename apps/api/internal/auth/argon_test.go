package auth

import (
	"strings"
	"testing"
)

func TestHashPassword_RoundTrip(t *testing.T) {
	hash, err := HashPassword("hunter2-correct-horse")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("expected PHC argon2id prefix, got %q", hash)
	}
	ok, err := VerifyPassword("hunter2-correct-horse", hash)
	if err != nil || !ok {
		t.Fatalf("verify success path: ok=%v err=%v", ok, err)
	}
	ok, err = VerifyPassword("wrong", hash)
	if err != nil || ok {
		t.Fatalf("verify reject wrong: ok=%v err=%v", ok, err)
	}
}

func TestHashPassword_DifferentSaltsProduceDifferentHashes(t *testing.T) {
	h1, _ := HashPassword("same")
	h2, _ := HashPassword("same")
	if h1 == h2 {
		t.Fatalf("expected unique salts to produce distinct hashes")
	}
}

func TestVerifyPassword_RejectsMalformed(t *testing.T) {
	cases := []string{"", "$argon2id$bad", "not-a-hash", "$argon2id$v=19$m=1,t=1,p=1$x$y"}
	for _, c := range cases {
		if _, err := VerifyPassword("any", c); err == nil {
			t.Errorf("expected error for malformed hash %q", c)
		}
	}
}
