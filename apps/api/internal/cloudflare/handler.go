package cloudflare

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/httpx"
)

// Handler admin CRUD untuk cloudflare_configs. Mounted di `/api/v1/admin/*`.
// Non-admin tidak boleh akses (di-enforce di router via auth.RequireAdmin).
type Handler struct{ repo *Repo }

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// configResp = shape response ke UI. `APIToken` di-mask (hanya prefix + suffix)
// supaya kalau admin lihat list, token full tidak leak ke UI/log/browser cache.
// Untuk edit, user re-input full token kalau mau rotate.
type configResp struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	APITokenMasked string `json:"api_token_masked"`
	AccountID      string `json:"account_id"`
	IsDefault      bool   `json:"is_default"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

func toResp(c *Config) configResp {
	return configResp{
		ID:             c.ID.String(),
		Name:           c.Name,
		APITokenMasked: maskToken(c.APIToken),
		AccountID:      c.AccountID,
		IsDefault:      c.IsDefault,
		CreatedAt:      c.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt:      c.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
}

func maskToken(t string) string {
	if len(t) < 12 {
		return "****"
	}
	return t[:4] + "…" + t[len(t)-4:]
}

func (h *Handler) List(c *fiber.Ctx) error {
	items, err := h.repo.List(c.Context())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	out := make([]configResp, 0, len(items))
	for i := range items {
		out = append(out, toResp(&items[i]))
	}
	return httpx.OK(c, out)
}

type createReq struct {
	Name      string `json:"name"`
	APIToken  string `json:"api_token"`
	AccountID string `json:"account_id"`
	IsDefault bool   `json:"is_default"`
	Verify    bool   `json:"verify"` // kalau true, verify token ke CF sebelum save
}

func (h *Handler) Create(c *fiber.Ctx) error {
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.APIToken = strings.TrimSpace(req.APIToken)
	req.AccountID = strings.TrimSpace(req.AccountID)
	if req.Name == "" || req.APIToken == "" || req.AccountID == "" {
		return httpx.BadRequest(c, "name, api_token, account_id wajib")
	}

	cfg := Config{
		Name: req.Name, APIToken: req.APIToken, AccountID: req.AccountID, IsDefault: req.IsDefault,
	}
	if req.Verify {
		if err := NewClient(cfg).VerifyToken(c.Context()); err != nil {
			return httpx.Err(c, fiber.StatusBadRequest, "invalid_token", err.Error())
		}
	}
	if err := h.repo.Create(c.Context(), &cfg); err != nil {
		return httpx.Internal(c, "create failed: "+err.Error())
	}
	return httpx.OK(c, toResp(&cfg))
}

type updateReq struct {
	Name      *string `json:"name,omitempty"`
	APIToken  *string `json:"api_token,omitempty"`
	AccountID *string `json:"account_id,omitempty"`
	IsDefault *bool   `json:"is_default,omitempty"`
}

func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	// Trim string pointers.
	trim := func(p *string) *string {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		return &v
	}
	updated, err := h.repo.Update(c.Context(), id,
		trim(req.Name), trim(req.APIToken), trim(req.AccountID), req.IsDefault,
	)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "config not found")
		}
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, toResp(updated))
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "config not found")
		}
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// SetDefault promote config ini jadi default. Config lain otomatis unset
// (di-handle di repo dalam 1 transaction).
func (h *Handler) SetDefault(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.SetDefault(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "config not found")
		}
		return httpx.Internal(c, "set default failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// VerifyStored panggil VerifyToken untuk config existing (tidak return
// token — hanya boolean valid). Dipakai UI "test connection" button.
func (h *Handler) VerifyStored(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	cfg, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "config not found")
		}
		return httpx.Internal(c, "lookup failed")
	}
	if err := NewClient(*cfg).VerifyToken(c.Context()); err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "invalid_token", err.Error())
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}
