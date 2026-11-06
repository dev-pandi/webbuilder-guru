package abuse

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/mail"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

const (
	MaxFiles        = 5
	MaxFileBytes    = 5 << 20  // 5 MB per berkas
	MaxTotalBytes   = 20 << 20 // di bawah BodyLimit fiber 25 MB
	minDescription  = 20
	maxDescription  = 5000
	maxReasonLength = 500
)

// Tipe ditentukan dari BYTE berkas (http.DetectContentType), bukan header
// Content-Type kiriman klien: endpoint ini anonim, jadi header itu bebas
// dipalsukan — HTML berlabel image/png tidak boleh lolos.
var allowedSniffed = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/webp":      ".webp",
	"image/gif":       ".gif",
	"application/pdf": ".pdf",
}

type Handler struct {
	repo    *Repo
	storage assets.Storage
	audit   *audit.Repo
}

func NewHandler(r *Repo, s assets.Storage, a *audit.Repo) *Handler {
	return &Handler{repo: r, storage: s, audit: a}
}

// Submit — POST /api/v1/public/abuse-reports (anonim, multipart).
func (h *Handler) Submit(c *fiber.Ctx) error {
	// Honeypot: field tersembunyi yang hanya diisi bot. Balas sukses palsu
	// supaya bot tidak belajar bahwa ia tertangkap.
	if strings.TrimSpace(c.FormValue("website_confirm")) != "" {
		return httpx.Created(c, fiber.Map{"id": uuid.NewString()})
	}

	rawURL := strings.TrimSpace(c.FormValue("url"))
	host := NormalizeHost(rawURL)
	if rawURL == "" || len(rawURL) > 2048 || host == "" || !strings.Contains(host, ".") {
		return httpx.BadRequest(c, "Alamat situs atau domain tidak valid.")
	}
	category := c.FormValue("category")
	if _, ok := Categories[category]; !ok {
		return httpx.BadRequest(c, "Kategori aduan tidak dikenal.")
	}
	desc := strings.TrimSpace(c.FormValue("description"))
	if n := utf8.RuneCountInString(desc); n < minDescription || n > maxDescription {
		return httpx.BadRequest(c, fmt.Sprintf("Uraian wajib %d–%d karakter.", minDescription, maxDescription))
	}
	email := strings.TrimSpace(c.FormValue("reporter_email"))
	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email || len(email) > 254 {
		return httpx.BadRequest(c, "Email pelapor tidak valid.")
	}
	name := strings.TrimSpace(c.FormValue("reporter_name"))
	if utf8.RuneCountInString(name) > 120 {
		return httpx.BadRequest(c, "Nama terlalu panjang.")
	}

	var headers []*multipart.FileHeader
	if form, err := c.MultipartForm(); err == nil && form != nil {
		headers = form.File["files"]
	}
	if len(headers) == 0 {
		return httpx.BadRequest(c, "Lampirkan minimal satu bukti (tangkapan layar atau PDF).")
	}
	if len(headers) > MaxFiles {
		return httpx.BadRequest(c, fmt.Sprintf("Maksimal %d berkas bukti.", MaxFiles))
	}

	// Validasi SEMUA berkas dulu sebelum menyimpan satu pun, supaya aduan
	// yang ditolak tidak meninggalkan berkas yatim di storage.
	type pending struct {
		body     []byte
		mime     string
		ext      string
		filename string
	}
	var total int64
	items := make([]pending, 0, len(headers))
	for _, fh := range headers {
		if fh.Size <= 0 {
			return httpx.BadRequest(c, "Ada berkas kosong.")
		}
		if fh.Size > MaxFileBytes {
			return httpx.BadRequest(c, fmt.Sprintf("Berkas %q melebihi 5 MB.", fh.Filename))
		}
		total += fh.Size
		if total > MaxTotalBytes {
			return httpx.BadRequest(c, "Total ukuran bukti melebihi 20 MB.")
		}
		f, err := fh.Open()
		if err != nil {
			return httpx.Internal(c, "gagal membaca berkas")
		}
		body, err := io.ReadAll(io.LimitReader(f, MaxFileBytes+1))
		f.Close()
		if err != nil {
			return httpx.Internal(c, "gagal membaca berkas")
		}
		if len(body) > MaxFileBytes {
			return httpx.BadRequest(c, fmt.Sprintf("Berkas %q melebihi 5 MB.", fh.Filename))
		}
		mime := http.DetectContentType(body)
		if i := strings.Index(mime, ";"); i >= 0 {
			mime = mime[:i]
		}
		ext, ok := allowedSniffed[mime]
		if !ok {
			return httpx.BadRequest(c, fmt.Sprintf("Berkas %q bukan gambar (JPG/PNG/WEBP/GIF) atau PDF.", fh.Filename))
		}
		items = append(items, pending{body: body, mime: mime, ext: ext, filename: sanitizeFilename(fh.Filename)})
	}

	if h.storage == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "storage_unavailable",
			"Penyimpanan bukti sedang tidak tersedia. Coba lagi nanti.")
	}

	// Key opak tanpa identitas pelapor; tidak pernah diberikan ke publik —
	// admin membacanya lewat endpoint berautentikasi (File).
	prefix := time.Now().UTC().Format("2006/01")
	files := make([]File, 0, len(items))
	cleanup := func() {
		for _, f := range files {
			_ = h.storage.Delete(c.Context(), f.StorageKey)
		}
	}
	for _, it := range items {
		key := fmt.Sprintf("abuse/%s/%s%s", prefix, uuid.NewString(), it.ext)
		if _, err := h.storage.Put(c.Context(), key, bytes.NewReader(it.body), int64(len(it.body)), it.mime); err != nil {
			cleanup()
			slog.Error("abuse: storage put failed", "error", err)
			return httpx.Internal(c, "gagal menyimpan bukti")
		}
		files = append(files, File{StorageKey: key, Filename: it.filename, MimeType: it.mime, SizeBytes: int64(len(it.body))})
	}

	siteID, err := h.repo.ResolveSiteID(c.Context(), host)
	if err != nil {
		// Bukan alasan menolak aduan — admin tetap bisa mencocokkan manual.
		slog.Warn("abuse: resolve site failed", "host", host, "error", err)
		siteID = nil
	}

	rep := &Report{
		ReportedURL:  rawURL,
		ReportedHost: host,
		Category:     category,
		Description:  desc,
		ReporterName: name,
		ReporterMail: email,
		ReporterIP:   c.IP(),
		SiteID:       siteID,
	}
	if err := h.repo.Create(c.Context(), rep, files); err != nil {
		cleanup()
		slog.Error("abuse: create failed", "error", err)
		return httpx.Internal(c, "gagal menyimpan aduan")
	}

	h.log(c, nil, audit.EventAbuseReported, "abuse_report", rep.ID.String(), map[string]any{
		"host": host, "category": category, "files": len(files), "site_matched": siteID != nil,
	})
	// Nomor referensi pendek untuk pelapor; ID lengkap tetap di DB.
	return httpx.Created(c, fiber.Map{
		"id":        rep.ID.String(),
		"reference": strings.ToUpper(rep.ID.String()[:8]),
	})
}

