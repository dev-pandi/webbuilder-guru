package assets

import (
	"fmt"
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

var allowedMime = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif":  ".gif",
	"image/svg+xml": ".svg",
}

type Handler struct {
	repo    *Repo
	storage Storage
	sites   *sites.Repo
}

func NewHandler(r *Repo, s Storage, sr *sites.Repo) *Handler {
	return &Handler{repo: r, storage: s, sites: sr}
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
		case ".svg":
			ext, mime = ".svg", "image/svg+xml"
		default:
			return httpx.BadRequest(c, "unsupported file type")
		}
	}

	f, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "open failed")
	}
	defer f.Close()

	key := fmt.Sprintf("%s/%d-%s%s", siteID.String(), time.Now().UnixNano(), uuid.NewString(), ext)
	url, err := h.storage.Put(c.Context(), key, f, fh.Size, mime)
	if err != nil {
		return httpx.Internal(c, "upload failed: "+err.Error())
	}

	asset, err := h.repo.Create(c.Context(), siteID, "image", url, mime, fh.Size)
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

// GET /api/v1/sites/:id/assets
func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	out, err := h.repo.ListBySite(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, out)
}
