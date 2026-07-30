// api-registry — internal service untuk domain lifecycle + EPP execution.
// Konsumen tunggal: web builder API (via internal HTTP + HMAC).
//
// Fase 1: PandiWrapperProvider (proxy ke registrar-api PANDI).
// Fase 2: EPPDirectProvider (native EPP client — TBD di internal/epp/).
package main

import (
	"log/slog"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/joho/godotenv"

	"github.com/webbuilder/api-registry/internal/config"
	"github.com/webbuilder/api-registry/internal/contacts"
	"github.com/webbuilder/api-registry/internal/domains"
	"github.com/webbuilder/api-registry/internal/hosts"
	"github.com/webbuilder/api-registry/internal/httpx"
	"github.com/webbuilder/api-registry/internal/jobs"
	"github.com/webbuilder/api-registry/internal/provider"
	"github.com/webbuilder/api-registry/internal/security"
	"github.com/webbuilder/api-registry/internal/whois"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: parseLevel(cfg.LogLevel),
	})))

	// Build provider berdasarkan mode.
	var p provider.Provider
	switch cfg.ProviderMode {
	case "pandi_wrapper":
		wp, err := provider.NewPandiWrapper(provider.PandiWrapperConfig{
			BaseURL:     cfg.PandiAPIURL,
			StaticToken: cfg.PandiAPIKey,
			Email:       cfg.PandiEmail,
			Password:    cfg.PandiPassword,
			Timeout:     cfg.PandiAPITimeout,
		})
		if err != nil {
			slog.Error("provider init failed", "err", err)
			os.Exit(1)
		}
		p = wp
		slog.Info("provider: pandi_wrapper enabled", "base_url", cfg.PandiAPIURL)
	case "epp_direct":
		slog.Error("provider: epp_direct belum tersedia (Fase 2 pending). Set PROVIDER_MODE=pandi_wrapper.")
		os.Exit(1)
	default:
		slog.Error("provider: mode tidak dikenal", "mode", cfg.ProviderMode)
		os.Exit(1)
	}

	// Fiber app.
	app := fiber.New(fiber.Config{
		AppName:               "api-registry",
		DisableStartupMessage: true,
		ErrorHandler:          errorHandler,
	})
	app.Use(recover.New())

	// Health (public, no auth).
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return httpx.OK(c, fiber.Map{
			"ok":       true,
			"provider": p.Name(),
			"caps":     p.Capabilities(),
		})
	})

	// All /v1/* di-guard HMAC. Kalau secret kosong (dev), middleware skip.
	if cfg.InternalHMACSecret == "" {
		slog.Warn("INTERNAL_HMAC_SECRET kosong — dev mode, semua request accepted tanpa auth!")
	}
	v1 := app.Group("/v1", security.HMACMiddleware(cfg.InternalHMACSecret))

	// Jobs — audit + idempotency. Fase 1 pakai in-memory (cap 10k), evict
	// LRU-style kalau overflow. Fase 2 swap ke Postgres/Redis untuk persistence
	// + async worker (EPP direct).
	jobStore := jobs.NewMemoryStore(10000)
	tracker := jobs.NewTracker(jobStore)
	slog.Info("jobs: in-memory store enabled", "capacity", 10000)

	// Domain routes — Register/Renew/Retry/Cancel di-track via jobs.
	dh := domains.NewHandler(p, tracker)
	v1.Post("/domains/check", dh.Check)
	v1.Post("/domains/register", dh.Register)
	v1.Post("/domains/:name/renew", dh.Renew)
	v1.Get("/domains/register/:job_id/status", dh.Status)
	v1.Post("/domains/register/:job_id/retry", dh.Retry)
	v1.Post("/domains/register/:job_id/cancel", dh.Cancel)
	v1.Get("/domains/:name/info", dh.Info)

	// Jobs routes — audit browse (read-only, mutation via tracker only).
	jh := jobs.NewHandler(jobStore)
	v1.Get("/jobs", jh.List)
	v1.Get("/jobs/:id", jh.Get)

	// Nameserver routes.
	hh := hosts.NewHandler(p)
	v1.Get("/domains/:name/nameservers", hh.Get)
	v1.Post("/domains/:name/nameservers", hh.Update)

	// Contact routes.
	ch := contacts.NewHandler(p)
	v1.Get("/contacts/:id", ch.Get)
	v1.Patch("/contacts/:id", ch.Update)
	v1.Patch("/domains/:name/contact", ch.UpdateByDomain)

	// WHOIS.
	wh := whois.NewHandler(p)
	v1.Get("/whois", wh.Whois)

	addr := ":" + cfg.Port
	slog.Info("api-registry listening", "addr", addr, "provider", p.Name(), "mode", cfg.ProviderMode)
	if err := app.Listen(addr); err != nil {
		slog.Error("listen failed", "err", err)
		os.Exit(1)
	}
}

// errorHandler — Fiber panics/errors → HTTP 500 dengan envelope konsisten.
func errorHandler(c *fiber.Ctx, err error) error {
	if e, ok := err.(*fiber.Error); ok {
		return httpx.Err(c, e.Code, "fiber_error", e.Message)
	}
	return httpx.Internal(c, err.Error())
}

func parseLevel(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
