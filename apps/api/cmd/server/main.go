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
	"github.com/webbuilder/api/internal/analytics"
	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/blog"
	"github.com/webbuilder/api/internal/cachepurge"
	"github.com/webbuilder/api/internal/caddy"
	"github.com/webbuilder/api/internal/cloudflare"
	"github.com/webbuilder/api/internal/config"
	"github.com/webbuilder/api/internal/db"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/domains"
	"github.com/webbuilder/api/internal/errortrack"
	"github.com/webbuilder/api/internal/exports"
	"github.com/webbuilder/api/internal/forms"
	"github.com/webbuilder/api/internal/logging"
	"github.com/webbuilder/api/internal/mail"
	"github.com/webbuilder/api/internal/metrics"
	"github.com/webbuilder/api/internal/notifier"
	"github.com/webbuilder/api/internal/pages"
	"github.com/webbuilder/api/internal/products"
	"github.com/webbuilder/api/internal/public"
	"github.com/webbuilder/api/internal/registrar"
	"github.com/webbuilder/api/internal/reseller"
	"github.com/webbuilder/api/internal/router"
	"github.com/webbuilder/api/internal/seed"
	"github.com/webbuilder/api/internal/sites"
	"github.com/webbuilder/api/internal/snippets"
	"github.com/webbuilder/api/internal/templates"
	"github.com/webbuilder/api/internal/usage"
	"github.com/webbuilder/api/internal/wallet"
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
	cloudflareRepo := cloudflare.NewRepo(pool)
	formsRepo := forms.NewRepo(pool)
	analyticsRepo := analytics.NewRepo(pool)

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

		// Auto-login + JWT refresh loop. Kalau credentials di-set, override
		// REGISTRAR_API_KEY dengan JWT hasil login (30-day TTL) + refresh
		// tiap 25 hari sebelum expire.
		if cfg.RegistrarResellerEmail != "" && cfg.RegistrarResellerPassword != "" {
			// Simpan credentials di client supaya `do` bisa auto-recover
			// kalau JWT ditolak 401 di tengah siklus 25-day refresh (mis.
			// registrar revoke). Client akan re-login sekali + retry request.
			registrarClient.SetCredentials(cfg.RegistrarResellerEmail, cfg.RegistrarResellerPassword)

			loginCtx, cancelLogin := context.WithTimeout(ctx, 15*time.Second)
			jwt, err := registrarClient.Login(loginCtx, cfg.RegistrarResellerEmail, cfg.RegistrarResellerPassword)
			cancelLogin()
			if err != nil {
				slog.Error("registrar login failed at startup", "error", err,
					"hint", "cek REGISTRAR_RESELLER_EMAIL + REGISTRAR_RESELLER_PASSWORD, atau kosongkan supaya pakai REGISTRAR_API_KEY apa adanya")
				os.Exit(1)
			}
			registrarClient.SetAPIKey(jwt)
			slog.Info("registrar jwt: auto-login success (will refresh every 25d, auto-recover on 401)")

			// Background refresh — tick tiap 25 hari (before 30-day expire).
			// Kalau login gagal di refresh, log error tapi tetap coba lagi
			// next tick — JWT lama masih valid ~5 hari.
			go func() {
				t := time.NewTicker(25 * 24 * time.Hour)
				defer t.Stop()
				for {
					select {
					case <-ctx.Done():
						return
					case <-t.C:
						rCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
						jwt, err := registrarClient.Login(rCtx, cfg.RegistrarResellerEmail, cfg.RegistrarResellerPassword)
						cancel()
						if err != nil {
							slog.Error("registrar jwt refresh failed (will retry next tick)", "error", err)
							continue
						}
						registrarClient.SetAPIKey(jwt)
						slog.Info("registrar jwt: refreshed")
					}
				}
			}()
		} else if cfg.RegistrarAPIKey == "" {
			slog.Warn("registrar client: no credentials + no static API key — all reseller calls will 401")
		}
	} else {
		slog.Info("registrar client: disabled (set REGISTRAR_API_URL + REGISTRAR_API_KEY to enable)")
	}

	// Domain purchase handler menyatukan repo lokal + registrar client + user
	// repo (untuk ambil profil kontak). Hanya di-build kalau registrar client
	// aktif — kalau nil, route domain purchase auto-skip di router.
	var purchaseHandler *domain_purchase.Handler
	if registrarClient != nil {
		// Dokumen (KTP/NPWP) BUKAN disimpan di web builder — flow multipart
		// upload diteruskan langsung ke registrar via AttachDocument handler.
		// Single source of truth = registrar.
		purchaseHandler = domain_purchase.NewHandler(
			purchaseRepo, registrarClient, authRepo, siteRepo, cloudflareRepo,
			cfg.PlatformIPs, cfg.RegistrarWebhookSecret,
		)
		if cfg.RegistrarWebhookSecret == "" {
			slog.Warn("registrar webhook: REGISTRAR_WEBHOOK_SECRET kosong — endpoint akan 503 sampai di-set")
		}

		// Expiry notifier — scan tiap 24 jam, email user kalau domain aktif
		// mendekati expire (≤ 30 hari). Dedup per domain via kolom
		// expiry_notice_sent_at + resend window 7 hari.
		//
		// Hanya jalan kalau registrar aktif (kalau tidak ada purchase, tidak
		// ada yang perlu di-notify). Mailer driver "log" tetap OK — email
		// akan muncul di stdout untuk verifikasi dev.
		expiry := notifier.NewExpiry(purchaseRepo, mailer, notifier.ExpiryConfig{
			Interval:    24 * time.Hour,
			Within:      30 * 24 * time.Hour,
			ResendAfter: 7 * 24 * time.Hour,
			AppBaseURL:  cfg.AppBaseURL,
		})
		go expiry.Run(ctx)

		// Periodic sync — self-heal drift kalau webhook drop. 6 jam cukup untuk
		// tetap responsive tanpa spam registrar. User bisa tetap trigger manual
		// via tombol "Sinkronkan" di /settings/domains kalau perlu update segera.
		go purchaseHandler.RunPeriodicSync(ctx, 6*time.Hour)
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

	// Cache purger — hubungkan domain lookup + Cloudflare purge. Nil-safe:
	// kalau CF repo / purchases nil, purger jadi no-op. Publish handler tetap
	// jalan tanpa error.
	purger := cachepurge.New(cloudflareRepo, purchaseRepo)

	sitesHandler := sites.NewHandler(siteRepo)
	sitesHandler.SetPurger(purger)
	// Storage-file cleanup untuk asset saat site di-delete. DB row cascade
	// otomatis lewat FK, tapi file bytes butuh cleanup eksplisit supaya
	// tidak numpuk orphan di S3/local disk. Nil-safe kalau storage disabled.
	if assetStorage != nil {
		sitesHandler.SetAssetCleaner(assets.NewSiteCleaner(assetRepo, assetStorage))
	}
	pagesHandler := pages.NewHandler(pageRepo, siteRepo, issuer)
	pagesHandler.SetPurger(purger)

	// Admin handler + inject authRepo untuk reseller management (Phase 1).
	adminHandler := admin.NewHandler(adminRepo)
	adminHandler.SetAuthRepo(authRepo)

	// Reseller portal handler — Phase 2.
	resellerRepo := reseller.NewRepo(pool)
	resellerHandler := reseller.NewHandler(resellerRepo, authRepo, mailer, cfg.AppBaseURL)

	// Wire reseller assignment checker ke domain purchase handler (Phase 3
	// on-behalf-of). Kalau purchaseHandler nil (registrar disabled),
	// SetAssignmentChecker jadi no-op.
	if purchaseHandler != nil {
		purchaseHandler.SetAssignmentChecker(resellerRepo)
	}

	// Wallet proxy handler — Phase 3.5. Nil kalau registrar disabled
	// (no client), otherwise wire penuh.
	var walletHandler *wallet.Handler
	if registrarClient != nil {
		walletHandler = wallet.NewHandler(registrarClient, authRepo)
	}

	deps := router.Deps{
		Cfg:          cfg,
		Pool:         pool,
		Issuer:       issuer,
		Auth:           authHandler,
		AuthGoogle:     googleHandler,
		Registrar:      registrarClient,
		DomainPurchase: purchaseHandler,
		Sites:        sitesHandler,
		Pages:        pagesHandler,
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
		Public:       public.NewHandler(siteRepo, pageRepo, productRepo, blogRepo),
		Admin:        adminHandler,
		Cloudflare:   cloudflare.NewHandler(cloudflareRepo),
		Forms:        forms.NewHandler(formsRepo, siteRepo, mailer),
		Analytics:    analytics.NewHandler(analyticsRepo, siteRepo),
		Products:     products.NewHandler(productRepo, siteRepo),
		Blog:         blog.NewHandler(blogRepo, siteRepo),
		Snippets:     snippets.NewHandler(snippetRepo),
		Reseller:     resellerHandler,
		Wallet:       walletHandler,
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

	// Scheduled publish worker — scan pages tabel tiap 60 detik untuk auto
	// publish draft yang scheduled_publish_at-nya sudah lewat. Interval hemat
	// DB (partial index) tapi tetap responsive (rata-rata delay 30s dari jadwal).
	scheduler := pages.NewScheduler(pageRepo, 60*time.Second)
	scheduler.SetPurger(purger)
	go scheduler.Run(ctx)

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
