package errortrack

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestInit_EmptyDSN_DisabledClient(t *testing.T) {
	c, err := Init("", "dev", "")
	if err != nil {
		t.Fatalf("init empty: %v", err)
	}
	if c.Enabled() {
		t.Fatal("expected disabled client for empty DSN")
	}
	// Capture on disabled client is a noop and must not panic / block.
	c.Capture(context.Background(), errors.New("x"), nil)
}

func TestInit_MalformedDSN(t *testing.T) {
	cases := []string{
		"not a url",
		"https://example.com",         // missing key (user) and project id
		"https://key@example.com/",    // missing project id
	}
	for _, dsn := range cases {
		if _, err := Init(dsn, "", ""); err == nil {
			t.Errorf("expected error for DSN %q", dsn)
		}
	}
}

func TestCapture_SendsEvent(t *testing.T) {
	var (
		mu       sync.Mutex
		got      event
		called   bool
		authHdr  string
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		defer mu.Unlock()
		called = true
		authHdr = r.Header.Get("X-Sentry-Auth")
		_ = json.Unmarshal(body, &got)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dsn := "http://abc123@" + srv.Listener.Addr().String() + "/42"
	c, err := Init(dsn, "test", "v1")
	if err != nil {
		t.Fatalf("init: %v", err)
	}
	if !c.Enabled() {
		t.Fatal("expected enabled client")
	}

	c.Capture(context.Background(), errors.New("boom"), map[string]string{"route": "/x"})

	// Capture sends asynchronously — wait briefly.
	for i := 0; i < 50; i++ {
		mu.Lock()
		if called {
			mu.Unlock()
			break
		}
		mu.Unlock()
		time.Sleep(20 * time.Millisecond)
	}

	mu.Lock()
	defer mu.Unlock()
	if !called {
		t.Fatal("server never received event")
	}
	if got.Level != "error" || got.Environment != "test" || got.Release != "v1" {
		t.Errorf("event meta wrong: %+v", got)
	}
	if got.Tags["route"] != "/x" {
		t.Errorf("tag missing: %+v", got.Tags)
	}
	if authHdr == "" {
		t.Errorf("missing X-Sentry-Auth header")
	}
}

func TestCapture_Dedupe(t *testing.T) {
	var (
		mu    sync.Mutex
		count int
	)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		count++
		mu.Unlock()
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	dsn := "http://k@" + srv.Listener.Addr().String() + "/1"
	c, _ := Init(dsn, "", "")
	for i := 0; i < 5; i++ {
		c.Capture(context.Background(), errors.New("same fingerprint"), nil)
	}
	time.Sleep(200 * time.Millisecond)
	mu.Lock()
	defer mu.Unlock()
	if count != 1 {
		t.Errorf("expected dedupe to keep count=1, got %d", count)
	}
}
