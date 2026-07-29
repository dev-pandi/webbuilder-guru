package pricing

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// Handler — endpoint pricing untuk admin (CRUD platform + wildcard) dan
// reseller/agent (CRUD reseller list + resolve). Semua enforce role di router
// layer; handler asumsi middleware sudah lolos.
type Handler struct {
	repo     *Repo
	authRepo *auth.Repo
}

func NewHandler(r *Repo, authRepo *auth.Repo) *Handler {
	return &Handler{repo: r, authRepo: authRepo}
}

// resolveResellerID — untuk reseller/agent, ambil "effective reseller id"
// (self kalau reseller, parent kalau agent). Return uuid.Nil + error kalau
// caller role tidak diizinkan.
func (h *Handler) resolveResellerID(c *fiber.Ctx) (uuid.UUID, error) {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return uuid.Nil, errors.New("unauthenticated")
	}
	u, err := h.authRepo.GetByID(c.Context(), uid)
	if err != nil {
		return uuid.Nil, err
	}
	switch u.Role {
	case auth.RoleReseller:
		if u.ResellerStatus != auth.ResellerStatusActive {
			return uuid.Nil, errors.New("reseller belum aktif")
		}
		return u.ID, nil
	case auth.RoleAgent:
		if u.ParentResellerID == nil {
			return uuid.Nil, errors.New("agent tanpa reseller induk")
		}
		return *u.ParentResellerID, nil
	default:
		return uuid.Nil, errors.New("role tidak diizinkan")
	}
}

// -------- Admin: platform_prices CRUD --------

// AdminListPlatform — GET /api/v1/admin/pricing/platform
func (h *Handler) AdminListPlatform(c *fiber.Ctx) error {
	items, err := h.repo.ListPlatform(c.Context())
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, items)
}

type upsertPlatformReq struct {
	TLD                    string `json:"tld"`
	RetailRegisterPrice    int64  `json:"retail_register_price"`
	RetailRenewPrice       int64  `json:"retail_renew_price"`
	WholesaleRegisterPrice *int64 `json:"wholesale_register_price,omitempty"`
	WholesaleRenewPrice    *int64 `json:"wholesale_renew_price,omitempty"`
	Currency               string `json:"currency,omitempty"`
}

// AdminUpsertPlatform — POST /api/v1/admin/pricing/platform
func (h *Handler) AdminUpsertPlatform(c *fiber.Ctx) error {
	var req upsertPlatformReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.TLD = strings.ToLower(strings.TrimSpace(req.TLD))
	if req.TLD == "" {
		return httpx.BadRequest(c, "tld wajib")
	}
	if req.RetailRegisterPrice < 0 || req.RetailRenewPrice < 0 {
		return httpx.BadRequest(c, "harga retail harus >= 0")
	}
	if req.WholesaleRegisterPrice != nil && *req.WholesaleRegisterPrice < 0 {
		return httpx.BadRequest(c, "harga wholesale register harus >= 0")
	}
	if req.WholesaleRenewPrice != nil && *req.WholesaleRenewPrice < 0 {
		return httpx.BadRequest(c, "harga wholesale renew harus >= 0")
	}
	p, err := h.repo.UpsertPlatform(c.Context(), UpsertPlatformInput{
		TLD:                    req.TLD,
		RetailRegisterPrice:    req.RetailRegisterPrice,
		RetailRenewPrice:       req.RetailRenewPrice,
		WholesaleRegisterPrice: req.WholesaleRegisterPrice,
		WholesaleRenewPrice:    req.WholesaleRenewPrice,
		Currency:               req.Currency,
		UpdatedBy:              auth.UserIDFrom(c),
	})
	if err != nil {
		return httpx.Internal(c, "upsert failed")
	}
	return httpx.OK(c, p)
}

// AdminDeletePlatform — DELETE /api/v1/admin/pricing/platform/:id
func (h *Handler) AdminDeletePlatform(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.DeletePlatform(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "pricing tidak ditemukan")
		}
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// -------- Reseller: price list CRUD (reseller only) --------

// ResellerList — GET /api/v1/reseller/pricing
func (h *Handler) ResellerList(c *fiber.Ctx) error {
	resellerID, err := h.resolveResellerID(c)
	if err != nil {
		return httpx.Forbidden(c, err.Error())
	}
	items, err := h.repo.ListByReseller(c.Context(), resellerID)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, items)
}

type upsertResellerReq struct {
	TLD                 string `json:"tld"`
	AgentRegisterPrice  int64  `json:"agent_register_price"`
	AgentRenewPrice     int64  `json:"agent_renew_price"`
	ClientRegisterPrice int64  `json:"client_register_price"`
	ClientRenewPrice    int64  `json:"client_renew_price"`
	Currency            string `json:"currency,omitempty"`
}

