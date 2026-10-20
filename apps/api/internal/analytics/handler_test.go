package analytics

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// Beacon dikirim sebagai text/plain supaya sendBeacon lolos tanpa CORS
// preflight (preflight bercredential dari sendBeacon ditolak publicCORS, dan
// seluruh page view hilang diam-diam). Versi lama pakai c.BodyParser yang
// menolak content type selain JSON/form, jadi perubahan di renderer saja tidak
// cukup. Content-Type apa pun harus tetap ter-parse.
//
// uuid.Parse gagal sebelum handler menyentuh repo/sites, jadi "invalid site_id"
// membuktikan body SUDAH ter-parse — dan test ini tidak butuh Postgres.
func TestRecordView_ParsesBodyRegardlessOfContentType(t *testing.T) {
	app := fiber.New()
	app.Post("/pv", NewHandler(nil, nil).RecordView)

	for _, ct := range []string{
		"text/plain;charset=UTF-8",
		"application/json",
		"", // sendBeacon dengan payload string polos
	} {
		req := httptest.NewRequest("POST", "/pv", strings.NewReader(
			`{"site_id":"bukan-uuid","page_slug":"/about"}`))
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		res, err := app.Test(req)
		if err != nil {
			t.Fatalf("ct=%q: %v", ct, err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if !strings.Contains(string(body), "invalid site_id") {
			t.Errorf("ct=%q: body tidak ter-parse, balas %d %s", ct, res.StatusCode, body)
		}
	}
}
