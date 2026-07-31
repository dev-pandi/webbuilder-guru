// Package documents — HTTP handler untuk KTP/NPWP upload flow (zone .id).
// Multipart parse di sini, forward via Provider ke registrar backend.
package documents

import (
	"errors"
	"io"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/httpx"
	"github.com/webbuilder/api-registry/internal/provider"
)

// MaxFileSize — hard cap 8 MiB. Konsumer wajib pre-validate juga (feedback
// cepat), tapi ini defence in depth kalau lolos.
const MaxFileSize = 8 * 1024 * 1024

// AllowedMimes — MIME whitelist. Registrar juga validate, tapi kita reject
// upfront supaya tidak buang bandwidth ke upstream.
var AllowedMimes = map[string]bool{
	"image/jpeg":      true,
	"image/jpg":       true,
	"image/png":       true,
	"application/pdf": true,
}

type Handler struct {
	provider provider.Provider
}

func NewHandler(p provider.Provider) *Handler { return &Handler{provider: p} }

// Upload — POST /v1/documents (multipart/form-data)
//
// Fields:
//   file             (required, binary) — max 8 MiB
//   external_user_id (required, string) — user_id di web builder
//   category_id      (required, int)    — dari registrar categories
//   name             (optional, string) — human label
func (h *Handler) Upload(c *fiber.Ctx) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return httpx.BadRequest(c, "field 'file' wajib (multipart)")
	}
	if fh.Size > MaxFileSize {
		return httpx.Err(c, fiber.StatusRequestEntityTooLarge, "file_too_large",
			"file terlalu besar (max 8 MiB)")
	}
	contentType := fh.Header.Get("Content-Type")
	if !AllowedMimes[contentType] {
		return httpx.Err(c, fiber.StatusUnsupportedMediaType, "invalid_mime",
			"content-type harus image/jpeg, image/png, atau application/pdf")
	}

	externalUserID := c.FormValue("external_user_id")
	if externalUserID == "" {
		return httpx.BadRequest(c, "external_user_id wajib")
	}
	categoryStr := c.FormValue("category_id")
	if categoryStr == "" {
		return httpx.BadRequest(c, "category_id wajib")
	}
	categoryID, err := strconv.ParseInt(categoryStr, 10, 64)
	if err != nil || categoryID <= 0 {
		return httpx.BadRequest(c, "category_id harus integer > 0")
	}

	// Baca file body ke memory (max 8 MiB, aman untuk in-memory).
	f, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "gagal buka file: "+err.Error())
	}
	defer f.Close()
	body, err := io.ReadAll(f)
	if err != nil {
		return httpx.Internal(c, "gagal baca file: "+err.Error())
	}

	res, err := h.provider.UploadDocument(c.Context(), provider.UploadDocumentRequest{
		ExternalUserID: externalUserID,
		CategoryID:     categoryID,
		Filename:       fh.Filename,
		ContentType:    contentType,
		Body:           body,
		Label:          c.FormValue("name"),
	})
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.Created(c, res)
}

// List — GET /v1/documents?external_user_id=<uuid>
func (h *Handler) List(c *fiber.Ctx) error {
	externalUserID := c.Query("external_user_id")
	if externalUserID == "" {
		return httpx.BadRequest(c, "external_user_id wajib (cegah cross-user leak)")
	}
	res, err := h.provider.ListDocuments(c.Context(), externalUserID)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

func mapErr(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, provider.ErrNotFound):
		return httpx.NotFound(c, err.Error())
	case errors.Is(err, provider.ErrValidation):
		return httpx.BadRequest(c, err.Error())
	case errors.Is(err, provider.ErrCapabilityMissing):
		return httpx.ServiceUnavailable(c, "capability_missing", err.Error())
	default:
		return httpx.BadGateway(c, err.Error())
	}
}
