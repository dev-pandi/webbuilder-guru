package auth

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func TestEIDPhone(t *testing.T) {
	cases := []struct{ cc, num, want string }{
		{"62", "81234567890", "+6281234567890"},
		{"62", "081234567890", "+6281234567890"},
		{"+62", "81234567890", "+6281234567890"},
		{"62", "6281234567890", "+6281234567890"},
		{"62", "+6281234567890", "+6281234567890"},
		{"", "081234567890", "081234567890"},
		{"62", "", ""},
	}
	for _, c := range cases {
		if got := eidPhone(c.cc, c.num); got != c.want {
			t.Errorf("eidPhone(%q,%q) = %q, want %q", c.cc, c.num, got, c.want)
		}
	}
}

func TestNormalizeEIDProfile(t *testing.T) {
	var raw eidProfileResp
	body := `{"email":"  Budi@Example.ID ","profile":{"fullname":"Budi Santoso","phonenumber":"81234567890",
		"countryphonecode":"62","address":"Jl. Merdeka 1","avatar":"x","tier":"2"}}`
	if err := json.Unmarshal([]byte(body), &raw); err != nil {
		t.Fatal(err)
	}
	p := normalizeEIDProfile(&raw)
	want := EIDProfile{Email: "budi@example.id", FullName: "Budi Santoso", Phone: "+6281234567890", Address: "Jl. Merdeka 1", Tier: 2}
	if p != want {
		t.Fatalf("got %+v, want %+v", p, want)
	}

	// Non-ASCII nama tidak lolos aturan kontak EPP → dikosongkan, tier angka tetap terbaca.
	_ = json.Unmarshal([]byte(`{"email":"a@b.id","profile":{"fullname":"Zoë","tier":1}}`), &raw)
	p = normalizeEIDProfile(&raw)
	if p.FullName != "" || p.Tier != 1 {
		t.Fatalf("got %+v", p)
	}
}

// fakeEID meniru tiga endpoint e.id yang dipanggil server kita.
func fakeEID(t *testing.T, tokenStatus int, tokenMsg string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1.1/oauth/get-token":
			var req map[string]string
			b, _ := io.ReadAll(r.Body)
			_ = json.Unmarshal(b, &req)
			if req["client_secret"] != "sec" || req["redirect_uri"] != "http://api.test/api/v1/auth/eid/callback" {
				w.WriteHeader(401)
				_, _ = w.Write([]byte(`{"status":false,"message":"OAUTH.INVALID_CLIENT_CREDENTIALS","data":null}`))
				return
			}
			if tokenStatus != 200 {
				w.WriteHeader(tokenStatus)
				_, _ = w.Write([]byte(`{"status":false,"message":"` + tokenMsg + `","data":null}`))
				return
			}
			_, _ = w.Write([]byte(`{"status":true,"message":"success","data":{"token_type":"Bearer","token":"tok-1","expired_date":"2030-01-01T00:00:00Z"}}`))
		case "/api/v1.1/oauth/get-profile":
			if r.Header.Get("Authorization") != "Bearer tok-1" || r.URL.Query().Get("scope") != "email:profile" {
				w.WriteHeader(401)
				_, _ = w.Write([]byte(`{"status":false,"message":"UNAUTHORIZATION","data":null}`))
				return
			}
			_, _ = w.Write([]byte(`{"status":true,"message":"success","data":{"email":"","profile":{"fullname":"X","tier":1}}}`))
		default:
			w.WriteHeader(404)
		}
	}))
}

