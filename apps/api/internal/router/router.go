package router

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/compress"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/webbuilder/api/internal/admin"
	"github.com/webbuilder/api/internal/analytics"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/blog"
	"github.com/webbuilder/api/internal/caddy"
	"github.com/webbuilder/api/internal/cloudflare"
	"github.com/webbuilder/api/internal/config"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/domains"
	"github.com/webbuilder/api/internal/errortrack"
	"github.com/webbuilder/api/internal/exports"
	"github.com/webbuilder/api/internal/forms"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/products"
	"github.com/webbuilder/api/internal/public"
	"github.com/webbuilder/api/internal/registrar"
	"github.com/webbuilder/api/internal/reseller"
	"github.com/webbuilder/api/internal/sites"
	"github.com/webbuilder/api/internal/snippets"
	"github.com/webbuilder/api/internal/templates"
	"github.com/webbuilder/api/internal/usage"
	"github.com/webbuilder/api/internal/wallet"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Deps bundles every handler the router needs. Built in main, passed once.
type Deps struct {
	Cfg config.Config

	// Pool is used by /healthz to ping the database for liveness checks.
	Pool *pgxpool.Pool

	Issuer *auth.TokenIssuer

	Auth       *auth.Handler
	AuthGoogle *auth.GoogleHandler
	Sites     *sites.Handler
	Pages     *pages.Handler
	Domains   *domains.Handler
	Templates *templates.Handler
	Export    *exports.Handler
	Assets    *assets.Handler // may be nil (storage init failed)
	Usage     *usage.Handler
	Products  *products.Handler
	Blog      *blog.Handler
	Snippets  *snippets.Handler

	Caddy  *caddy.Handler
	Public *public.Handler

	// Registrar is the domain-purchase client. May be nil (feature disabled
	// when REGISTRAR_API_URL is empty) — callers must nil-check.
	Registrar *registrar.Client

	// DomainPurchase menjembatani frontend ↔ registrar. Handler check/purchase/
	// status/webhook + attach document (multipart passthrough). Nil kalau
	// registrar disabled (client wrapper nil).
	DomainPurchase *domain_purchase.Handler

	Admin *admin.Handler

	// Cloudflare admin CRUD. Handler nil = fitur disabled (kalau perlu
	// dimatikan, cukup jangan build handler-nya di main). Router mount
	// nil-safe di admin.go.
	Cloudflare *cloudflare.Handler

	// Forms — user CRUD form + submissions inbox + public submit endpoint.
	// Mount di user.go (JWT) + global.go (public POST /public/forms/:id/submit).
	Forms *forms.Handler

	// Analytics — page view counter. Public POST (renderer beacon) + authed
	// GET (dashboard summary). Nil-safe.
	Analytics *analytics.Handler

	// Reseller — Phase 2 handler untuk invite agent + create client + list.
	// Mount di /api/v1/reseller/* (reseller only) dan /api/v1/agent/* (agent
	// only). Nil kalau feature belum di-wire.
	Reseller *reseller.Handler

	// Wallet — Phase 3.5 proxy ke registrar reseller wallet. Nil kalau
	// registrar disabled (client wrapper nil).
	Wallet *wallet.Handler

	// Audit — Phase 7 admin audit log viewer. Nil-safe.
	Audit *audit.Handler

	// AssetStorage is consulted to decide whether to mount /uploads.
	AssetStorage assets.Storage // may be nil

	// ErrorTracker captures panics and 5xx errors. May be a disabled client
	// (nil DSN) — Capture is a noop in that case.
	ErrorTracker *errortrack.Client
}

// New builds a fiber.App with global middleware and all route groups mounted.
func New(deps Deps) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:               "web-builder-api",
		DisableStartupMessage: false,
		// Generous read timeout for large multipart uploads; tight write timeout
		// keeps a stuck client from holding a worker forever.
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
		// Body limit covers multipart uploads (assets); single JSON requests are
		// well below this.
		BodyLimit: 25 * 1024 * 1024,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			// Ship 5xx to error tracker — 4xx are user errors, not actionable.
			if code >= 500 && deps.ErrorTracker != nil {
				deps.ErrorTracker.Capture(c.Context(), err, map[string]string{
					"method": c.Method(),
					"path":   c.Path(),
				})
			}
			return c.Status(code).JSON(fiber.Map{"error": fiber.Map{
				"code":    "error",
				"message": err.Error(),
			}})
		},
	})

	app.Use(recover.New(recover.Config{
		EnableStackTrace: true,
		StackTraceHandler: func(c *fiber.Ctx, e interface{}) {
			err, ok := e.(error)
			if !ok {
				err = fiberPanic{Cause: e}
			}
			if deps.ErrorTracker != nil {
				deps.ErrorTracker.Capture(c.Context(), err, map[string]string{
					"method": c.Method(),
					"path":   c.Path(),
					"kind":   "panic",
				})
			}
		},
	}))
	app.Use(RequestID())
	app.Use(SlogLogger())
	app.Use(SecurityHeaders(deps.Cfg.AppEnv == "production"))
	// Compress JSON+HTML responses. Level=2 chosen for CPU/size balance — gzip
	// level 6 (default) is ~3x slower on large pages for marginal gains.
	app.Use(compress.New(compress.Config{Level: compress.LevelBestSpeed}))
	app.Use(cors.New(cors.Config{
		AllowOrigins:     strings.Join(deps.Cfg.CORSOrigins, ","),
		AllowCredentials: true,
		// Idempotency-Key wajib di whitelist — dipakai POST /domains/purchase +
		// /domains/renew supaya browser tidak block preflight (CORS spec: custom
		// header selain simple list harus di-declare eksplisit).
		AllowHeaders: "Origin,Content-Type,Accept,Authorization,Idempotency-Key",
		AllowMethods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
	}))

	MountGlobal(app, deps)
	MountUser(app, deps)
	MountAdmin(app, deps)

	return app
}

// fiberPanic wraps a non-error panic value so the error tracker sees an `error`.
type fiberPanic struct{ Cause any }

func (p fiberPanic) Error() string {
	return strings.TrimSpace(fmtAny(p.Cause))
}

// fmtAny is %v without importing fmt for one call; keeps this file's deps tight.
func fmtAny(v any) string {
	switch s := v.(type) {
	case string:
		return s
	case error:
		return s.Error()
	default:
		return "panic: non-error value"
	}
}
