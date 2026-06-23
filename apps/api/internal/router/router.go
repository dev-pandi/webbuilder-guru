package router

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/webbuilder/api/internal/admin"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/blog"
	"github.com/webbuilder/api/internal/caddy"
	"github.com/webbuilder/api/internal/config"
	"github.com/webbuilder/api/internal/domains"
	"github.com/webbuilder/api/internal/exports"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/products"
	"github.com/webbuilder/api/internal/public"
	"github.com/webbuilder/api/internal/sites"
	"github.com/webbuilder/api/internal/templates"
	"github.com/webbuilder/api/internal/usage"
)

// Deps bundles every handler the router needs. Built in main, passed once.
type Deps struct {
	Cfg config.Config

	Issuer *auth.TokenIssuer

	Auth      *auth.Handler
	Sites     *sites.Handler
	Pages     *pages.Handler
	Domains   *domains.Handler
	Templates *templates.Handler
	Export    *exports.Handler
	Assets    *assets.Handler // may be nil (storage init failed)
	Usage     *usage.Handler
	Products  *products.Handler
	Blog      *blog.Handler

	Caddy  *caddy.Handler
	Public *public.Handler

	Admin *admin.Handler

	// AssetStorage is consulted to decide whether to mount /uploads.
	AssetStorage assets.Storage // may be nil
}

// New builds a fiber.App with global middleware and all route groups mounted.
func New(deps Deps) *fiber.App {
	app := fiber.New(fiber.Config{
		AppName:               "web-builder-api",
		DisableStartupMessage: false,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": fiber.Map{
				"code":    "error",
				"message": err.Error(),
			}})
		},
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     strings.Join(deps.Cfg.CORSOrigins, ","),
		AllowCredentials: true,
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
	}))

	MountGlobal(app, deps)
	MountUser(app, deps)
	MountAdmin(app, deps)

	return app
}
