package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/caddy"
	"github.com/webbuilder/api/internal/config"
	"github.com/webbuilder/api/internal/db"
	"github.com/webbuilder/api/internal/domains"
	"github.com/webbuilder/api/internal/exports"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/public"
	"github.com/webbuilder/api/internal/sites"
	"github.com/webbuilder/api/internal/templates"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	templateRepo := templates.NewRepo(pool)
	if err := templateRepo.Seed(ctx); err != nil {
		log.Printf("warning: template seed failed: %v", err)
	}

	authRepo := auth.NewRepo(pool)
	issuer := auth.NewTokenIssuer(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	authHandler := auth.NewHandler(authRepo, issuer)

	siteRepo := sites.NewRepo(pool)
	siteHandler := sites.NewHandler(siteRepo)

	pageRepo := pages.NewRepo(pool)
	pageHandler := pages.NewHandler(pageRepo, siteRepo)

	domainRepo := domains.NewRepo(pool)
	domainHandler := domains.NewHandler(domainRepo, siteRepo)

	tplHandler := templates.NewHandler(templateRepo, siteRepo, pageRepo)

	exportBuilder := &exports.Builder{Sites: siteRepo, Pages: pageRepo}
	exportHandler := exports.NewHandler(exportBuilder)

	assetRepo := assets.NewRepo(pool)
	assetStorage, err := assets.NewStorage(ctx, assets.Config{
		Driver:         assets.Driver(cfg.StorageDriver),
		S3Endpoint:     cfg.StorageS3Endpoint,
		S3AccessKey:    cfg.StorageS3AccessKey,
		S3SecretKey:    cfg.StorageS3SecretKey,
		S3Region:       cfg.StorageS3Region,
		S3Bucket:       cfg.StorageS3Bucket,
		S3UseSSL:       cfg.StorageS3UseSSL,
		S3PublicURL:    cfg.StorageS3PublicURL,
		LocalDir:       cfg.StorageLocalDir,
		LocalPublicURL: cfg.StorageLocalPublicURL,
	})
	if err != nil {
		log.Printf("warning: asset storage init failed (uploads disabled): %v", err)
	}
	var assetHandler *assets.Handler
	if assetStorage != nil {
		log.Printf("[storage] driver=%s", assetStorage.Driver())
		assetHandler = assets.NewHandler(assetRepo, assetStorage, siteRepo)
	}

	caddyHandler := caddy.NewHandler(domainRepo, cfg.RendererDefaultHost, cfg.PublicAppHost, cfg.PublicAPIHost)
	publicHandler := public.NewHandler(siteRepo, pageRepo, cfg.RendererDefaultHost)

	app := fiber.New(fiber.Config{
		AppName:               "web-builder-api",
		DisableStartupMessage: false,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			var fe *fiber.Error
			if e, ok := err.(*fiber.Error); ok {
				fe = e
				code = e.Code
			}
			_ = fe
			return c.Status(code).JSON(fiber.Map{"error": fiber.Map{
				"code":    "error",
				"message": err.Error(),
			}})
		},
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     strings.Join(cfg.CORSOrigins, ","),
		AllowCredentials: true,
		AllowHeaders:     "Origin,Content-Type,Accept,Authorization",
		AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
	}))

	app.Get("/healthz", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"ok": true}) })
	app.Get("/", func(c *fiber.Ctx) error { return c.JSON(fiber.Map{"service": "web-builder-api"}) })

	// If storage is local, serve uploaded files as static.
	if ls, ok := assetStorage.(assets.LocalServable); ok {
		app.Static(ls.LocalRoute(), ls.LocalDir())
		log.Printf("[storage] serving %s from %s", ls.LocalRoute(), ls.LocalDir())
	}

	// Caddy internal hook (no JWT).
	app.Get("/internal/caddy/ask", caddyHandler.Ask)

	// Public read endpoints (renderer).
	pub := app.Group("/public")
	pub.Get("/site-by-host", publicHandler.SiteByHost)
	pub.Get("/sites/:id/pages", publicHandler.ListPages)
	pub.Get("/sites/:id/pages/:slug", publicHandler.PageBySlug)

	v1 := app.Group("/api/v1")

	// Auth
	v1.Post("/auth/register", authHandler.Register)
	v1.Post("/auth/login", authHandler.Login)
	v1.Post("/auth/refresh", authHandler.Refresh)
	v1.Post("/auth/logout", authHandler.Logout)

	// Templates (public list)
	v1.Get("/templates", tplHandler.List)
	v1.Get("/templates/:slug", tplHandler.Get)

	// Authed routes
	authed := v1.Group("/", auth.Required(issuer))
	authed.Get("/auth/me", authHandler.Me)

	authed.Get("/sites", siteHandler.List)
	authed.Post("/sites", siteHandler.Create)
	authed.Get("/sites/:id", siteHandler.Get)
	authed.Patch("/sites/:id", siteHandler.Update)
	authed.Delete("/sites/:id", siteHandler.Delete)
	authed.Post("/sites/:id/publish", siteHandler.Publish)
	authed.Post("/sites/:id/export", exportHandler.Export)
	authed.Post("/sites/from-template/:slug", tplHandler.CreateSiteFromTemplate)

	authed.Get("/sites/:id/pages", pageHandler.ListBySite)
	authed.Post("/sites/:id/pages", pageHandler.CreateForSite)
	authed.Get("/pages/:id", pageHandler.Get)
	authed.Patch("/pages/:id", pageHandler.Update)
	authed.Delete("/pages/:id", pageHandler.Delete)

	if assetHandler != nil {
		authed.Get("/sites/:id/assets", assetHandler.ListBySite)
		authed.Post("/sites/:id/assets", assetHandler.Upload)
	}

	authed.Get("/sites/:id/domains", domainHandler.ListBySite)
	authed.Post("/sites/:id/domains", domainHandler.Add)
	authed.Post("/domains/:id/verify", domainHandler.Verify)
	authed.Delete("/domains/:id", domainHandler.Delete)

	go func() {
		if err := app.Listen(cfg.HTTPAddr); err != nil {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	fmt.Println("\n[shutdown] gracefully stopping...")
	shutdownCtx, c2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer c2()
	_ = app.ShutdownWithContext(shutdownCtx)
}
