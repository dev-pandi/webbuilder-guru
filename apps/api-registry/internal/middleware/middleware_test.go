package middleware

import (
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// --- RequestID ---

func TestRequestID_GeneratesUUIDWhenAbsent(t *testing.T) {
	app := fiber.New()
	app.Use(RequestID())
	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString(c.Locals(LocalsKeyRequestID).(string))
	})

	resp, _ := app.Test(httptest.NewRequest("GET", "/", nil))
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	rid := resp.Header.Get(HeaderRequestID)
	if _, err := uuid.Parse(rid); err != nil {
		t.Errorf("response X-Request-ID should be UUID, got %q", rid)
	}
}

func TestRequestID_ReusesValidHeader(t *testing.T) {
	app := fiber.New()
	app.Use(RequestID())
	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString(c.Locals(LocalsKeyRequestID).(string))
	})

	given := "abcdef01-1234-5678-9abc-abcdef012345"
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set(HeaderRequestID, given)
	resp, _ := app.Test(req)
	if resp.Header.Get(HeaderRequestID) != given {
		t.Errorf("valid UUID header should be reused, got %q want %q",
			resp.Header.Get(HeaderRequestID), given)
	}
}

func TestRequestID_RejectsJunkHeader(t *testing.T) {
	app := fiber.New()
	app.Use(RequestID())
	app.Get("/", func(c *fiber.Ctx) error { return c.SendString("ok") })

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set(HeaderRequestID, "junk-not-a-uuid")
	resp, _ := app.Test(req)
	rid := resp.Header.Get(HeaderRequestID)
	if rid == "junk-not-a-uuid" {
		t.Errorf("junk header should be replaced, got %q", rid)
	}
	if _, err := uuid.Parse(rid); err != nil {
		t.Errorf("replaced header should be valid UUID, got %q", rid)
	}
}

func TestLooksLikeUUID(t *testing.T) {
	cases := map[string]bool{
		"abcdef01-1234-5678-9abc-abcdef012345": true,
		"":                                     false,
		"too-short":                            false,
		"abcdef01-1234-5678-9abc-abcdef01234":  false, // 35 chars
		"abcdef01_1234_5678_9abc_abcdef012345": false, // no dashes
	}
	for input, want := range cases {
		if got := looksLikeUUID(input); got != want {
			t.Errorf("looksLikeUUID(%q) = %v, want %v", input, got, want)
		}
	}
}

// --- Concurrency ---

func TestConcurrency_AllowsUnderLimit(t *testing.T) {
	app := fiber.New()
	app.Use(Concurrency(2, 100*time.Millisecond))
	app.Get("/v1/domains/check", func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	resp, _ := app.Test(httptest.NewRequest("GET", "/v1/domains/check", nil))
	if resp.StatusCode != 200 {
		t.Errorf("expected 200 under limit, got %d", resp.StatusCode)
	}
}

// TestConcurrency_BlocksOverLimit — pool max=1, launch 2 slow requests.
// Second one should hit timeout dan get 429.
func TestConcurrency_BlocksOverLimit(t *testing.T) {
	app := fiber.New()
	app.Use(Concurrency(1, 50*time.Millisecond))
	// Endpoint slow — hold slot 200ms.
	app.Get("/v1/domains/check", func(c *fiber.Ctx) error {
		time.Sleep(200 * time.Millisecond)
		return c.SendString("ok")
	})

	var (
		wg           sync.WaitGroup
		got429       atomic.Int32
		got200       atomic.Int32
	)
	// Launch 2 concurrent — pool=1, second should 429 after 50ms wait.
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// Increase app.Test timeout supaya tidak block test infra.
			resp, err := app.Test(httptest.NewRequest("GET", "/v1/domains/check", nil), 1000)
			if err != nil {
				return
			}
			switch resp.StatusCode {
			case 429:
				got429.Add(1)
			case 200:
				got200.Add(1)
			}
		}()
	}
	wg.Wait()

	if got200.Load() != 1 || got429.Load() != 1 {
		t.Errorf("expected 1 success + 1 rate-limited, got %d + %d",
			got200.Load(), got429.Load())
	}
}

// Cheap paths (healthz/readyz/metrics/version + /v1/jobs*) bypass semaphore.
func TestConcurrency_SkipsCheapPaths(t *testing.T) {
	app := fiber.New()
	app.Use(Concurrency(1, 10*time.Millisecond))
	// Hold slot dulu di path expensive supaya semaphore penuh.
	slotHeld := make(chan struct{})
	release := make(chan struct{})
	app.Get("/v1/domains/register", func(c *fiber.Ctx) error {
		close(slotHeld)
		<-release
		return c.SendString("done")
	})
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})
	app.Get("/v1/jobs", func(c *fiber.Ctx) error {
		return c.SendString("jobs")
	})

	// Trigger expensive endpoint to hold slot.
	go func() {
		_, _ = app.Test(httptest.NewRequest("GET", "/v1/domains/register", nil), 5000)
	}()
	<-slotHeld

	// Now healthz + /v1/jobs should still respond immediately.
	for _, path := range []string{"/healthz", "/v1/jobs"} {
		resp, err := app.Test(httptest.NewRequest("GET", path, nil), 500)
		if err != nil {
			t.Errorf("cheap path %s should not block, err: %v", path, err)
			continue
		}
		if resp.StatusCode != 200 {
			t.Errorf("cheap path %s should return 200 (bypass sem), got %d", path, resp.StatusCode)
		}
	}
	close(release)
}

func TestIsCheapPath(t *testing.T) {
	cases := map[string]bool{
		"/healthz":               true,
		"/readyz":                true,
		"/metrics":               true,
		"/version":               true,
		"/v1/jobs":               true,
		"/v1/jobs/abc":           true,
		"/v1/domains/check":      false,
		"/v1/domains/register":   false,
		"/webhooks/registrar":    false,
		"/":                      false,
	}
	for path, want := range cases {
		if got := isCheapPath(path); got != want {
			t.Errorf("isCheapPath(%q) = %v, want %v", path, got, want)
		}
	}
}

// --- Sanity check: middleware imports fiber correctly ---

func TestRequestID_HandlerChainable(t *testing.T) {
	// Sanity: make sure chained middleware still passes context correctly.
	app := fiber.New()
	app.Use(RequestID())
	app.Use(func(c *fiber.Ctx) error {
		rid := c.Locals(LocalsKeyRequestID)
		if rid == nil {
			t.Errorf("locals should have request_id")
		}
		return c.Next()
	})
	app.Get("/", func(c *fiber.Ctx) error {
		return c.SendString(strings.ToUpper("ok"))
	})

	resp, _ := app.Test(httptest.NewRequest("GET", "/", nil))
	if resp.StatusCode != 200 {
		t.Errorf("chained middleware failed: status %d", resp.StatusCode)
	}
}