// --- Admin -----------------------------------------------------------------

// List — GET /api/v1/admin/abuse-reports
func (h *Handler) List(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	status := c.Query("status")
	if status != "" && !Statuses[status] {
		return httpx.BadRequest(c, "status tidak dikenal")
	}
	items, total, err := h.repo.List(c.Context(), ListFilter{
		Status: status,
		Q:      p.LikePattern(),
		Limit:  p.PageSize,
		Offset: p.Offset(),
	})
	if err != nil {
		slog.Error("abuse: list failed", "error", err)
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// Get — GET /api/v1/admin/abuse-reports/:id (aduan + bukti + situs/domain).
func (h *Handler) Get(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	rep, files, err := h.repo.Get(c.Context(), id)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "aduan tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}
	out := fiber.Map{
		"report":         rep,
		"files":          files,
		"category_label": Categories[rep.Category],
	}
	// Situs dicek ulang saat dibuka: kalau pemilik baru memasang domain
	// setelah aduan masuk, admin tetap melihat kecocokannya.
	siteID := rep.SiteID
	if siteID == nil {
		if sid, err := h.repo.ResolveSiteID(c.Context(), rep.ReportedHost); err == nil {
			siteID = sid
		}
	}
	if siteID != nil {
		if s, err := h.repo.SiteInfo(c.Context(), *siteID); err == nil {
			out["site"] = s
		}
	}
	if d, err := h.repo.DomainInfo(c.Context(), rep.ReportedHost); err == nil {
		out["domain"] = d
	}
	return httpx.OK(c, out)
}

// File — GET /api/v1/admin/abuse-reports/:id/files/:fileId
// Satu-satunya jalan membaca bukti; storage key tidak pernah diekspos.
func (h *Handler) File(c *fiber.Ctx) error {
	rid, err1 := uuid.Parse(c.Params("id"))
	fid, err2 := uuid.Parse(c.Params("fileId"))
	if err1 != nil || err2 != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	f, err := h.repo.GetFile(c.Context(), rid, fid)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "berkas tidak ditemukan")
	}
	if err != nil || h.storage == nil {
		return httpx.Internal(c, "lookup failed")
	}
	rc, err := h.storage.Get(c.Context(), f.StorageKey)
	if err != nil {
		return httpx.NotFound(c, "berkas tidak tersedia di storage")
	}
	defer rc.Close()
	body, err := io.ReadAll(io.LimitReader(rc, MaxFileBytes+1))
	if err != nil {
		return httpx.Internal(c, "read failed")
	}
	// Tipe dari hasil sniff saat upload; nosniff + sandbox mencegah browser
	// menafsirkan ulang berkas kiriman publik sebagai dokumen aktif.
	c.Set(fiber.HeaderContentType, f.MimeType)
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'")
	c.Set(fiber.HeaderContentDisposition, `inline; filename="`+f.Filename+`"`)
	c.Set(fiber.HeaderCacheControl, "private, no-store")
	return c.Send(body)
}

