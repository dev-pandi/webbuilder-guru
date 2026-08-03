// handler.go — endpoint promo:
//   Admin:
//     GET    /api/v1/admin/promos           — list all
//     POST   /api/v1/admin/promos           — create
//     GET    /api/v1/admin/promos/:id       — detail
//     PATCH  /api/v1/admin/promos/:id       — update
//     DELETE /api/v1/admin/promos/:id       — delete
//   User:
//     POST   /api/v1/promos/validate        — validate code (dipakai wizard preview)

package promos

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

type Handler struct {
	repo *Repo
	svc  *Service
}

func NewHandler(r *Repo, s *Service) *Handler { return &Handler{repo: r, svc: s} }

// --- Admin endpoints ---

func (h *Handler) AdminList(c *fiber.Ctx) error {
	items, err := h.repo.ListAdmin(c.Context())
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, items)
}

func (h *Handler) AdminGet(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	p, err := h.repo.GetByID(c.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "promo tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, p)
}

type promoWriteReq struct {
	Code            string     `json:"code"`
	Description     string     `json:"description"`
	DiscountType    string     `json:"discount_type"`
	DiscountValue   int64      `json:"discount_value"`
	AppliesTo       string     `json:"applies_to"`
	AllowedTLDs     []string   `json:"allowed_tlds"`
	MinSubtotal     int64      `json:"min_subtotal"`
	MaxDiscount     int64      `json:"max_discount"`
	ValidFrom       *time.Time `json:"valid_from,omitempty"`
	ValidUntil      *time.Time `json:"valid_until,omitempty"`
	MaxUses         *int       `json:"max_uses,omitempty"`
	MaxUsesPerUser  int        `json:"max_uses_per_user"`
	Active          bool       `json:"active"`
}

func (r promoWriteReq) validate() (string, bool) {
	code := strings.ToUpper(strings.TrimSpace(r.Code))
	if code == "" {
		return "code wajib", false
	}
	if r.DiscountType != DiscountPercent && r.DiscountType != DiscountFixed {
		return "discount_type harus 'percent' atau 'fixed'", false
	}
	if r.DiscountValue <= 0 {
		return "discount_value wajib > 0", false
	}
	if r.DiscountType == DiscountPercent && r.DiscountValue > 100 {
		return "discount_value untuk 'percent' harus 1-100", false
	}
	if r.AppliesTo != AppliesToRegister && r.AppliesTo != AppliesToRenew && r.AppliesTo != AppliesToBoth {
		return "applies_to harus 'register' | 'renew' | 'both'", false
	}
	if r.MaxUsesPerUser < 0 {
		return "max_uses_per_user tidak boleh negatif", false
	}
	if r.MaxUses != nil && *r.MaxUses < 1 {
		return "max_uses harus >= 1 kalau di-set", false
	}
	if r.ValidFrom != nil && r.ValidUntil != nil && r.ValidUntil.Before(*r.ValidFrom) {
		return "valid_until harus setelah valid_from", false
	}
	return "", true
}

func (h *Handler) AdminCreate(c *fiber.Ctx) error {
	var req promoWriteReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if msg, ok := req.validate(); !ok {
		return httpx.BadRequest(c, msg)
	}
	// Default max_uses_per_user = 1 kalau tidak di-set explicit oleh admin.
	if req.MaxUsesPerUser == 0 {
		req.MaxUsesPerUser = 1
	}
	cl := auth.ClaimsFrom(c)
	var createdBy *uuid.UUID
	if cl != nil && cl.UserID != uuid.Nil {
		id := cl.UserID
		createdBy = &id
	}
	// Ensure allowed_tlds tidak nil (Postgres TEXT[] NOT NULL DEFAULT '{}')
	if req.AllowedTLDs == nil {
		req.AllowedTLDs = []string{}
	}
	p, err := h.repo.Create(c.Context(), CreateInput{
		Code:            strings.ToUpper(strings.TrimSpace(req.Code)),
		Description:     strings.TrimSpace(req.Description),
		DiscountType:    req.DiscountType,
		DiscountValue:   req.DiscountValue,
		AppliesTo:       req.AppliesTo,
		AllowedTLDs:     req.AllowedTLDs,
		MinSubtotal:     req.MinSubtotal,
		MaxDiscount:     req.MaxDiscount,
		ValidFrom:       req.ValidFrom,
		ValidUntil:      req.ValidUntil,
		MaxUses:         req.MaxUses,
		MaxUsesPerUser:  req.MaxUsesPerUser,
		CreatedBy:       createdBy,
	})
	if err != nil {
		if errors.Is(err, ErrCodeTaken) {
			return httpx.Err(c, fiber.StatusConflict, "code_taken", "Kode promo sudah dipakai")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.Created(c, p)
}

func (h *Handler) AdminUpdate(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	var req promoWriteReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if msg, ok := req.validate(); !ok {
		return httpx.BadRequest(c, msg)
	}
	if req.MaxUsesPerUser == 0 {
		req.MaxUsesPerUser = 1
	}
	if req.AllowedTLDs == nil {
		req.AllowedTLDs = []string{}
	}
	p, err := h.repo.Update(c.Context(), id, UpdateInput{
		Description:     strings.TrimSpace(req.Description),
		DiscountType:    req.DiscountType,
		DiscountValue:   req.DiscountValue,
		AppliesTo:       req.AppliesTo,
		AllowedTLDs:     req.AllowedTLDs,
		MinSubtotal:     req.MinSubtotal,
		MaxDiscount:     req.MaxDiscount,
		ValidFrom:       req.ValidFrom,
		ValidUntil:      req.ValidUntil,
		MaxUses:         req.MaxUses,
		MaxUsesPerUser:  req.MaxUsesPerUser,
		Active:          req.Active,
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "promo tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, p)
}

// AdminListRedemptions — GET /api/v1/admin/promos/:id/redemptions
// History pemakaian promo (user + invoice + discount + timestamp).
func (h *Handler) AdminListRedemptions(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	items, err := h.repo.ListRedemptionsByPromo(c.Context(), id, 200)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, items)
}

func (h *Handler) AdminDelete(c *fiber.Ctx) error {
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "id tidak valid")
	}
	if err := h.repo.Delete(c.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "promo tidak ditemukan")
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"id": id.String(), "deleted": true})
}

// --- User endpoints ---

// validateReq — payload dari wizard untuk cek promo sebelum checkout.
type validateReq struct {
	Code     string `json:"code"`
	TLD      string `json:"tld"`
	Kind     string `json:"kind"`     // "register" | "renew"
	Subtotal int64  `json:"subtotal"` // years × unit_price
}

// Validate — POST /api/v1/promos/validate. Dipakai wizard untuk preview
// discount sebelum submit purchase. Idempotent (tidak insert redemption).
func (h *Handler) Validate(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	var req validateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Kind == "" {
		req.Kind = AppliesToRegister
	}
	res, err := h.svc.Validate(c.Context(), ValidateInput{
		Code:     req.Code,
		UserID:   uid,
		TLD:      req.TLD,
		Kind:     req.Kind,
		Subtotal: req.Subtotal,
	})
	if err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "promo_invalid", err.Error())
	}
	return httpx.OK(c, fiber.Map{
		"code":        res.Promo.Code,
		"description": res.Promo.Description,
		"discount":    res.Discount,
	})
}
