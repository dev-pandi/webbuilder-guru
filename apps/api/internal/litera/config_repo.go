package litera

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ConfigRepo — read/write singleton row litera_config.
type ConfigRepo struct {
	pool *pgxpool.Pool

	// In-memory cache dengan TTL supaya tiap publish artikel tidak hit DB
	// untuk fetch config. Invalidate otomatis saat Update() dipanggil.
	cacheMu   sync.RWMutex
	cached    *Config
	cachedAt  time.Time
	cacheTTL  time.Duration
}

const (
	// cols — kolom lengkap sesuai migration 0066. Pastikan urutannya match
	// dengan Scan().
	configCols = `api_key, base_url, collection_name,
	    default_price, default_fee_enabled, default_max_minted,
	    default_user_reward, default_creator_mint_reward, default_creator_approve_reward,
	    enabled, updated_at`

	defaultCacheTTL = 60 * time.Second
)

// NewConfigRepo — wire pool + cache. TTL cache 60s (hemat round-trip DB tanpa
// bikin ganti config terlambat terasa oleh user).
func NewConfigRepo(pool *pgxpool.Pool) *ConfigRepo {
	return &ConfigRepo{pool: pool, cacheTTL: defaultCacheTTL}
}

// Get — baca config dari cache kalau belum expired, atau dari DB.
func (r *ConfigRepo) Get(ctx context.Context) (Config, error) {
	r.cacheMu.RLock()
	if r.cached != nil && time.Since(r.cachedAt) < r.cacheTTL {
		cfg := *r.cached
		r.cacheMu.RUnlock()
		return cfg, nil
	}
	r.cacheMu.RUnlock()

	// Cache miss / expired — fetch dari DB.
	cfg, err := r.fetchFromDB(ctx)
	if err != nil {
		return Config{}, err
	}
	r.cacheMu.Lock()
	r.cached = &cfg
	r.cachedAt = time.Now()
	r.cacheMu.Unlock()
	return cfg, nil
}

// fetchFromDB — raw query singleton row.
func (r *ConfigRepo) fetchFromDB(ctx context.Context) (Config, error) {
	var cfg Config
	err := r.pool.QueryRow(ctx,
		`SELECT `+configCols+` FROM litera_config WHERE id = 1`,
	).Scan(
		&cfg.APIKey, &cfg.BaseURL, &cfg.CollectionName,
		&cfg.DefaultPrice, &cfg.DefaultFeeEnabled, &cfg.DefaultMaxMinted,
		&cfg.DefaultUserReward, &cfg.DefaultCreatorMintReward, &cfg.DefaultCreatorApproveReward,
		&cfg.Enabled, &cfg.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		// Migration seharusnya sudah seed row id=1. Tapi defensive: kalau
		// hilang (manual delete / corruption), return config kosong default
		// — supaya feature "disabled" tapi backend tidak crash.
		return Config{BaseURL: "https://literaa.xyz/api/v1", CollectionName: "BikinWeb Educational Collection"}, nil
	}
	return cfg, err
}

// UpdateInput — PATCH input. Semua pointer: nil = tidak diubah.
type UpdateInput struct {
	APIKey                      *string
	BaseURL                     *string
	CollectionName              *string
	DefaultPrice                *int64
	DefaultFeeEnabled           *bool
	DefaultMaxMinted            *int
	DefaultUserReward           *int64
	DefaultCreatorMintReward    *int64
	DefaultCreatorApproveReward *int64
	Enabled                     *bool
}

// Update — partial update + invalidate cache. Return config terbaru supaya
// handler bisa langsung respond ke admin tanpa extra Get.
func (r *ConfigRepo) Update(ctx context.Context, in UpdateInput) (Config, error) {
	_, err := r.pool.Exec(ctx, `
		UPDATE litera_config SET
		    api_key                         = COALESCE($1,  api_key),
		    base_url                        = COALESCE($2,  base_url),
		    collection_name                 = COALESCE($3,  collection_name),
		    default_price                   = COALESCE($4,  default_price),
		    default_fee_enabled             = COALESCE($5,  default_fee_enabled),
		    default_max_minted              = COALESCE($6,  default_max_minted),
		    default_user_reward             = COALESCE($7,  default_user_reward),
		    default_creator_mint_reward     = COALESCE($8,  default_creator_mint_reward),
		    default_creator_approve_reward  = COALESCE($9,  default_creator_approve_reward),
		    enabled                         = COALESCE($10, enabled),
		    updated_at                      = now()
		WHERE id = 1
	`, in.APIKey, in.BaseURL, in.CollectionName,
		in.DefaultPrice, in.DefaultFeeEnabled, in.DefaultMaxMinted,
		in.DefaultUserReward, in.DefaultCreatorMintReward, in.DefaultCreatorApproveReward,
		in.Enabled,
	)
	if err != nil {
		return Config{}, err
	}
	// Invalidate cache + re-fetch supaya return value match DB.
	r.cacheMu.Lock()
	r.cached = nil
	r.cacheMu.Unlock()
	return r.Get(ctx)
}

// MaskAPIKey — tampilkan API key di admin UI dengan bagian tengah di-sensor.
// Format: "lit_sk_pandi_***...***8b42" (prefix 15 char + suffix 4 char).
// Admin masih bisa verify identitas key tanpa expose full value di GET.
func MaskAPIKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 20 {
		return "***"
	}
	return key[:15] + "***...***" + key[len(key)-4:]
}
