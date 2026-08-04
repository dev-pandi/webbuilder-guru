package httpx

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// runHandler — mount fn di / dan return (status, body).
func runHandler(t *testing.T, fn func(c *fiber.Ctx) error) (int, []byte) {
	t.Helper()
	app := fiber.New()
	app.Get("/", fn)
	resp, err := app.Test(httptest.NewRequest("GET", "/", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, body
}

// --- Success envelope ---

func TestOK_ReturnsDataEnvelope(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return OK(c, map[string]string{"foo": "bar"})
	})
	if status != 200 {
		t.Errorf("expected 200, got %d", status)
	}
	var out struct {
		Data map[string]string `json:"data"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("unmarshal: %v (body %s)", err, body)
	}
	if out.Data["foo"] != "bar" {
		t.Errorf("body should have data.foo=bar, got %v", out.Data)
	}
}

func TestCreated_Returns201(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return Created(c, "ok")
	})
	if status != 201 {
		t.Errorf("expected 201, got %d", status)
	}
	if !strings.Contains(string(body), `"data":"ok"`) {
		t.Errorf("body missing data:ok — got %s", body)
	}
}

func TestAccepted_Returns202(t *testing.T) {
	status, _ := runHandler(t, func(c *fiber.Ctx) error {
		return Accepted(c, "queued")
	})
	if status != 202 {
		t.Errorf("expected 202, got %d", status)
	}
}

// --- Error envelope ---

// assertError — parse body sebagai {error:{code, message}} + assert fields.
func assertError(t *testing.T, body []byte, wantCode, wantMsgSubstr string) {
	t.Helper()
	var out struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		t.Fatalf("unmarshal: %v (body %s)", err, body)
	}
	if out.Error.Code != wantCode {
		t.Errorf("error.code = %q, want %q", out.Error.Code, wantCode)
	}
	if wantMsgSubstr != "" && !strings.Contains(out.Error.Message, wantMsgSubstr) {
		t.Errorf("error.message = %q, want substring %q", out.Error.Message, wantMsgSubstr)
	}
}

func TestBadRequest_400WithCode(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return BadRequest(c, "field wajib")
	})
	if status != 400 {
		t.Errorf("expected 400, got %d", status)
	}
	assertError(t, body, "bad_request", "field wajib")
}

func TestUnauthorized_401(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return Unauthorized(c, "no token")
	})
	if status != 401 {
		t.Errorf("expected 401, got %d", status)
	}
	assertError(t, body, "unauthorized", "no token")
}

func TestForbidden_403(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return Forbidden(c, "denied")
	})
	if status != 403 {
		t.Errorf("expected 403, got %d", status)
	}
	assertError(t, body, "forbidden", "denied")
}

func TestNotFound_404(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return NotFound(c, "missing")
	})
	if status != 404 {
		t.Errorf("expected 404, got %d", status)
	}
	assertError(t, body, "not_found", "missing")
}

func TestConflict_409(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return Conflict(c, "dup")
	})
	if status != 409 {
		t.Errorf("expected 409, got %d", status)
	}
	assertError(t, body, "conflict", "dup")
}

func TestInternal_500(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return Internal(c, "boom")
	})
	if status != 500 {
		t.Errorf("expected 500, got %d", status)
	}
	assertError(t, body, "internal_error", "boom")
}

func TestBadGateway_502(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return BadGateway(c, "upstream 500")
	})
	if status != 502 {
		t.Errorf("expected 502, got %d", status)
	}
	assertError(t, body, "upstream_error", "upstream 500")
}

func TestServiceUnavailable_503WithCustomCode(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return ServiceUnavailable(c, "epp_maintenance", "PANDI OT&E maintenance")
	})
	if status != 503 {
		t.Errorf("expected 503, got %d", status)
	}
	assertError(t, body, "epp_maintenance", "maintenance")
}

func TestNotImplemented_501WithCustomCode(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return NotImplemented(c, "capability_missing", "info tidak tersedia")
	})
	if status != 501 {
		t.Errorf("expected 501, got %d", status)
	}
	assertError(t, body, "capability_missing", "tidak tersedia")
}

// Custom Err — pastikan arbitrary status + code work-of (dipakai handler
// yang forward downstream status).
func TestErr_ArbitraryStatus(t *testing.T) {
	status, body := runHandler(t, func(c *fiber.Ctx) error {
		return Err(c, 418, "teapot", "short and stout")
	})
	if status != 418 {
		t.Errorf("expected 418, got %d", status)
	}
	assertError(t, body, "teapot", "short")
}
