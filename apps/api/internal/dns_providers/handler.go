package dns_providers

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/cloudflare"
	"github.com/webbuilder/api/internal/dnscloud"
	"github.com/webbuilder/api/internal/httpx"
)

// Pinger is the minimal interface a provider adapter needs to satisfy the
// admin "test connection" button. Both cloudflare.Client and dnscloud.Client
// expose a compatible method (CF has VerifyToken, DNSCloud has Ping) — we
// adapt both inside testConnection below.
type Pinger interface {
	Ping(ctx context.Context) error
}

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// --- response shaping -------------------------------------------------------

type configOut struct {
	ID           uuid.UUID  `json:"id"`
	Kind         string     `json:"kind"`
	Name         string     `json:"name"`
	AccountID    string     `json:"account_id"`
	IsDefault    bool       `json:"is_default"`
	IsActive     bool       `json:"is_active"`
	Priority     int        `json:"priority"`
	ZoneQuota    int        `json:"zone_quota"`
	ZonesCount   int        `json:"zones_count"`
	LastHealthAt *time.Time `json:"last_health_at,omitempty"`
	LastHealthOK *bool      `json:"last_health_ok,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	// api_token sengaja TIDAK di-expose — rahasia bearer, read-once semantics.
}

func toOut(c *Config) configOut {
	return configOut{
		ID: c.ID, Kind: c.Kind, Name: c.Name, AccountID: c.AccountID,
		IsDefault: c.IsDefault, IsActive: c.IsActive, Priority: c.Priority,
		ZoneQuota: c.ZoneQuota, ZonesCount: c.ZonesCount,
		LastHealthAt: c.LastHealthAt, LastHealthOK: c.LastHealthOK,
		CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
	}
}

// --- GET /admin/dns-providers -----------------------------------------------

func (h *Handler) List(c *fiber.Ctx) error {
	list, err := h.repo.List(c.Context())
	if err != nil {
		return httpx.Internal(c, "list failed: "+err.Error())
	}
	out := make([]configOut, 0, len(list))
	for i := range list {
		out = append(out, toOut(&list[i]))
	}
	return httpx.OK(c, out)
}

// --- POST /admin/dns-providers ----------------------------------------------

type createReq struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	APIToken  string `json:"api_token"`
	AccountID string `json:"account_id"`
	IsDefault bool   `json:"is_default"`
	IsActive  bool   `json:"is_active"`
	Priority  int    `json:"priority"`
	ZoneQuota int    `json:"zone_quota"`
}

func (h *Handler) Create(c *fiber.Ctx) error {
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Kind = strings.ToLower(strings.TrimSpace(req.Kind))
	req.Name = strings.TrimSpace(req.Name)
	req.APIToken = strings.TrimSpace(req.APIToken)
	if req.Name == "" {
		return httpx.BadRequest(c, "name required")
	}
	if req.APIToken == "" {
		return httpx.BadRequest(c, "api_token required")
	}
	if req.Kind != KindCloudflare && req.Kind != KindDNSCloud {
		return httpx.BadRequest(c, "kind must be 'cloudflare' or 'dnscloud'")
	}
	if req.Kind == KindCloudflare && strings.TrimSpace(req.AccountID) == "" {
		return httpx.BadRequest(c, "account_id required for cloudflare")
	}
	// Default: active + reasonable priority.
	if req.Priority <= 0 {
		req.Priority = 100
	}

	cfg, err := h.repo.Create(c.Context(), CreateInput{
		Kind: req.Kind, Name: req.Name, APIToken: req.APIToken,
		AccountID: req.AccountID, IsDefault: req.IsDefault,
		IsActive: req.IsActive, Priority: req.Priority, ZoneQuota: req.ZoneQuota,
	})
	if err != nil {
		if errors.Is(err, ErrKindInvalid) {
			return httpx.BadRequest(c, err.Error())
		}
		return httpx.Internal(c, "create failed: "+err.Error())
	}
	return httpx.Created(c, toOut(cfg))
}

// --- PATCH /admin/dns-providers/:id -----------------------------------------

type updateReq struct {
	Name      *string `json:"name,omitempty"`
	APIToken  *string `json:"api_token,omitempty"`
	AccountID *string `json:"account_id,omitempty"`
	IsDefault *bool   `json:"is_default,omitempty"`
	IsActive  *bool   `json:"is_active,omitempty"`
	Priority  *int    `json:"priority,omitempty"`
	ZoneQuota *int    `json:"zone_quota,omitempty"`
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
	cfg, err := h.repo.Update(c.Context(), id, UpdateFields{
		Name: req.Name, APIToken: req.APIToken, AccountID: req.AccountID,
		IsDefault: req.IsDefault, IsActive: req.IsActive,
		Priority: req.Priority, ZoneQuota: req.ZoneQuota,
	})
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "dns provider config not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed: "+err.Error())
	}
	return httpx.OK(c, toOut(cfg))
}

// --- DELETE /admin/dns-providers/:id ----------------------------------------

func (h *Handler) Delete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "dns provider config not found")
		}
		// Likely a FK violation (site_byo_domains/registered_domains still
		// pointing). Surface helpful message.
		return httpx.Err(c, fiber.StatusConflict, "delete_blocked",
			"Config masih dipakai oleh zone aktif. Nonaktifkan dulu, lalu hapus setelah semua zone dilepas: "+err.Error())
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// --- POST /admin/dns-providers/:id/default ----------------------------------

func (h *Handler) SetDefault(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.SetDefault(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "dns provider config not found")
		}
		return httpx.Internal(c, "set default failed: "+err.Error())
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// --- POST /admin/dns-providers/reorder --------------------------------------

type reorderReq struct {
	Items []reorderItem `json:"items"`
}

type reorderItem struct {
	ID       string `json:"id"`
	Priority int    `json:"priority"`
}

func (h *Handler) Reorder(c *fiber.Ctx) error {
	var req reorderReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	m := make(map[uuid.UUID]int, len(req.Items))
	for _, it := range req.Items {
		id, err := uuid.Parse(it.ID)
		if err != nil {
			return httpx.BadRequest(c, "invalid id in items: "+it.ID)
		}
		m[id] = it.Priority
	}
	if err := h.repo.ReorderPriority(c.Context(), m); err != nil {
		return httpx.Internal(c, "reorder failed: "+err.Error())
	}
	return httpx.OK(c, fiber.Map{"ok": true, "updated": len(m)})
}

// --- POST /admin/dns-providers/:id/test -------------------------------------

type testResp struct {
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
	Latency string `json:"latency,omitempty"`
}

// Test probes connectivity using provider-specific lightweight auth check.
// Updates last_health_at + last_health_ok so the admin UI reflects the
// result without a separate refresh.
func (h *Handler) Test(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	cfg, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "dns provider config not found")
		}
		return httpx.Internal(c, "lookup failed: "+err.Error())
	}

	start := time.Now()
	testErr := runPing(c.Context(), *cfg)
	latency := time.Since(start)

	ok := testErr == nil
	if err := h.repo.RecordHealth(c.Context(), id, ok); err != nil {
		slog.Warn("dns_providers test: record health failed (non-fatal)",
			"id", id, "error", err)
	}
	resp := testResp{OK: ok, Latency: latency.Truncate(time.Millisecond).String()}
	if !ok {
		resp.Message = testErr.Error()
		return httpx.OK(c, resp) // 200 with ok=false — admin UI reads flag
	}
	resp.Message = "Koneksi berhasil."
	return httpx.OK(c, resp)
}

// runPing dispatches to the right adapter's lightweight auth probe. Both
// paths are low-cost: CF hits /user/tokens/verify, DNSCloud hits /auth/me.
// Neither mutates the account.
func runPing(ctx context.Context, cfg Config) error {
	switch cfg.Kind {
	case KindCloudflare:
		cf := cloudflare.NewClient(cloudflare.Config{
			APIToken:  cfg.APIToken,
			AccountID: cfg.AccountID,
		})
		return cf.VerifyToken(ctx)
	case KindDNSCloud:
		dc := dnscloud.NewClient(dnscloud.Config{APIToken: cfg.APIToken})
		return dc.Ping(ctx)
	}
	return errors.New("unknown kind: " + cfg.Kind)
}
