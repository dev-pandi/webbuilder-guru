package router

import (
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Regression: the cache used to key on path only, so ?host=b got host a's site.
func TestPublicCacheKeysOnQuery(t *testing.T) {
	app := fiber.New()
	app.Get("/site-by-host", publicCache(time.Minute), func(c *fiber.Ctx) error {
		return c.SendString(c.Query("host"))
	})

	get := func(url string) (string, string) {
		res, err := app.Test(httptest.NewRequest("GET", url, nil))
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(res.Body)
		return string(b), res.Header.Get("X-Cache")
	}

	if body, _ := get("/site-by-host?host=a.id"); body != "a.id" {
		t.Fatalf("a = %q", body)
	}
	if body, _ := get("/site-by-host?host=b.id"); body != "b.id" {
		t.Fatalf("host lain mendapat respons cache milik host pertama: %q", body)
	}
	if body, hit := get("/site-by-host?host=a.id"); body != "a.id" || hit != "hit" {
		t.Fatalf("query yang sama harus tetap kena cache: %q (%s)", body, hit)
	}
}
