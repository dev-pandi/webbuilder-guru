package router

import (
	"context"
	"log"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/assets"
)

// MountGlobal registers public + infra routes (no auth required):
//   - /healthz, /
//   - /internal/caddy/ask (Caddy on-demand TLS hook)
//   - /public/* (renderer reads)
//   - /uploads/* (static, if storage driver is local)
func MountGlobal(app *fiber.App, deps Deps) {
	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"service": "web-builder-api"})
	})

	// Liveness/readiness with dependency probes.
	// Returns 200 + per-component status, or 503 if any critical dep is down.
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return health(c, deps)
	})

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
	pub.Get("/sites/:id/products", deps.Public.ListProducts)
	pub.Get("/sites/:id/products/:slug", deps.Public.ProductBySlug)
	pub.Get("/sites/:id/blog-posts", deps.Public.ListBlogPosts)
	pub.Get("/sites/:id/blog-posts/:slug", deps.Public.BlogPostBySlug)
}

// health returns per-component liveness so k8s/uptime monitors can distinguish
// "API process up but DB down" from "everything fine."
func health(c *fiber.Ctx, deps Deps) error {
	ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
	defer cancel()

	out := fiber.Map{
		"status": "ok",
		"checks": fiber.Map{},
	}
	checks := out["checks"].(fiber.Map)
	healthy := true

	// --- Database ---
	if deps.Pool != nil {
		if err := deps.Pool.Ping(ctx); err != nil {
			checks["db"] = fiber.Map{"status": "down", "error": err.Error()}
			healthy = false
		} else {
			checks["db"] = fiber.Map{"status": "up"}
		}
	} else {
		checks["db"] = fiber.Map{"status": "skipped"}
	}

	// --- Storage ---
	if deps.AssetStorage != nil {
		checks["storage"] = fiber.Map{
			"status": "up",
			"driver": deps.AssetStorage.Driver(),
		}
	} else {
		checks["storage"] = fiber.Map{"status": "down", "error": "not initialised"}
		// Not fatal — uploads disabled but rest of API works.
	}

	if !healthy {
		out["status"] = "degraded"
		return c.Status(fiber.StatusServiceUnavailable).JSON(out)
	}
	return c.JSON(out)
}
