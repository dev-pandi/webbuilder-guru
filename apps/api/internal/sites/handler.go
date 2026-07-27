package sites

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// CachePurger — interface minimal untuk dep injection cache purge.
// Sengaja di-declare di sini (bukan di cachepurge package) supaya sites
// tidak import cachepurge → menghindari import cycle (cachepurge →
// domain_purchase → sites). Konsumer inject concrete *cachepurge.Purger
// via SetPurger; interface memenuhi kontrak yang dibutuhkan.
type CachePurger interface {
	PurgeSite(ctx context.Context, siteID uuid.UUID)
	PurgePage(ctx context.Context, siteID uuid.UUID, slug string)
}

type Handler struct {
	repo   *Repo
	purger CachePurger // nil = purge no-op
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// SetPurger inject cachepurge helper post-construction.
func (h *Handler) SetPurger(p CachePurger) { h.purger = p }

// slugRe = validasi kalau client kirim slug custom (opsional). Kalau tidak
// kirim, backend auto-generate via Slugify(name). Slug tidak lagi jadi URL
// user-facing (subdomain fallback sudah dihapus per konsep 1 domain = 1
// situs), tapi tetap disimpan sebagai identifier internal untuk backward
// compat + export folder naming.
var slugRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`)

type createReq struct {
	Slug       string          `json:"slug,omitempty"` // opsional — auto-generate kalau kosong
	Name       string          `json:"name"`
	TemplateID *uuid.UUID      `json:"template_id"`
	Theme      json.RawMessage `json:"theme"`
}

type updateReq struct {
	Name              *string         `json:"name"`
	Theme             json.RawMessage `json:"theme"`
	Status            *string         `json:"status"`
	CustomHeadCode    *string         `json:"custom_head_code"`
	CustomBodyEndCode *string         `json:"custom_body_end_code"`
}

func (h *Handler) List(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	out, err := h.repo.ListByUser(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, out)
}

func (h *Handler) Create(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return httpx.BadRequest(c, "name required")
	}
	// Slug opsional — auto-generate dari name kalau kosong. Kalau client
	// tetap kirim custom, validate format. Retry N kali dengan random suffix
	// kalau collision (slug tetap unique global untuk export folder naming).
	if req.Slug != "" && !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug format tidak valid (huruf kecil, angka, hyphen, 2-40 char)")
	}
	if req.Slug == "" {
		req.Slug = Slugify(req.Name)
	}
	s, err := h.createWithSlugRetry(c, uid, req)
	if err != nil {
		return err
	}
	return httpx.Created(c, s)
}

// createWithSlugRetry try Create sampai 5x — kalau ErrSlugTaken (client tidak
// supply slug custom), tambah random suffix. Kalau client supply custom slug
// yang collision, tetap return 409 (biar user aware).
func (h *Handler) createWithSlugRetry(c *fiber.Ctx, uid uuid.UUID, req createReq) (*Site, error) {
	userSupplied := req.Slug != "" && strings.EqualFold(req.Slug, strings.TrimSpace(req.Slug))
	// Track intent: kalau req.Slug identik dengan Slugify(name), kita di-generate — bebas retry.
	generated := req.Slug == Slugify(req.Name)

	base := req.Slug
	for attempt := 0; attempt < 5; attempt++ {
		s, err := h.repo.Create(c.Context(), uid, req.Slug, req.Name, req.TemplateID, req.Theme)
		if err == nil {
			return s, nil
		}
		if errors.Is(err, ErrSlugTaken) {
			if !generated && userSupplied {
				return nil, httpx.Conflict(c, "slug already taken")
			}
			req.Slug = base + "-" + randomSuffix()
			continue
		}
		if errors.Is(err, ErrLimitReached) {
			return nil, httpx.Forbidden(c, "site limit reached")
		}
		return nil, httpx.Internal(c, "create failed")
	}
	return nil, httpx.Internal(c, "gagal generate slug unik setelah 5 percobaan")
}

// Slugify convert nama ke URL-safe kebab-case. Contoh: "Toko Bahagia!" → "toko-bahagia".
// Kalau hasil kosong (nama semuanya non-alnum), fallback ke "site" + random suffix.
// Exported supaya paket lain (mis. templates) bisa reuse generator yang sama.
func Slugify(name string) string {
	s := strings.ToLower(name)
	// Ganti setiap run non-alnum jadi single hyphen.
	var b strings.Builder
	prevHyphen := true // hindari leading hyphen
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevHyphen = false
		} else if !prevHyphen {
			b.WriteRune('-')
			prevHyphen = true
		}
	}
	out := strings.TrimRight(b.String(), "-")
	if len(out) < 2 {
		return "site-" + randomSuffix()
	}
	if len(out) > 40 {
		out = out[:40]
		out = strings.TrimRight(out, "-")
	}
	return out
}

// randomSuffix — 6 char base36 (angka + huruf kecil). Cukup untuk cegah
// collision pada slug auto-generated tanpa bikin URL kepanjangan.
func randomSuffix() string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = chars[randInt(len(chars))]
	}
	return string(b)
}

// randInt = math/rand di-abstract supaya bisa di-mock kalau perlu deterministic
// di test. Untuk suffix collision-avoidance, entropy math/rand cukup.
func randInt(n int) int {
	return int(uuid.New().ID() % uint32(n))
}

func (h *Handler) Get(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	s, err := h.repo.GetOwned(c.Context(), id, uid)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, s)
}

func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Status != nil {
		switch *req.Status {
		case "draft", "published", "archived":
		default:
			return httpx.BadRequest(c, "invalid status")
		}
	}
	if req.CustomHeadCode != nil && len(*req.CustomHeadCode) > MaxCustomCodeBytes {
		return httpx.BadRequest(c, "custom head code melebihi 16 KB")
	}
	if req.CustomBodyEndCode != nil && len(*req.CustomBodyEndCode) > MaxCustomCodeBytes {
		return httpx.BadRequest(c, "custom body-end code melebihi 16 KB")
	}
	s, err := h.repo.Update(c.Context(), id, uid, UpdateFields{
		Name:              req.Name,
		Theme:             req.Theme,
		Status:            req.Status,
		CustomHeadCode:    req.CustomHeadCode,
		CustomBodyEndCode: req.CustomBodyEndCode,
	})
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, s)
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.Delete(c.Context(), id, uid); errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	} else if err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

func (h *Handler) Publish(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	st := "published"
	s, err := h.repo.Update(c.Context(), id, uid, UpdateFields{Status: &st})
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	}
	if err != nil {
		return httpx.Internal(c, "publish failed")
	}
	// Site publish = potensi banyak URL berubah (semua page live sekaligus).
	// Fire-and-forget purge_everything untuk zone terkait, biar edge cache
	// invalidate massal daripada per URL.
	if h.purger != nil {
		h.purger.PurgeSite(c.Context(), id)
	}
	return httpx.OK(c, s)
}