type reviewReq struct {
	Status    string `json:"status"`
	AdminNote string `json:"admin_note"`
}

// Review — PATCH /api/v1/admin/abuse-reports/:id
func (h *Handler) Review(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	var req reviewReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if !Statuses[req.Status] {
		return httpx.BadRequest(c, "status tidak dikenal")
	}
	if utf8.RuneCountInString(req.AdminNote) > maxDescription {
		return httpx.BadRequest(c, "catatan terlalu panjang")
	}
	adminID := auth.UserIDFrom(c)
	if err := h.repo.UpdateReview(c.Context(), id, adminID, req.Status, strings.TrimSpace(req.AdminNote)); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "aduan tidak ditemukan")
		}
		return httpx.Internal(c, "update failed")
	}
	h.log(c, &adminID, audit.EventAbuseReviewed, "abuse_report", id.String(), map[string]any{"status": req.Status})
	return httpx.OK(c, fiber.Map{"id": id.String(), "status": req.Status})
}

type suspendReq struct {
	Reason   string `json:"reason"`
	ReportID string `json:"report_id"`
}

// SuspendSite / UnsuspendSite — POST /api/v1/admin/sites/:id/(un)suspend
func (h *Handler) SuspendSite(c *fiber.Ctx) error   { return h.toggleSite(c, true) }
func (h *Handler) UnsuspendSite(c *fiber.Ctx) error { return h.toggleSite(c, false) }

