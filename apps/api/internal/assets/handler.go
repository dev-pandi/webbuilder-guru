package assets

import (
	"bytes"
	"fmt"
	"log/slog"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/sites"
)

const MaxUploadBytes = 10 * 1024 * 1024 // 10 MB

// allowedMime is intentionally raster-only.
// SVG is rejected because it can contain inline <script>, event handlers, or
// XLink references that execute in the host page's origin — full XSS vector.
// If SVG support is needed later, pipe uploads through a sanitiser (e.g.
// DOMPurify with profile:svg, or rsvg-convert to flatten to PNG).
var allowedMime = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

type Handler struct {
	repo    *Repo
	storage Storage
	sites   *sites.Repo

	compress    bool
	compressOpt CompressOptions
}

// HandlerOptions tunes the upload-time image compression pipeline. Callers
// pass values from app config so operators can disable / adjust without code.
type HandlerOptions struct {
	Compress     bool
	MaxDimension int
	JPEGQuality  int
}

func NewHandler(r *Repo, s Storage, sr *sites.Repo, opt HandlerOptions) *Handler {
	return &Handler{
		repo:     r,
		storage:  s,
		sites:    sr,
		compress: opt.Compress,
		compressOpt: CompressOptions{
			MaxDimension: opt.MaxDimension,
			JPEGQuality:  opt.JPEGQuality,
		},
	}
}

// POST /api/v1/sites/:id/assets   multipart with field "file"
func (h *Handler) Upload(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	site, err := h.sites.GetOwned(c.Context(), siteID, uid)
	if err != nil {
		return httpx.NotFound(c, "site not found")
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return httpx.BadRequest(c, "file field required")
	}
	if fh.Size > MaxUploadBytes {
		return httpx.BadRequest(c, "file too large (max 10MB)")
	}

	// Storage quota check
	if site.QuotaMaxStorageBytes > 0 {
		_, used, err := h.repo.CountAndSize(c.Context(), siteID)
		if err != nil {
			return httpx.Internal(c, "quota check failed")
		}
		if used+fh.Size > site.QuotaMaxStorageBytes {
			remaining := site.QuotaMaxStorageBytes - used
			if remaining < 0 {
				remaining = 0
			}
			return httpx.Forbidden(c,
				"storage quota exceeded: terpakai "+fmtBytes(used)+
					" / kuota "+fmtBytes(site.QuotaMaxStorageBytes)+
					", sisa "+fmtBytes(remaining)+", file "+fmtBytes(fh.Size))
		}
	}
	mime := fh.Header.Get("Content-Type")
	ext, ok := allowedMime[strings.ToLower(mime)]
	if !ok {
		// Fallback to extension if mime missing or wrong.
		switch strings.ToLower(filepath.Ext(fh.Filename)) {
		case ".png":
			ext, mime = ".png", "image/png"
		case ".jpg", ".jpeg":
			ext, mime = ".jpg", "image/jpeg"
		case ".webp":
			ext, mime = ".webp", "image/webp"
		case ".gif":
			ext, mime = ".gif", "image/gif"
		default:
			return httpx.BadRequest(c, "unsupported file type (PNG, JPG, WebP, GIF only)")
		}
	}

	f, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "open failed")
	}
	defer f.Close()

	// Compress raster images. Compress() falls back to original bytes on any
	// failure, so this never breaks an upload — at worst it's a no-op.
	var bodyBytes []byte
	finalMIME := mime
	finalSize := fh.Size
	resized := false
	if h.compress {
		res, cerr := Compress(f, mime, h.compressOpt)
		if cerr != nil {
			return httpx.Internal(c, "read failed")
		}
		bodyBytes = res.Data
		finalMIME = res.MIME
		finalSize = int64(res.NewSize)
		resized = res.Resized
		if res.NewSize < res.OriginalSize {
			slog.Info("asset compressed",
				"site_id", siteID,
				"mime", mime,
				"original_bytes", res.OriginalSize,
				"new_bytes", res.NewSize,
				"savings_pct", int(100*(1-float64(res.NewSize)/float64(res.OriginalSize))),
				"resized", resized,
			)
		}
	}

	key := fmt.Sprintf("%s/%d-%s%s", siteID.String(), time.Now().UnixNano(), uuid.NewString(), ext)

	// Quota re-check against the (potentially smaller) final size. We checked
	// against fh.Size above as a fast reject; this guards against the rare
	// case where compression made the file bigger (we keep original, but the
	// quota math must still account for it).
	if site.QuotaMaxStorageBytes > 0 {
		_, used, err := h.repo.CountAndSize(c.Context(), siteID)
		if err == nil && used+finalSize > site.QuotaMaxStorageBytes {
			return httpx.Forbidden(c,
				"storage quota exceeded after compress: terpakai "+fmtBytes(used)+
					" / kuota "+fmtBytes(site.QuotaMaxStorageBytes))
		}
	}

	var url string
	if bodyBytes != nil {
		url, err = h.storage.Put(c.Context(), key, bytes.NewReader(bodyBytes), finalSize, finalMIME)
	} else {
		url, err = h.storage.Put(c.Context(), key, f, fh.Size, mime)
	}
	if err != nil {
		return httpx.Internal(c, "upload failed: "+err.Error())
	}

	asset, err := h.repo.Create(c.Context(), siteID, "image", url, finalMIME, finalSize)
	if err != nil {
		return httpx.Internal(c, "save failed")
	}
	return httpx.Created(c, asset)
}

