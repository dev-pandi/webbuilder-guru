package litera

import (
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// Handler — admin endpoints untuk CRUD litera_config + list intents + retry.
type Handler struct {
	cfg    *ConfigRepo
	client *Client
	audit  *audit.Repo // nil-safe
}

func NewHandler(cfg *ConfigRepo, client *Client) *Handler {
	return &Handler{cfg: cfg, client: client}
}

func (h *Handler) SetAudit(a *audit.Repo) { h.audit = a }

// GetConfig — GET /api/v1/admin/litera/config.
// API key di-mask di response (admin bisa toggle show di UI dengan POST reveal).
func (h *Handler) GetConfig(c *fiber.Ctx) error {
	cfg, err := h.cfg.Get(c.Context())
	if err != nil {
		return httpx.Internal(c, "load config failed")
	}
	// Mask API key — admin UI tampilkan prefix/suffix saja.
	return httpx.OK(c, fiber.Map{
		"api_key_masked":                   MaskAPIKey(cfg.APIKey),
		"api_key_set":                      cfg.APIKey != "",
		"base_url":                         cfg.BaseURL,
		"collection_name":                  cfg.CollectionName,
		"default_price":                    cfg.DefaultPrice,
		"default_fee_enabled":              cfg.DefaultFeeEnabled,
		"default_max_minted":               cfg.DefaultMaxMinted,
		"default_user_reward":              cfg.DefaultUserReward,
		"default_creator_mint_reward":      cfg.DefaultCreatorMintReward,
		"default_creator_approve_reward":   cfg.DefaultCreatorApproveReward,
		"enabled":                          cfg.Enabled,
		"updated_at":                       cfg.UpdatedAt,
	})
}

// updateConfigReq — PATCH payload. Semua pointer field: nil = tidak diubah.
// Kalau mau clear API key, kirim empty string "" (bukan null).
type updateConfigReq struct {
	APIKey                      *string `json:"api_key"`
	BaseURL                     *string `json:"base_url"`
	CollectionName              *string `json:"collection_name"`
	DefaultPrice                *int64  `json:"default_price"`
	DefaultFeeEnabled           *bool   `json:"default_fee_enabled"`
	DefaultMaxMinted            *int    `json:"default_max_minted"`
	DefaultUserReward           *int64  `json:"default_user_reward"`
	DefaultCreatorMintReward    *int64  `json:"default_creator_mint_reward"`
	DefaultCreatorApproveReward *int64  `json:"default_creator_approve_reward"`
	Enabled                     *bool   `json:"enabled"`
}

// UpdateConfig — PATCH /api/v1/admin/litera/config.
func (h *Handler) UpdateConfig(c *fiber.Ctx) error {
	var req updateConfigReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	// Basic validation — max_minted & reward tidak boleh negatif (price boleh 0).
	if req.DefaultMaxMinted != nil && *req.DefaultMaxMinted < 0 {
		return httpx.BadRequest(c, "default_max_minted tidak boleh negatif")
	}
	if req.DefaultPrice != nil && *req.DefaultPrice < 0 {
		return httpx.BadRequest(c, "default_price tidak boleh negatif")
	}
	if req.DefaultUserReward != nil && *req.DefaultUserReward < 0 {
		return httpx.BadRequest(c, "default_user_reward tidak boleh negatif")
	}

	// Track field yang berubah untuk audit log (tanpa expose api_key value).
	changed := map[string]any{}
	if req.APIKey != nil {
		changed["api_key"] = "updated"
	}
	if req.BaseURL != nil {
		changed["base_url"] = *req.BaseURL
	}
	if req.CollectionName != nil {
		changed["collection_name"] = *req.CollectionName
	}
	if req.DefaultPrice != nil {
		changed["default_price"] = *req.DefaultPrice
	}
	if req.DefaultFeeEnabled != nil {
		changed["default_fee_enabled"] = *req.DefaultFeeEnabled
	}
	if req.DefaultMaxMinted != nil {
		changed["default_max_minted"] = *req.DefaultMaxMinted
	}
	if req.DefaultUserReward != nil {
		changed["default_user_reward"] = *req.DefaultUserReward
	}
	if req.DefaultCreatorMintReward != nil {
		changed["default_creator_mint_reward"] = *req.DefaultCreatorMintReward
	}
	if req.DefaultCreatorApproveReward != nil {
		changed["default_creator_approve_reward"] = *req.DefaultCreatorApproveReward
	}
	if req.Enabled != nil {
		changed["enabled"] = *req.Enabled
	}

	cfg, err := h.cfg.Update(c.Context(), UpdateInput{
		APIKey:                      req.APIKey,
		BaseURL:                     req.BaseURL,
		CollectionName:              req.CollectionName,
		DefaultPrice:                req.DefaultPrice,
		DefaultFeeEnabled:           req.DefaultFeeEnabled,
		DefaultMaxMinted:            req.DefaultMaxMinted,
		DefaultUserReward:           req.DefaultUserReward,
		DefaultCreatorMintReward:    req.DefaultCreatorMintReward,
		DefaultCreatorApproveReward: req.DefaultCreatorApproveReward,
		Enabled:                     req.Enabled,
	})
	if err != nil {
		return httpx.Internal(c, "update config failed")
	}

	// Audit — ambil actor dari context.
	if h.audit != nil {
		var actorID *uuid.UUID
		if aid := auth.UserIDFrom(c); aid != uuid.Nil {
			actorID = &aid
		}
		_ = h.audit.Log(c.Context(), audit.Params{
			ActorID:    actorID,
			Event:      "litera_config.updated",
			TargetType: "litera_config",
			TargetID:   "1",
			Metadata:   changed,
		})
	}

	return httpx.OK(c, fiber.Map{
		"api_key_masked":                 MaskAPIKey(cfg.APIKey),
		"api_key_set":                    cfg.APIKey != "",
		"base_url":                       cfg.BaseURL,
		"collection_name":                cfg.CollectionName,
		"default_price":                  cfg.DefaultPrice,
		"default_fee_enabled":            cfg.DefaultFeeEnabled,
		"default_max_minted":             cfg.DefaultMaxMinted,
		"default_user_reward":            cfg.DefaultUserReward,
		"default_creator_mint_reward":    cfg.DefaultCreatorMintReward,
		"default_creator_approve_reward": cfg.DefaultCreatorApproveReward,
		"enabled":                        cfg.Enabled,
		"updated_at":                     cfg.UpdatedAt,
	})
}
