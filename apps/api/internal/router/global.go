package router

import (
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/assets"
)

// MountGlobal registers public + infra routes (no auth required):
//   - /healthz, /
//   - /internal/caddy/ask (Caddy on-demand TLS hook)
//   - /public/* (renderer reads)
//   - /uploads/* (static, if storage driver is local)
func MountGlobal(app *fiber.App, deps Deps) {
	app.Get("/healthz", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) })
	app.Get("/", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"service": "web-builder-api"}) })

	// Local-disk storage serves uploaded files itself.
	if ls, ok := deps.AssetStorage.(assets.LocalServable); ok {
		app.Static(ls.LocalRoute(), ls.LocalDir())
		log.Printf("[storage] serving %s from %s", ls.LocalRoute(), ls.LocalDir())
	}

	// Caddy on_demand_tls.ask
	app.Get("/internal/caddy/ask", deps.Caddy.Ask)

	// Public read endpoints (renderer).
	pub := app.Group("/public")
	pub.Get("/site-by-host", deps.Public.SiteByHost)
	pub.Get("/sites/:id/pages", deps.Public.ListPages)
	pub.Get("/sites/:id/pages/:slug", deps.Public.PageBySlug)
}