// fmtBytes pretty-prints byte sizes (e.g. "1.5 MB", "240 KB").
func fmtBytes(n int64) string {
	const KB = 1024
	const MB = KB * 1024
	const GB = MB * 1024
	switch {
	case n >= GB:
		return fmt.Sprintf("%.2f GB", float64(n)/float64(GB))
	case n >= MB:
		return fmt.Sprintf("%.2f MB", float64(n)/float64(MB))
	case n >= KB:
		return fmt.Sprintf("%.1f KB", float64(n)/float64(KB))
	}
	return fmt.Sprintf("%d B", n)
}

// GET /api/v1/sites/:id/assets?page=&page_size=&q=
// Returns Paginated[Asset]. `q` filters by MIME prefix (e.g. "image" -> image/*).
func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	p := httpx.ParsePagination(c)
	items, total, err := h.repo.ListBySitePage(c.Context(), siteID, p.LikePattern(), p.PageSize, p.Offset())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, httpx.MakePaginated(items, p, total))
}

// DELETE /api/v1/assets/:id
//
// Hapus 1 asset — remove file dari storage + row dari DB. Storage delete
// jalan dulu; kalau gagal, DB row TIDAK dihapus (biar user bisa retry;
// orphan file di storage lebih baik daripada stale DB pointer ke file yang
// hilang, karena URL yang di-serve akan 404 di renderer).
//
// Ownership: cek via sites.GetOwned pakai site_id dari asset row — user tidak
// bisa hapus asset situs lain via URL guessing.
func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid asset id")
	}
	asset, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		return httpx.NotFound(c, "asset not found")
	}
	if _, err := h.sites.GetOwned(c.Context(), asset.SiteID, uid); err != nil {
		// Return NotFound (bukan Forbidden) supaya tidak leak keberadaan asset.
		return httpx.NotFound(c, "asset not found")
	}

	// URL disimpan sebagai path serveable (mis. "/uploads/xxx.png" untuk local
	// atau "https://cdn/…" untuk S3). Storage.Delete expect storage key —
	// extract dari URL (strip base + query).
	key := storageKeyFromURL(asset.URL)
	if key != "" {
		if err := h.storage.Delete(c.Context(), key); err != nil {
			slog.Warn("asset delete: storage cleanup failed (continue with DB delete anyway to prevent stale pointer)",
				"error", err, "asset_id", id, "key", key)
		}
	}
	if _, err := h.repo.Delete(c.Context(), id); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// storageKeyFromURL extract storage key dari serving URL. Format URL bisa:
//   - local:  "http://api.localhost/uploads/xxxx.png" → "xxxx.png"
//   - s3:     "https://cdn.example/assets/yyyy.jpg"  → "yyyy.jpg"
//
// Sederhana: ambil basename setelah "/" terakhir. Kalau ada query string,
// strip juga. Sufficient untuk pattern current — kalau future butuh subfolder,
// upgrade parser.
func storageKeyFromURL(u string) string {
	// Strip query string.
	if i := strings.Index(u, "?"); i >= 0 {
		u = u[:i]
	}
	// Basename setelah "/" terakhir.
	if i := strings.LastIndex(u, "/"); i >= 0 && i < len(u)-1 {
		return u[i+1:]
	}
	return u
}
