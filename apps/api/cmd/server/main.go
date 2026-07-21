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
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/domains"
	"github.com/webbuilder/api/internal/errortrack"
	"github.com/webbuilder/api/internal/exports"
	"github.com/webbuilder/api/internal/logging"
	"github.com/webbuilder/api/internal/mail"
	"github.com/webbuilder/api/internal/metrics"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/products"
	"github.com/webbuilder/api/internal/public"
	"github.com/webbuilder/api/internal/registrar"
	"github.com/webbuilder/api/internal/router"
	"github.com/webbuilder/api/internal/seed"
	"github.com/webbuilder/api/internal/sites"
	"github.com/webbuilder/api/internal/snippets"
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

	pool, err := db.ConnectWith(ctx, cfg.DatabaseURL, db.PoolOptions{
		MaxConns:           int32(cfg.DBMaxConns),
		MinConns:           int32(cfg.DBMinConns),
		MaxConnLifetime:    cfg.DBMaxConnLifetime,
		MaxConnIdleTime:    cfg.DBMaxConnIdleTime,
		SlowQueryThreshold: cfg.DBSlowQueryThreshold,
	})
	if err != nil {
		slog.Error("db connect failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Periodic pool snapshot so /metrics exposes acquire/idle counts. 5s tick
	// keeps cardinality low and matches typical Prometheus scrape intervals.
	go func() {
		t := time.NewTicker(5 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s := db.Snapshot(pool)
				metrics.Default.GaugeSet("db_pool_acquired", "Currently checked-out conns", nil, int64(s.Acquired))
				metrics.Default.GaugeSet("db_pool_idle", "Idle conns in pool", nil, int64(s.Idle))
				metrics.Default.GaugeSet("db_pool_total", "Total conns in pool", nil, int64(s.Total))
				metrics.Default.GaugeSet("db_pool_max", "Pool max conns", nil, int64(s.MaxConns))
			}
		}
	}()

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
	snippetRepo := snippets.NewRepo(pool)
	adminRepo := admin.NewRepo(pool)
	purchaseRepo := domain_purchase.NewRepo(pool)

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

	authHandler := auth.NewHandler(authRepo, issuer, auth.HandlerOptions{
		Mailer:     mailer,
		AppBaseURL: cfg.AppBaseURL,
	})

	registrarClient, err := registrar.New(registrar.Config{
		BaseURL: cfg.RegistrarAPIURL,
		APIKey:  cfg.RegistrarAPIKey,
		Timeout: cfg.RegistrarAPITimeout,
	})
	if err != nil {
		slog.Error("registrar client init failed", "error", err)
		os.Exit(1)
	}
	if registrarClient != nil {
		slog.Info("registrar client: enabled", "base_url", cfg.RegistrarAPIURL, "timeout", cfg.RegistrarAPITimeout)
	} else {
		slog.Info("registrar client: disabled (set REGISTRAR_API_URL + REGISTRAR_API_KEY to enable)")
	}

	// Domain purchase handler menyatukan repo lokal + registrar client + user
	// repo (untuk ambil profil kontak). Hanya di-build kalau registrar client
	// aktif — kalau nil, route domain purchase auto-skip di router.
	var purchaseHandler *domain_purchase.Handler
	if registrarClient != nil {
		purchaseHandler = domain_purchase.NewHandler(purchaseRepo, registrarClient, authRepo, cfg.RegistrarWebhookSecret)
		if cfg.RegistrarWebhookSecret == "" {
			slog.Warn("registrar webhook: REGISTRAR_WEBHOOK_SECRET kosong — endpoint akan 503 sampai di-set")
		}
	}
	googleHandler := auth.NewGoogleHandler(
		authRepo, authHandler,
		cfg.GoogleOAuthClientID, cfg.GoogleOAuthClientSecret, cfg.GoogleOAuthRedirectURL,
		cfg.AppBaseURL,
	)
	if googleHandler.Enabled() {
		slog.Info("google oauth: enabled", "redirect_url", cfg.GoogleOAuthRedirectURL)
	} else {
		slog.Info("google oauth: disabled (set GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URL to enable)")
	}

	deps := router.Deps{
		Cfg:          cfg,
		Pool:         pool,
		Issuer:       issuer,
		Auth:           authHandler,
		AuthGoogle:     googleHandler,
		Registrar:      registrarClient,
		DomainPurchase: purchaseHandler,
		Sites:        sites.NewHandler(siteRepo),
		Pages:        pages.NewHandler(pageRepo, siteRepo, issuer),
		Domains:      domains.NewHandler(domainRepo, siteRepo, cfg.PlatformIPs),
		Templates:    templates.NewHandler(templateRepo, siteRepo, pageRepo, productRepo, blogRepo, purchaseRepo),
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
		Snippets:     snippets.NewHandler(snippetRepo),
		AssetStorage: assetStorage,
		ErrorTracker: tracker,
	}
	if assetStorage != nil {
		deps.Assets = assets.NewHandler(assetRepo, assetStorage, siteRepo, assets.HandlerOptions{
			Compress:     cfg.ImageCompressEnabled,
			MaxDimension: cfg.ImageMaxDimension,
			JPEGQuality:  cfg.ImageJPEGQuality,
		})
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
	slog.Info("shutdown: stop signal received — draining")

	// Drain in-flight requests within a bounded window so a runaway handler
	// can't hold up the process indefinitely.
	shutdownCtx, c2 := context.WithTimeout(context.Background(), 25*time.Second)
	defer c2()
	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		slog.Error("shutdown: http server", "error", err)
	}
	// Cancel background goroutines (verify email, password reset dispatchers).
	cancel()
	slog.Info("shutdown: complete")
}
