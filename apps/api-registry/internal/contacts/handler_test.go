package contacts

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/provider"
)

func setupApp(fake *provider.FakeProvider) *fiber.App {
	app := fiber.New()
	h := NewHandler(fake)
	app.Get("/contacts/:id", h.Get)
	app.Patch("/contacts/:id", h.Update)
	app.Patch("/domains/:name/contact", h.UpdateByDomain)
	return app
}

func TestGetContact_Success(t *testing.T) {
	app := setupApp(provider.NewFake())
	req := httptest.NewRequest("GET", "/contacts/42", nil)
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if !strings.Contains(string(body), "Fake User") {
		t.Errorf("body missing default name: %s", body)
	}
}

func TestGetContact_InvalidID(t *testing.T) {
	app := setupApp(provider.NewFake())
	req := httptest.NewRequest("GET", "/contacts/not-a-number", nil)
	resp, _ := app.Test(req)
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 invalid id, got %d", resp.StatusCode)
	}
}

func TestUpdateContact_RequiresNameEmail(t *testing.T) {
	app := setupApp(provider.NewFake())
	body, _ := json.Marshal(map[string]string{"phone": "+62812"})
	req := httptest.NewRequest("PATCH", "/contacts/42", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 missing name/email, got %d", resp.StatusCode)
	}
}

func TestUpdateContact_Success(t *testing.T) {
	fake := provider.NewFake()
	fake.UpdateContactByIDFn = func(ctx context.Context, id uint64, req provider.UpdateContactRequest) (*provider.UpdateContactResponse, error) {
		if id != 42 {
			t.Errorf("id mismatch: %d", id)
		}
		return &provider.UpdateContactResponse{ContactID: id, Name: req.Name, Message: "contact updated (DB + EPP registry)"}, nil
	}
	app := setupApp(fake)
	body, _ := json.Marshal(map[string]any{
		"name": "Budi", "email": "budi@example.com", "phone": "+62811", "address": "Jl X",
		"city": "Jakarta", "postal_code": "10110",
	})
	req := httptest.NewRequest("PATCH", "/contacts/42", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		b, _ := io.ReadAll(resp.Body)
		t.Errorf("expected 200, got %d body=%s", resp.StatusCode, b)
	}
}

func TestUpdateByDomain_Success(t *testing.T) {
	fake := provider.NewFake()
	app := setupApp(fake)
	body, _ := json.Marshal(map[string]any{
		"name": "A", "email": "a@b.com", "phone": "+62", "address": "X",
		"city": "Y", "postal_code": "1",
	})
	req := httptest.NewRequest("PATCH", "/domains/hello.id/contact", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, _ := app.Test(req)
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
	if fake.CallCount("UpdateDomainContact") != 1 {
		t.Errorf("provider not called")
	}
}
