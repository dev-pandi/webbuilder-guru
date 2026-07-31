package documents

import (
	"bytes"
	"context"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/provider"
)

func setupApp(fake *provider.FakeProvider) *fiber.App {
	// Match production Fiber config — BodyLimit 10 MiB supaya handler's
	// own MaxFileSize check (8 MiB) yang trigger 413, bukan Fiber default.
	app := fiber.New(fiber.Config{BodyLimit: 10 * 1024 * 1024})
	h := NewHandler(fake)
	app.Post("/documents", h.Upload)
	app.Get("/documents", h.List)
	return app
}

// buildMultipart — helper untuk test: bikin multipart form dengan field
// standar + file.
func buildMultipart(t *testing.T, contentType string, size int, extraFields map[string]string) (io.Reader, string) {
	t.Helper()
	buf := &bytes.Buffer{}
	w := multipart.NewWriter(buf)
	for k, v := range extraFields {
		_ = w.WriteField(k, v)
	}
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", `form-data; name="file"; filename="ktp.jpg"`)
	h.Set("Content-Type", contentType)
	part, err := w.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	body := bytes.Repeat([]byte("x"), size)
	part.Write(body)
	w.Close()
	return buf, w.FormDataContentType()
}

func TestUpload_Success(t *testing.T) {
	fake := provider.NewFake()
	fake.UploadDocumentFn = func(ctx context.Context, req provider.UploadDocumentRequest) (*provider.UploadDocumentResponse, error) {
		if req.ExternalUserID != "user-1" || req.CategoryID != 5 {
			t.Errorf("field mismatch: %+v", req)
		}
		if req.ContentType != "image/jpeg" {
			t.Errorf("content-type mismatch: %s", req.ContentType)
		}
		return &provider.UploadDocumentResponse{ID: 99, Filename: "ktp.jpg", CategoryID: 5, Status: "pending"}, nil
	}
	app := setupApp(fake)

	body, ct := buildMultipart(t, "image/jpeg", 100, map[string]string{
		"external_user_id": "user-1",
		"category_id":      "5",
		"name":             "KTP saya",
	})
	req := httptest.NewRequest("POST", "/documents", body)
	req.Header.Set("Content-Type", ct)
	resp, _ := app.Test(req)
	if resp.StatusCode != 201 {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 201, got %d body=%s", resp.StatusCode, b)
	}
}

func TestUpload_MissingFile(t *testing.T) {
	app := setupApp(provider.NewFake())
	req := httptest.NewRequest("POST", "/documents", strings.NewReader(""))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	resp, _ := app.Test(req)
	if resp.StatusCode != 400 {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestUpload_InvalidMime(t *testing.T) {
	app := setupApp(provider.NewFake())
	body, ct := buildMultipart(t, "application/x-executable", 100, map[string]string{
		"external_user_id": "u", "category_id": "1",
	})
	req := httptest.NewRequest("POST", "/documents", body)
	req.Header.Set("Content-Type", ct)
	resp, _ := app.Test(req)
	if resp.StatusCode != 415 {
		t.Errorf("expected 415 invalid mime, got %d", resp.StatusCode)
	}
}

func TestUpload_FileTooLarge(t *testing.T) {
	app := setupApp(provider.NewFake())
	// Bikin body 9 MiB > cap 8 MiB.
	body, ct := buildMultipart(t, "image/jpeg", 9*1024*1024, map[string]string{
		"external_user_id": "u", "category_id": "1",
	})
	req := httptest.NewRequest("POST", "/documents", body)
	req.Header.Set("Content-Type", ct)
	resp, _ := app.Test(req)
	if resp.StatusCode != 413 {
		t.Errorf("expected 413 too large, got %d", resp.StatusCode)
	}
}

func TestUpload_MissingExternalUserID(t *testing.T) {
	app := setupApp(provider.NewFake())
	body, ct := buildMultipart(t, "image/jpeg", 100, map[string]string{"category_id": "1"})
	req := httptest.NewRequest("POST", "/documents", body)
	req.Header.Set("Content-Type", ct)
	resp, _ := app.Test(req)
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 missing external_user_id, got %d", resp.StatusCode)
	}
}

func TestList_MissingQuery(t *testing.T) {
	app := setupApp(provider.NewFake())
	resp, _ := app.Test(httptest.NewRequest("GET", "/documents", nil))
	if resp.StatusCode != 400 {
		t.Errorf("expected 400 missing external_user_id, got %d", resp.StatusCode)
	}
}

func TestList_Success(t *testing.T) {
	fake := provider.NewFake()
	fake.ListDocumentsFn = func(ctx context.Context, externalUserID string) (*provider.DocumentsListResponse, error) {
		if externalUserID != "user-1" {
			t.Errorf("external_user_id mismatch: %s", externalUserID)
		}
		return &provider.DocumentsListResponse{Items: []provider.DocumentItem{
			{ID: 1, Filename: "ktp.jpg", CategoryID: 5, Status: "pending"},
		}}, nil
	}
	app := setupApp(fake)
	resp, _ := app.Test(httptest.NewRequest("GET", "/documents?external_user_id=user-1", nil))
	if resp.StatusCode != 200 {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}
}
