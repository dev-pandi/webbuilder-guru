package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/webbuilder/api/internal/admin"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/blog"
	"github.com/webbuilder/api/internal/caddy"
	"github.com/webbuilder/api/internal/config"
	"github.com/webbuilder/api/internal/db"
	"github.com/webbuilder/api/internal/domains"
	"github.com/webbuilder/api/internal/errortrack"
	"github.com/webbuilder/api/internal/exports"
	"github.com/webbuilder/api/internal/logging"
	"github.com/webbuilder/api/internal/mail"
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
	// Auto-load .env from working dir (silent if missing). Existing OS env
	// always wins, so Docker Compose passthrough is unaffected.
	envErr := godotenv.Load()

	cfg := config.Load()
	logging.Setup(cfg.AppEnv, cfg.LogLevel)

	tracker, err := errortrack.Init(cfg.SentryDSN, cfg.AppEnv, "")
	if err != nil {
		slog.Warn("error tracker init failed (disabled)", "error", err)
	}
	if tracker.Enabled() {
		slog.Info("error tracker enabled")
	}

	if envErr != nil && !os.IsNotExist(envErr) {
		slog.Warn("dotenv load issue", "error", envErr)
	}

	if err := cfg.Validate(); err != nil {
		slog.Error("config validation failed", "error", err,
			"hint", "set APP_ENV=development to bypass these checks during dev")
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool, cfg.DatabaseURL); err != nil {
		slog.Error("db migrate failed", "error", err)
		os.Exit(1)
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
		slog.Warn("seed failed", "error", err)
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
		slog.Warn("asset storage init failed (uploads disabled)", "error", err)
	}
	if assetStorage != nil {
		slog.Info("storage ready", "driver", assetStorage.Driver())
	}

	// Mail sender — driver "log" in dev, "smtp" in prod.
	mailer, err := mail.New(mail.Config{
		Driver:   cfg.MailDriver,
		Host:     cfg.SMTPHost,
		Port:     cfg.SMTPPort,
		Username: cfg.SMTPUsername,
		Password: cfg.SMTPPassword,
		From:     cfg.SMTPFrom,
		StartTLS: cfg.SMTPStartTLS,
	})
	if err != nil {
		slog.Error("mail init failed", "error", err)
		os.Exit(1)
	}
	slog.Info("mail ready", "driver", mailer.Driver())

	// Handlers
	issuer := auth.NewTokenIssuer(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	usageRepo := usage.NewRepo(pool, siteRepo, pageRepo, assetRepo)

	deps := router.Deps{
		Cfg:          cfg,
		Pool:         pool,
		Issuer:       issuer,
		Auth: auth.NewHandler(authRepo, issuer, auth.HandlerOptions{
			Mailer:     mailer,
			AppBaseURL: cfg.AppBaseURL,
		}),
		Sites:        sites.NewHandler(siteRepo),
		Pages:        pages.NewHandler(pageRepo, siteRepo),
		Domains:      domains.NewHandler(domainRepo, siteRepo, cfg.PlatformIPs),
		Templates:    templates.NewHandler(templateRepo, siteRepo, pageRepo, productRepo, blogRepo),
		Export: exports.NewHandler(&exports.Builder{
			Sites:    siteRepo,
			Pages:    pageRepo,
			Products: productRepo,
			Blog:     blogRepo,
		}),
		Usage:        usage.NewHandler(usageRepo, siteRepo),
		Caddy:        caddy.NewHandler(domainRepo, cfg.RendererDefaultHost, cfg.PublicAppHost, cfg.PublicAPIHost, cfg.CaddyAskSecret),
		Public:       public.NewHandler(siteRepo, pageRepo, productRepo, blogRepo, cfg.RendererDefaultHost),
		Admin:        admin.NewHandler(adminRepo),
		Products:     products.NewHandler(productRepo, siteRepo),
		Blog:         blog.NewHandler(blogRepo, siteRepo),
		AssetStorage: assetStorage,
		ErrorTracker: tracker,
	}
	if assetStorage != nil {
		deps.Assets = assets.NewHandler(assetRepo, assetStorage, siteRepo)
	}

	app := router.New(deps)

	go func() {
		slog.Info("http listening", "addr", cfg.HTTPAddr, "env", cfg.AppEnv)
		if err := app.Listen(cfg.HTTPAddr); err != nil {
			slog.Error("listen failed", "error", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	slog.Info("shutdown: gracefully stopping")
	shutdownCtx, c2 := context.WithTimeout(context.Background(), 10*time.Second)
	defer c2()
	_ = app.ShutdownWithContext(shutdownCtx)
}