func (h *Handler) toggleSite(c *fiber.Ctx, suspend bool) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	req, msg := parseSuspend(c, suspend)
	if msg != "" {
		return httpx.BadRequest(c, msg)
	}
	adminID := auth.UserIDFrom(c)
	if err := h.repo.SetSiteSuspended(c.Context(), id, &adminID, req.Reason, suspend); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "situs tidak ditemukan")
		}
		return httpx.Internal(c, "update failed")
	}
	ev := audit.EventSiteUnsuspended
	if suspend {
		ev = audit.EventSiteSuspended
	}
	h.log(c, &adminID, ev, "site", id.String(), map[string]any{"reason": req.Reason, "report_id": req.ReportID})
	return httpx.OK(c, fiber.Map{"id": id.String(), "suspended": suspend})
}

// SuspendDomain / UnsuspendDomain — POST /api/v1/admin/domains/:name/(un)suspend
// Penangguhan di platform: situs berhenti disajikan di domain ini. Bukan
// penangguhan di registry (serverHold) — itu wewenang PANDI lewat EPP.
func (h *Handler) SuspendDomain(c *fiber.Ctx) error   { return h.toggleDomain(c, true) }
func (h *Handler) UnsuspendDomain(c *fiber.Ctx) error { return h.toggleDomain(c, false) }

func (h *Handler) toggleDomain(c *fiber.Ctx, suspend bool) error {
	name := NormalizeHost(c.Params("name"))
	if name == "" {
		return httpx.BadRequest(c, "domain tidak valid")
	}
	req, msg := parseSuspend(c, suspend)
	if msg != "" {
		return httpx.BadRequest(c, msg)
	}
	adminID := auth.UserIDFrom(c)
	if err := h.repo.SetDomainSuspended(c.Context(), name, &adminID, req.Reason, suspend); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "domain tidak terdaftar lewat platform")
		}
		return httpx.Internal(c, "update failed")
	}
	ev := audit.EventDomainUnsuspended
	if suspend {
		ev = audit.EventDomainSuspended
	}
	h.log(c, &adminID, ev, "domain", name, map[string]any{"reason": req.Reason, "report_id": req.ReportID})
	return httpx.OK(c, fiber.Map{"name": name, "suspended": suspend})
}

// parseSuspend mengembalikan PESAN validasi, bukan error: httpx.BadRequest
// mengembalikan nil setelah sukses menulis respons, jadi memakainya sebagai
// sinyal "berhenti" akan membuat handler lanjut men-suspend tanpa alasan.
func parseSuspend(c *fiber.Ctx, suspend bool) (suspendReq, string) {
	var req suspendReq
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&req); err != nil {
			return req, "invalid json"
		}
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if suspend && req.Reason == "" {
		// Alasan wajib: tampil ke pengunjung situs dan jadi jejak audit.
		return req, "Alasan penangguhan wajib diisi."
	}
	if utf8.RuneCountInString(req.Reason) > maxReasonLength {
		return req, "Alasan maksimal " + strconv.Itoa(maxReasonLength) + " karakter."
	}
	return req, ""
}

func (h *Handler) log(c *fiber.Ctx, actor *uuid.UUID, event, ttype, tid string, meta map[string]any) {
	if h.audit == nil {
		return
	}
	if err := h.audit.Log(c.Context(), audit.Params{
		ActorID: actor, Event: event, TargetType: ttype, TargetID: tid,
		Metadata: meta, IP: c.IP(), UserAgent: c.Get(fiber.HeaderUserAgent),
	}); err != nil {
		slog.Warn("abuse: audit log failed", "event", event, "error", err)
	}
}

// sanitizeFilename — nama asli hanya untuk tampilan admin; buang path dan
// karakter yang bisa merusak header Content-Disposition.
func sanitizeFilename(name string) string {
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r == '"' || r == '\r' || r == '\n' || r < 0x20 {
			return -1
		}
		return r
	}, name)
	if utf8.RuneCountInString(name) > 120 {
		name = string([]rune(name)[:120])
	}
	if name == "" || name == "." {
		return "bukti"
	}
	return name
}
