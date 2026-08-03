package wallet_local

import (
	"bytes"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

func TestEscapeJSONString(t *testing.T) {
	cases := []struct{ in, want string }{
		{"plain", "plain"},
		{`"quoted"`, `\"quoted\"`},
		{`with\backslash`, `with\\backslash`},
		{"line\nbreak", `line\nbreak`},
		{"tab\there", `tab\there`},
	}
	for _, tc := range cases {
		if got := escapeJSONString(tc.in); got != tc.want {
			t.Errorf("escapeJSONString(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestBuildAdminMeta_WithAdminID(t *testing.T) {
	adminID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	got := string(buildAdminMeta(adminID, "test note"))
	if !strings.Contains(got, `"admin_id":"11111111-1111-1111-1111-111111111111"`) {
		t.Errorf("admin_id not included: %s", got)
	}
	if !strings.Contains(got, `"note":"test note"`) {
		t.Errorf("note not included: %s", got)
	}
}

func TestBuildAdminMeta_NilAdmin(t *testing.T) {
	got := string(buildAdminMeta(uuid.Nil, "note only"))
	if strings.Contains(got, "admin_id") {
		t.Errorf("nil admin should be omitted: %s", got)
	}
	if !strings.Contains(got, `"note":"note only"`) {
		t.Errorf("note missing: %s", got)
	}
}

func TestAdminAdjust_RejectsInvalidUUID(t *testing.T) {
	app := fiber.New()
	h := &Handler{}
	app.Post("/wallet/adjust", h.AdminAdjust)

	req := httptest.NewRequest("POST", "/wallet/adjust",
		bytes.NewReader([]byte(`{"user_id":"not-a-uuid","delta":100,"reason":"topup"}`)))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 400 || !strings.Contains(string(body), "user_id") {
		t.Errorf("expected 400 user_id error, got %d %s", resp.StatusCode, body)
	}
}

func TestAdminAdjust_RejectsZeroDelta(t *testing.T) {
	app := fiber.New()
	h := &Handler{}
	app.Post("/wallet/adjust", h.AdminAdjust)

	body := `{"user_id":"11111111-1111-1111-1111-111111111111","delta":0,"reason":"x"}`
	req := httptest.NewRequest("POST", "/wallet/adjust", bytes.NewReader([]byte(body)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 400 || !strings.Contains(string(respBody), "delta") {
		t.Errorf("expected 400 delta error, got %d %s", resp.StatusCode, respBody)
	}
}

func TestAdminAdjust_RejectsInvalidJSON(t *testing.T) {
	app := fiber.New()
	h := &Handler{}
	app.Post("/wallet/adjust", h.AdminAdjust)

	req := httptest.NewRequest("POST", "/wallet/adjust", bytes.NewReader([]byte(`{malformed`)))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	defer resp.Body.Close()
	if resp.StatusCode != 400 {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}
