package domain_purchase

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func TestExportCursorRoundTrip(t *testing.T) {
	in := ExportCursor{
		RegisteredAt: time.Date(2026, 11, 9, 3, 4, 5, 123456000, time.UTC),
		ID:           uuid.New(),
	}
	out, err := decodeExportCursor(encodeExportCursor(in))
	if err != nil {
		t.Fatal(err)
	}
	if !out.RegisteredAt.Equal(in.RegisteredAt) || out.ID != in.ID {
		t.Fatalf("roundtrip mismatch: %+v vs %+v", out, in)
	}
	for _, bad := range []string{"!!", "bm9wZQ", "MTIzX25vdC1hLXV1aWQ"} {
		if _, err := decodeExportCursor(bad); err == nil {
			t.Errorf("expected error for %q", bad)
		}
	}
}

func TestCSVSafe(t *testing.T) {
	cases := map[string]string{
		"=HYPERLINK(1)": "'=HYPERLINK(1)",
		"+62812":        "'+62812",
		"-1":            "'-1",
		"@SUM":          "'@SUM",
		"budi.id":       "budi.id",
		"":              "",
	}
	for in, want := range cases {
		if got := csvSafe(in); got != want {
			t.Errorf("csvSafe(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestParseAdminDomainFilter_DateRange(t *testing.T) {
	app := fiber.New()
	var got AdminDomainFilter
	var msg string
	app.Get("/", func(c *fiber.Ctx) error {
		got, msg = parseAdminDomainFilter(c)
		return nil
	})
	run := func(qs string) {
		got, msg = AdminDomainFilter{}, ""
		if _, err := app.Test(httptest.NewRequest("GET", "/?"+qs, nil)); err != nil {
			t.Fatal(err)
		}
	}

	run("registered_from=2026-11-01&registered_to=2026-11-01")
	if msg != "" {
		t.Fatalf("unexpected error: %s", msg)
	}
	// Satu hari penuh WIB = [31 Okt 17:00 UTC, 1 Nov 17:00 UTC).
	if want := time.Date(2026, 10, 31, 17, 0, 0, 0, time.UTC); !got.RegisteredFrom.Equal(want) {
		t.Errorf("from = %v, want %v", got.RegisteredFrom.UTC(), want)
	}
	if want := time.Date(2026, 11, 1, 17, 0, 0, 0, time.UTC); !got.RegisteredTo.Equal(want) {
		t.Errorf("to = %v, want %v", got.RegisteredTo.UTC(), want)
	}

	run("registered_from=2026-11-05&registered_to=2026-11-01")
	if msg == "" {
		t.Error("expected error for reversed range")
	}
	run("registered_from=05-11-2026")
	if msg == "" {
		t.Error("expected error for bad date format")
	}
	run("")
	if msg != "" || got.RegisteredFrom != nil || got.RegisteredTo != nil {
		t.Errorf("empty query should yield no date filter, got %+v %q", got, msg)
	}
}
