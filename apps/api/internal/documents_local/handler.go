// handler.go — endpoint dokumen kepatuhan (self-sufficient). Blob disimpan
// di assets.Storage, metadata di tabel documents.

package documents_local

import (
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// MaxUploadBytes — batas upload dokumen. Cukup untuk scan KTP quality tinggi
// (biasa 2-5 MB) tapi guard against DoS.
const MaxUploadBytes int64 = 10 * 1024 * 1024 // 10 MB

// allowedMime — dokumen kepatuhan biasanya JPG/PNG (foto scan) atau PDF.
var allowedMime = map[string]string{
	"image/jpeg":      ".jpg",
	"image/jpg":       ".jpg",
	"image/png":       ".png",
	"application/pdf": ".pdf",
}

type Handler struct {
	repo    *Repo
	storage assets.Storage
}

func NewHandler(r *Repo, s assets.Storage) *Handler {
	return &Handler{repo: r, storage: s}
}

// GET /api/v1/documents/categories — static catalog. Public shape:
// [{id, name, parent_id?}]. Tidak butuh auth (di-mount di authed group
// biar konsisten dengan endpoint lain, tapi tidak leak PII).
func (h *Handler) ListCategories(c *fiber.Ctx) error {
	return httpx.OK(c, Categories())
}

// GET /api/v1/documents?category_id=N — list milik user login.
// Response: {items: Document[]}
func (h *Handler) ListMine(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	var categoryID int16
	if v := c.Query("category_id"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return httpx.BadRequest(c, "category_id harus positive integer")
		}
		categoryID = int16(n)
	}
	items, err := h.repo.ListByUser(c.Context(), uid, categoryID)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	// Adapt ke shape lama supaya frontend tidak butuh rewrite besar:
	// {id, name, category_id, category_name, doc_url, created_at}.
	view := make([]map[string]any, 0, len(items))
	catName := categoryNameMap()
	for _, d := range items {
		view = append(view, map[string]any{
			"id":            d.ID.String(),
			"name":          d.Filename,
			"category_id":   d.CategoryID,
			"category_name": catName[d.CategoryID],
			"mime_type":     d.MimeType,
			"size_bytes":    d.SizeBytes,
			"created_at":    d.CreatedAt.Format(time.RFC3339),
		})
	}
	return httpx.OK(c, fiber.Map{"items": view})
}

// POST /api/v1/documents (multipart)
// Fields: file, category_id
// Response: Document metadata.
func (h *Handler) Upload(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}

	catIDStr := strings.TrimSpace(c.FormValue("category_id"))
	if catIDStr == "" {
		return httpx.BadRequest(c, "category_id wajib")
	}
	catID64, err := strconv.Atoi(catIDStr)
	if err != nil {
		return httpx.BadRequest(c, "category_id harus integer")
	}
	catID := int16(catID64)
	if !IsValidCategory(catID) {
		return httpx.BadRequest(c, "category_id tidak dikenal")
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return httpx.BadRequest(c, "field 'file' wajib")
	}
	if fh.Size <= 0 {
		return httpx.BadRequest(c, "file kosong")
	}
	if fh.Size > MaxUploadBytes {
		return httpx.BadRequest(c, "file terlalu besar (max 10 MB)")
	}
	mime := strings.ToLower(fh.Header.Get("Content-Type"))
	ext, ok := allowedMime[mime]
	if !ok {
		// Fallback ke extension.
		switch strings.ToLower(filepath.Ext(fh.Filename)) {
		case ".jpg", ".jpeg":
			ext, mime = ".jpg", "image/jpeg"
		case ".png":
			ext, mime = ".png", "image/png"
		case ".pdf":
			ext, mime = ".pdf", "application/pdf"
		default:
			return httpx.BadRequest(c, "hanya JPG/PNG/PDF yang diterima")
		}
	}

	f, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "open failed")
	}
	defer f.Close()
	body, err := io.ReadAll(io.LimitReader(f, MaxUploadBytes+1))
	if err != nil {
		return httpx.Internal(c, "read failed")
	}
	if int64(len(body)) > MaxUploadBytes {
		return httpx.BadRequest(c, "file terlalu besar")
	}

	// Storage key — path opaque, tidak leak identitas via URL scan.
	// Convention: documents/{user_id}/{ts}-{uuid}{ext}
	key := fmt.Sprintf("documents/%s/%d-%s%s",
		uid.String(), time.Now().UnixNano(), uuid.NewString(), ext)

	if _, err := h.storage.Put(c.Context(), key,
		bytes.NewReader(body), int64(len(body)), mime); err != nil {
		return httpx.Internal(c, "upload gagal: "+err.Error())
	}

	d := &Document{
		UserID:     uid,
		CategoryID: catID,
		Filename:   sanitizeFilename(fh.Filename),
		StorageKey: key,
		MimeType:   mime,
		SizeBytes:  int64(len(body)),
	}
	if err := h.repo.Create(c.Context(), d); err != nil {
		// Storage sudah di-put; best-effort cleanup.
		_ = h.storage.Delete(c.Context(), key)
		return httpx.Internal(c, "simpan metadata gagal: "+err.Error())
	}

	catName := categoryNameMap()
	return httpx.Created(c, map[string]any{
		"id":            d.ID.String(),
		"name":          d.Filename,
		"category_id":   d.CategoryID,
		"category_name": catName[d.CategoryID],
		"mime_type":     d.MimeType,
		"size_bytes":    d.SizeBytes,
		"created_at":    d.CreatedAt.Format(time.RFC3339),
	})
}

// GET /api/v1/documents/:id
// Return: {id, type, image} dengan `image` = base64 data URI. Shape sengaja
// match legacy supaya frontend preview dialog tidak berubah.
func (h *Handler) Show(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	d, err := h.repo.GetByID(c.Context(), id, uid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "dokumen tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	rc, err := h.storage.Get(c.Context(), d.StorageKey)
	if err != nil {
		return httpx.Internal(c, "read blob gagal: "+err.Error())
	}
	defer rc.Close()
	raw, err := io.ReadAll(io.LimitReader(rc, MaxUploadBytes+1))
	if err != nil {
		return httpx.Internal(c, "read blob gagal: "+err.Error())
	}
	return httpx.OK(c, fiber.Map{
		"id":    d.ID.String(),
		"type":  d.MimeType,
		"image": "data:" + d.MimeType + ";base64," + base64.StdEncoding.EncodeToString(raw),
	})
}

// DELETE /api/v1/documents/:id
func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	// Ambil dulu supaya bisa hapus blob.
	d, err := h.repo.GetByID(c.Context(), id, uid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "dokumen tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	if err := h.repo.Delete(c.Context(), id, uid); err != nil {
		return httpx.Internal(c, err.Error())
	}
	// Blob delete idempotent — tidak fatal kalau gagal (log level di storage).
	_ = h.storage.Delete(c.Context(), d.StorageKey)
	return httpx.OK(c, fiber.Map{"id": d.ID.String(), "deleted": true})
}

// sanitizeFilename — strip path traversal, batasi length. Kita simpan sebagai
// display name saja (tidak dipakai untuk filesystem path — itu storage_key).
func sanitizeFilename(name string) string {
	name = strings.ReplaceAll(name, "\\", "/")
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	name = strings.TrimSpace(name)
	if name == "" {
		name = "document"
	}
	if len(name) > 128 {
		name = name[:128]
	}
	return name
}

func categoryNameMap() map[int16]string {
	m := make(map[int16]string, 8)
	for _, c := range Categories() {
		m[c.ID] = c.Name
	}
	return m
}
