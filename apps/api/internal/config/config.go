package config

import (
	"os"
	"strings"
	"time"
)

type Config struct {
	AppEnv             string
	HTTPAddr           string
	DatabaseURL        string
	JWTSecret          string
	JWTAccessTTL       time.Duration
	JWTRefreshTTL      time.Duration
	CaddyAskSecret     string
	PublicAppHost      string
	PublicAPIHost      string
	RendererDefaultHost string
	CORSOrigins        []string

	StorageDriver string

	// S3 / MinIO
	StorageS3Endpoint  string
	StorageS3AccessKey string
	StorageS3SecretKey string
	StorageS3Region    string
	StorageS3Bucket    string
	StorageS3UseSSL    bool
	StorageS3PublicURL string

	// Local
	StorageLocalDir       string
	StorageLocalPublicURL string
}

func Load() Config {
	return Config{
		AppEnv:              env("APP_ENV", "development"),
		HTTPAddr:            env("HTTP_ADDR", ":8080"),
		DatabaseURL:         env("DATABASE_URL", "postgres://webbuilder:webbuilder@localhost:5432/webbuilder?sslmode=disable"),
		JWTSecret:           env("JWT_SECRET", "dev-secret-change-me"),
		JWTAccessTTL:        envDuration("JWT_ACCESS_TTL", 15*time.Minute),
		JWTRefreshTTL:       envDuration("JWT_REFRESH_TTL", 7*24*time.Hour),
		CaddyAskSecret:      env("CADDY_ASK_SECRET", "dev-caddy-secret"),
		PublicAppHost:       env("PUBLIC_APP_HOST", "app.localhost"),
		PublicAPIHost:       env("PUBLIC_API_HOST", "api.localhost"),
		RendererDefaultHost: env("RENDERER_DEFAULT_HOST", "localhost"),
		CORSOrigins:         splitCSV(env("CORS_ORIGINS", "http://localhost:3000,http://app.localhost")),

		StorageDriver: env("STORAGE_DRIVER", "local"),

		StorageS3Endpoint:  env("STORAGE_S3_ENDPOINT", "minio:9000"),
		StorageS3AccessKey: env("STORAGE_S3_ACCESS_KEY", "minioadmin"),
		StorageS3SecretKey: env("STORAGE_S3_SECRET_KEY", "minioadmin"),
		StorageS3Region:    env("STORAGE_S3_REGION", "us-east-1"),
		StorageS3Bucket:    env("STORAGE_S3_BUCKET", "assets"),
		StorageS3UseSSL:    env("STORAGE_S3_USE_SSL", "false") == "true",
		StorageS3PublicURL: env("STORAGE_S3_PUBLIC_URL", "http://localhost:9000/assets"),

		StorageLocalDir:       env("STORAGE_LOCAL_DIR", "./uploads"),
		StorageLocalPublicURL: env("STORAGE_LOCAL_PUBLIC_URL", "http://api.localhost/uploads"),
	}
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envDuration(k string, def time.Duration) time.Duration {
	if v := os.Getenv(k); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
