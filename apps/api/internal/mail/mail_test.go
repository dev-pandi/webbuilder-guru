package mail

import (
	"context"
	"testing"
)

func TestNew_LogDriverDefault(t *testing.T) {
	s, err := New(Config{})
	if err != nil || s.Driver() != "log" {
		t.Fatalf("expected log driver, got driver=%q err=%v", s.Driver(), err)
	}
}

func TestNew_SmtpRequiresHostAndFrom(t *testing.T) {
	if _, err := New(Config{Driver: "smtp"}); err == nil {
		t.Fatalf("expected error for smtp driver without host/from")
	}
	s, err := New(Config{Driver: "smtp", Host: "mail.example.com", Port: 587, From: "no-reply@example.com"})
	if err != nil || s.Driver() != "smtp" {
		t.Fatalf("smtp construct failed: driver=%q err=%v", s.Driver(), err)
	}
}

func TestLogSender_Send(t *testing.T) {
	s, _ := New(Config{Driver: "log"})
	err := s.Send(context.Background(), Message{To: "a@b", Subject: "s", Body: "b"})
	if err != nil {
		t.Fatalf("log send: %v", err)
	}
}

func TestNew_UnknownDriverFallsBackToLog(t *testing.T) {
	s, err := New(Config{Driver: "carrier-pigeon"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Driver() != "log" {
		t.Fatalf("expected log fallback, got %q", s.Driver())
	}
}
