package settings

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Keys — canonical setting keys, satu-satunya source of truth untuk key names.
// Konsumen import konstanta ini alih hardcode string supaya typo caught by
// compiler.
const (
	KeyPPNEnabled       = "tax.ppn_enabled"
	KeyPPNRate          = "tax.ppn_rate"
	KeyPPNLabel         = "tax.ppn_label"
	KeyBrandName        = "brand.name"
	KeyBrandSupportEmail = "brand.support_email"
	KeyBrandSupportPhone = "brand.support_phone"
	KeyBrandCompanyName = "brand.company_name"
	KeyBrandAddress     = "brand.company_address"
	KeyBrandTaxID       = "brand.tax_id"
)

// Defaults — fallback kalau key tidak ada di DB (mis. migration belum jalan,
// atau admin sengaja delete). Konsisten dengan seed di migration 0036.
var defaults = map[string]string{
	KeyPPNEnabled:        "true",
	KeyPPNRate:           "0.11",
	KeyPPNLabel:          "PPN 11%",
	KeyBrandName:         "Web Builder",
	KeyBrandSupportEmail: "support@example.com",
	KeyBrandSupportPhone: "",
	KeyBrandCompanyName:  "",
	KeyBrandAddress:      "",
	KeyBrandTaxID:        "",
}

// Service — typed accessors + in-memory cache. Settings jarang berubah,
// tapi diakses per-invoice-render / per-email-send, jadi 60s TTL cache
// membuang round-trip DB tanpa risk stale-data material.
//
// Cache invalidated on Set (via Invalidate). Thread-safe.
type Service struct {
	repo *Repo
	ttl  time.Duration

	mu    sync.RWMutex
	cache map[string]cacheEntry
}

type cacheEntry struct {
	value   string
	expires time.Time
}

// NewService builds a Service with 60s cache TTL (default sensible).
func NewService(r *Repo) *Service {
	return &Service{
		repo:  r,
		ttl:   60 * time.Second,
		cache: map[string]cacheEntry{},
	}
}

// WithTTL overrides cache TTL — dipakai test supaya bisa cache-bust cepat.
func (s *Service) WithTTL(d time.Duration) *Service {
	s.ttl = d
	return s
}

// getRaw — cached lookup dengan fallback ke defaults. Return "" hanya kalau
// key tidak ada di DB DAN tidak ada di defaults (unknown key).
func (s *Service) getRaw(ctx context.Context, key string) string {
	// Fast path — cache hit.
	s.mu.RLock()
	entry, ok := s.cache[key]
	s.mu.RUnlock()
	if ok && time.Now().Before(entry.expires) {
		return entry.value
	}

	// Slow path — DB fetch. Kalau NotFound, pakai default.
	value := ""
	if setting, err := s.repo.Get(ctx, key); err == nil {
		value = setting.Value
	} else if def, hasDefault := defaults[key]; hasDefault {
		value = def
	}
	// Write-through cache (best-effort — race OK karena idempotent).
	s.mu.Lock()
	s.cache[key] = cacheEntry{value: value, expires: time.Now().Add(s.ttl)}
	s.mu.Unlock()
	return value
}

// Invalidate — clear cache untuk key. Dipanggil handler setelah Set supaya
// consumer next-read dapat value baru (tidak nunggu TTL expire).
func (s *Service) Invalidate(key string) {
	s.mu.Lock()
	delete(s.cache, key)
	s.mu.Unlock()
}

// InvalidateAll — full flush. Dipakai kalau bulk update / admin restore.
func (s *Service) InvalidateAll() {
	s.mu.Lock()
	s.cache = map[string]cacheEntry{}
	s.mu.Unlock()
}

// --- Typed accessors ---

// PPNEnabled — apakah PPN di-apply ke invoice. Default true.
func (s *Service) PPNEnabled(ctx context.Context) bool {
	return parseBool(s.getRaw(ctx, KeyPPNEnabled), true)
}

// PPNRate — desimal (0.11 = 11%). Default 0.11.
func (s *Service) PPNRate(ctx context.Context) float64 {
	return parseFloat(s.getRaw(ctx, KeyPPNRate), 0.11)
}

// PPNLabel — text yang muncul di invoice ("PPN 11%").
func (s *Service) PPNLabel(ctx context.Context) string {
	v := s.getRaw(ctx, KeyPPNLabel)
	if v == "" {
		return "PPN 11%"
	}
	return v
}

// BrandName — nama brand untuk header/footer/invoice.
func (s *Service) BrandName(ctx context.Context) string {
	v := s.getRaw(ctx, KeyBrandName)
	if v == "" {
		return "Web Builder"
	}
	return v
}

// BrandSupportEmail — email support di footer/invoice.
func (s *Service) BrandSupportEmail(ctx context.Context) string {
	return s.getRaw(ctx, KeyBrandSupportEmail)
}

// BrandSupportPhone — opsional (empty kalau tidak di-set).
func (s *Service) BrandSupportPhone(ctx context.Context) string {
	return s.getRaw(ctx, KeyBrandSupportPhone)
}

// BrandCompanyName — nama badan hukum untuk invoice. Fallback ke BrandName
// kalau kosong (banyak platform kecil = perusahaan sama dengan brand).
func (s *Service) BrandCompanyName(ctx context.Context) string {
	v := s.getRaw(ctx, KeyBrandCompanyName)
	if v == "" {
		return s.BrandName(ctx)
	}
	return v
}

// BrandAddress — alamat kantor untuk invoice header (opsional).
func (s *Service) BrandAddress(ctx context.Context) string {
	return s.getRaw(ctx, KeyBrandAddress)
}

// BrandTaxID — NPWP perusahaan untuk invoice (opsional).
func (s *Service) BrandTaxID(ctx context.Context) string {
	return s.getRaw(ctx, KeyBrandTaxID)
}

// --- parse helpers ---

func parseBool(s string, def bool) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	switch s {
	case "true", "1", "yes", "on":
		return true
	case "false", "0", "no", "off":
		return false
	}
	return def
}

func parseFloat(s string, def float64) float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return def
	}
	return v
}
