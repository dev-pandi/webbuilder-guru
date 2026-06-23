package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/webbuilder/api/internal/admin"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/blog"
	"github.com/webbuilder/api/internal/caddy"
	"github.com/webbuilder/api/internal/config"
	"github.com/webbuilder/api/internal/db"
	"github.com/webbuilder/api/internal/domains"
	"github.com/webbuilder/api/internal/exports"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/products"
	"github.com/webbuilder/api/internal/public"
	"github.com/webbuilder/api/internal/router"
	"github.com/webbuilder/api/internal/seed"
	"github.com/webbuilder/api/internal/sites"
	"github.com/webbuilder/api/internal/templates"
	"github.com/webbuilder/api/internal/usage"
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

	if err := db.Migrate(ctx, pool, cfg.DatabaseURL); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	// Repositories
	authRepo := auth.NewRepo(pool)
	siteRepo := sites.NewRepo(pool)
	pageRepo := pages.NewRepo(pool)
	domainRepo := domains.NewRepo(pool)
	templateRepo := templates.NewRepo(pool)
	assetRepo := assets.NewRepo(pool)
	productRepo := products.NewRepo(pool)
	blogRepo := blog.NewRepo(pool)
	adminRepo := admin.NewRepo(pool)

	if err := seed.Run(ctx, seed.Deps{
		Pool:      pool,
		Auth:      authRepo,
		Templates: templateRepo,
		Sites:     siteRepo,
		Pages:     pageRepo,
		Products:  productRepo,
		Blog:      blogRepo,
	}, seed.Options{
		AdminEmail:    cfg.AdminEmail,
		AdminPassword: cfg.AdminPassword,
		AdminName:     cfg.AdminName,
		Demo:          cfg.SeedDemo,
		DemoEmail:     cfg.SeedDemoEmail,
		DemoPassword:  cfg.SeedDemoPassword,
	}); err != nil {
		log.Printf("warning: seed failed: %v", err)
	}

	// Storage (driver picks local or s3)
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
	if assetStorage != nil {
		log.Printf("[storage] driver=%s", assetStorage.Driver())
	}

	// Handlers
	issuer := auth.NewTokenIssuer(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	usageRepo := usage.NewRepo(pool, siteRepo, pageRepo, assetRepo)

	deps := router.Deps{
		Cfg:          cfg,
		Issuer:       issuer,
		Auth:         auth.NewHandler(authRepo, issuer),
		Sites:        sites.NewHandler(siteRepo),
		Pages:        pages.NewHandler(pageRepo, siteRepo),
		Domains:      domains.NewHandler(domainRepo, siteRepo),
		Templates:    templates.NewHandler(templateRepo, siteRepo, pageRepo),
		Export: exports.NewHandler(&exports.Builder{
			Sites:    siteRepo,
			Pages:    pageRepo,
			Products: productRepo,
			Blog:     blogRepo,
		}),
		Usage:        usage.NewHandler(usageRepo, siteRepo),
		Caddy:        caddy.NewHandler(domainRepo, cfg.RendererDefaultHost, cfg.PublicAppHost, cfg.PublicAPIHost),
		Public:       public.NewHandler(siteRepo, pageRepo, productRepo, blogRepo, cfg.RendererDefaultHost),
		Admin:        admin.NewHandler(adminRepo),
		Products:     products.NewHandler(productRepo, siteRepo),
		Blog:         blog.NewHandler(blogRepo, siteRepo),
		AssetStorage: assetStorage,
	}
	if assetStorage != nil {
		deps.Assets = assets.NewHandler(assetRepo, assetStorage, siteRepo)
	}

	app := router.New(deps)

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