// ResellerUpsert — POST /api/v1/reseller/pricing (reseller only).
func (h *Handler) ResellerUpsert(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "no claims")
	}
	// Restrict ke reseller aktif (bukan agent). Agent view-only.
	u, err := h.authRepo.GetByID(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}
	if u.Role != auth.RoleReseller || u.ResellerStatus != auth.ResellerStatusActive {
		return httpx.Forbidden(c, "hanya reseller aktif yang boleh edit price list")
	}
	var req upsertResellerReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.TLD = strings.ToLower(strings.TrimSpace(req.TLD))
	if req.TLD == "" {
		return httpx.BadRequest(c, "tld wajib")
	}
	if req.AgentRegisterPrice < 0 || req.AgentRenewPrice < 0 ||
		req.ClientRegisterPrice < 0 || req.ClientRenewPrice < 0 {
		return httpx.BadRequest(c, "harga harus >= 0")
	}

	// Business rule (transparency): agent_price + client_price harus >= wholesale
	// supaya reseller tidak (accidental) jual rugi. Wholesale sudah di
	// platform_prices — kalau tidak ada, skip check.
	if pf, err := h.repo.GetPlatformByTLD(c.Context(), req.TLD); err == nil && pf != nil {
		if pf.WholesaleRegisterPrice != nil && (req.AgentRegisterPrice < *pf.WholesaleRegisterPrice || req.ClientRegisterPrice < *pf.WholesaleRegisterPrice) {
			return httpx.Err(c, fiber.StatusBadRequest, "below_wholesale",
				"Harga register lebih rendah dari wholesale — Anda akan rugi. Naikkan harga.")
		}
		if pf.WholesaleRenewPrice != nil && (req.AgentRenewPrice < *pf.WholesaleRenewPrice || req.ClientRenewPrice < *pf.WholesaleRenewPrice) {
			return httpx.Err(c, fiber.StatusBadRequest, "below_wholesale",
				"Harga renew lebih rendah dari wholesale — Anda akan rugi. Naikkan harga.")
		}
	}

	p, err := h.repo.UpsertResellerPrice(c.Context(), UpsertResellerPriceInput{
		ResellerID:          u.ID,
		TLD:                 req.TLD,
		AgentRegisterPrice:  req.AgentRegisterPrice,
		AgentRenewPrice:     req.AgentRenewPrice,
		ClientRegisterPrice: req.ClientRegisterPrice,
		ClientRenewPrice:    req.ClientRenewPrice,
		Currency:            req.Currency,
	})
	if err != nil {
		return httpx.Internal(c, "upsert failed")
	}
	return httpx.OK(c, p)
}

// ResellerDelete — DELETE /api/v1/reseller/pricing/:id
func (h *Handler) ResellerDelete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "no claims")
	}
	u, err := h.authRepo.GetByID(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}
	if u.Role != auth.RoleReseller {
		return httpx.Forbidden(c, "hanya reseller yang boleh hapus price list")
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.DeleteResellerPrice(c.Context(), id, u.ID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "price list tidak ditemukan")
		}
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// -------- Public resolve (untuk wizard + agent view) --------

// Resolve — GET /api/v1/pricing/resolve/:tld
// Return resolved price berdasarkan role caller:
//   - Client: RetailRegister/Renew, others nil
//   - Reseller: Retail + Wholesale + AgentPrice + ClientPrice (self price list)
//   - Agent: Retail + Wholesale + AgentPrice (parent's price list)
//
// Handler filter response by role — client TIDAK boleh lihat wholesale.
func (h *Handler) Resolve(c *fiber.Ctx) error {
	tld := strings.ToLower(strings.TrimSpace(c.Params("tld")))
	if tld == "" {
		return httpx.BadRequest(c, "tld wajib")
	}
	uid := auth.UserIDFrom(c)
	var role string
	var resellerID *uuid.UUID
	if uid != uuid.Nil {
		if u, err := h.authRepo.GetByID(c.Context(), uid); err == nil && u != nil {
			role = u.Role
			switch u.Role {
			case auth.RoleReseller:
				id := u.ID
				resellerID = &id
			case auth.RoleAgent:
				if u.ParentResellerID != nil {
					resellerID = u.ParentResellerID
				}
			}
		}
	}
	resolved, err := h.repo.Resolve(c.Context(), tld, resellerID)
	if err != nil {
		return httpx.Internal(c, "resolve failed")
	}
	// Redaction per role — Wholesale + AgentPrice hanya untuk reseller/agent.
	// Client-facing: hanya retail_*.
	if role != auth.RoleReseller && role != auth.RoleAgent && role != auth.RoleAdmin {
		resolved.WholesaleRegisterPrice = nil
		resolved.WholesaleRenewPrice = nil
		resolved.AgentRegisterPrice = nil
		resolved.AgentRenewPrice = nil
		resolved.ClientRegisterPrice = nil
		resolved.ClientRenewPrice = nil
	}
	return httpx.OK(c, resolved)
}
