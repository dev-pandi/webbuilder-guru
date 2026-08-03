package epp

import (
	"context"
	"errors"
	"testing"

	"github.com/webbuilder/api-registry/internal/provider"
)

// UpdateNameservers validation guards run BEFORE any EPP call — kita bisa
// test dengan provider yang belum di-Connect (client nil). Kalau validation
// gagal, return sebelum p.c.connMu.Lock() (yang aman di nil client).

func TestUpdateNameservers_RejectsFewerThan2Unique(t *testing.T) {
	p := &EPPDirectProvider{c: &Client{}} // no live client — validation should fail first

	cases := []struct {
		name string
		ns   []string
	}{
		{"empty", []string{}},
		{"single", []string{"ns1.example.com"}},
		{"case-duplicate collapses to 1", []string{"NS1.example.com", "ns1.example.com"}},
		{"whitespace-duplicate collapses to 1", []string{"ns1.example.com", "  ns1.example.com  "}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := p.UpdateNameservers(context.Background(), "example.id", tc.ns)
			if err == nil {
				t.Fatalf("expected validation error for %v", tc.ns)
			}
			if !errors.Is(err, provider.ErrValidation) {
				t.Errorf("expected ErrValidation, got %v", err)
			}
		})
	}
}

func TestUpdateNameservers_RejectsMoreThan13(t *testing.T) {
	p := &EPPDirectProvider{c: &Client{}}

	ns := []string{}
	for i := 1; i <= 14; i++ {
		ns = append(ns, "ns"+string(rune('a'+i-1))+".example.com")
	}
	_, err := p.UpdateNameservers(context.Background(), "example.id", ns)
	if err == nil {
		t.Fatal("expected validation error for 14 nameservers")
	}
	if !errors.Is(err, provider.ErrValidation) {
		t.Errorf("expected ErrValidation, got %v", err)
	}
}