func TestEIDHandler_Flow(t *testing.T) {
	newApp := func(base string) *fiber.App {
		h := NewEIDHandler(nil, nil, "cid", "sec", base, "http://api.test/api/v1/auth/eid/callback", "http://web.test")
		app := fiber.New()
		app.Get("/authorize", h.Authorize)
		app.Get("/callback", h.Callback)
		return app
	}
	get := func(app *fiber.App, path, cookie string) *http.Response {
		req := httptest.NewRequest("GET", path, nil)
		if cookie != "" {
			req.Header.Set("Cookie", eidStateCookie+"="+cookie)
		}
		resp, err := app.Test(req, int((5 * time.Second).Milliseconds()))
		if err != nil {
			t.Fatal(err)
		}
		return resp
	}
	errCode := func(resp *http.Response) string {
		loc, _ := url.Parse(resp.Header.Get("Location"))
		return loc.Query().Get("error")
	}

	t.Run("authorize redirects to e.id verify with cookie", func(t *testing.T) {
		resp := get(newApp("https://eid.test"), "/authorize?next=/sites/abc", "")
		loc, _ := url.Parse(resp.Header.Get("Location"))
		if resp.StatusCode != 302 || loc.Host != "eid.test" || loc.Path != "/api/v1.1/oauth/verify" {
			t.Fatalf("unexpected redirect %d %s", resp.StatusCode, loc)
		}
		if loc.Query().Get("client_id") != "cid" || loc.Query().Get("callback_url") != "http://api.test/api/v1/auth/eid/callback" {
			t.Fatalf("bad query %s", loc.RawQuery)
		}
		if c := resp.Header.Get("Set-Cookie"); !strings.Contains(c, eidStateCookie) || !strings.Contains(c, ".%2Fsites%2Fabc") && !strings.Contains(c, "./sites/abc") {
			t.Fatalf("state cookie missing next: %s", c)
		}
	})

	t.Run("not configured", func(t *testing.T) {
		h := NewEIDHandler(nil, nil, "", "", "https://eid.test", "x", "http://web.test")
		app := fiber.New()
		app.Get("/authorize", h.Authorize)
		if got := errCode(get(app, "/authorize", "")); got != "eid_not_configured" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("callback without cookie", func(t *testing.T) {
		if got := errCode(get(newApp("https://eid.test"), "/callback?code=x", "")); got != "eid_state_mismatch" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("callback without code = cancelled, keeps next", func(t *testing.T) {
		resp := get(newApp("https://eid.test"), "/callback", "abc./sites/1")
		loc, _ := url.Parse(resp.Header.Get("Location"))
		if loc.Query().Get("error") != "eid_cancelled" || loc.Query().Get("next") != "/sites/1" {
			t.Fatalf("got %s", loc)
		}
	})

	t.Run("expired code", func(t *testing.T) {
		srv := fakeEID(t, 400, "OAUTH.INVALID_OR_EXPIRED_CODE")
		defer srv.Close()
		if got := errCode(get(newApp(srv.URL), "/callback?code=x", "abc./dashboard")); got != "eid_code_expired" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("profile without email", func(t *testing.T) {
		srv := fakeEID(t, 200, "")
		defer srv.Close()
		if got := errCode(get(newApp(srv.URL), "/callback?code=x", "abc./dashboard")); got != "eid_no_email" {
			t.Fatalf("got %q", got)
		}
	})
}

func TestUpsertEIDUser_DB(t *testing.T) {
	if attachPool == nil {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := t.Context()
	repo := NewRepo(attachPool)
	cleanup := func(email string) {
		// Background: t.Context() sudah dibatalkan saat Cleanup berjalan.
		t.Cleanup(func() { _, _ = attachPool.Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email) })
	}

	t.Run("new user, tier 0 not marked verified", func(t *testing.T) {
		email := "eid-" + uuid.NewString()[:8] + "@test.local"
		cleanup(email)
		u, err := repo.UpsertEIDUser(ctx, EIDProfile{Email: email, FullName: "Budi", Phone: "+6281234567890", Address: "Jl. A", Tier: 0})
		if err != nil {
			t.Fatal(err)
		}
		if u.Name != "Budi" || u.PhoneNumber != "+6281234567890" || u.Address != "Jl. A" || u.PasswordHash != "" {
			t.Fatalf("unexpected user %+v", u)
		}
		if u.EmailVerifiedAt != nil {
			t.Fatal("tier 0 must not mark email verified")
		}
		// Login ulang dengan tier 1 → user yang sama, kini terverifikasi.
		u2, err := repo.UpsertEIDUser(ctx, EIDProfile{Email: email, Tier: 1})
		if err != nil {
			t.Fatal(err)
		}
		if u2.ID != u.ID || u2.EmailVerifiedAt == nil || u2.Name != "Budi" {
			t.Fatalf("relogin mismatch %+v", u2)
		}
	})

	t.Run("links existing password user without overwriting filled fields", func(t *testing.T) {
		email := "eid-" + uuid.NewString()[:8] + "@test.local"
		cleanup(email)
		var id uuid.UUID
		if err := attachPool.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, name, phone_number, nik)
			VALUES ($1, 'hash', 'Nama Lama', '', '') RETURNING id`, email).Scan(&id); err != nil {
			t.Fatal(err)
		}
		u, err := repo.UpsertEIDUser(ctx, EIDProfile{Email: email, FullName: "Nama E.id", Phone: "+628111111111", Tier: 2})
		if err != nil {
			t.Fatal(err)
		}
		if u.ID != id || u.Name != "Nama Lama" || u.PhoneNumber != "+628111111111" || u.PasswordHash != "hash" {
			t.Fatalf("unexpected link result %+v", u)
		}
		if u.Nik != "" {
			t.Fatal("NIK must stay empty — user still has to fill it")
		}
		var n int
		_ = attachPool.QueryRow(ctx, `SELECT count(*) FROM user_identities WHERE user_id = $1 AND provider = 'eid' AND tier = 2`, id).Scan(&n)
		if n != 1 {
			t.Fatalf("identity rows = %d", n)
		}
	})
}
