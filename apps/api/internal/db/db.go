package db

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/tracelog"
)

// PoolOptions tunes the connection pool. Zero values fall back to sensible
// production defaults; callers normally pass values from config so operators
// can adjust without redeploying code.
type PoolOptions struct {
	MaxConns        int32
	MinConns        int32
	MaxConnLifetime time.Duration
	MaxConnIdleTime time.Duration

	// SlowQueryThreshold logs queries that exceed this duration. Zero disables.
	// Helpful early-warning for missing indexes / accidental N+1.
	SlowQueryThreshold time.Duration
}

func defaultPoolOptions() PoolOptions {
	return PoolOptions{
		MaxConns:           10,
		MinConns:           2,
		MaxConnLifetime:    time.Hour,
		MaxConnIdleTime:    15 * time.Minute,
		SlowQueryThreshold: 500 * time.Millisecond,
	}
}

// Connect with default pool options. Kept for callers that don't need tuning.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	return ConnectWith(ctx, url, defaultPoolOptions())
}

// ConnectWith opens a pool with the given tuning + slow-query tracing.
func ConnectWith(ctx context.Context, url string, opt PoolOptions) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("parse db url: %w", err)
	}

	def := defaultPoolOptions()
	if opt.MaxConns > 0 {
		cfg.MaxConns = opt.MaxConns
	} else {
		cfg.MaxConns = def.MaxConns
	}
	if opt.MinConns > 0 {
		cfg.MinConns = opt.MinConns
	} else {
		cfg.MinConns = def.MinConns
	}
	if opt.MaxConnLifetime > 0 {
		cfg.MaxConnLifetime = opt.MaxConnLifetime
	} else {
		cfg.MaxConnLifetime = def.MaxConnLifetime
	}
	if opt.MaxConnIdleTime > 0 {
		cfg.MaxConnIdleTime = opt.MaxConnIdleTime
	} else {
		cfg.MaxConnIdleTime = def.MaxConnIdleTime
	}

	threshold := opt.SlowQueryThreshold
	if threshold == 0 {
		threshold = def.SlowQueryThreshold
	}
	if threshold > 0 {
		cfg.ConnConfig.Tracer = &tracelog.TraceLog{
			Logger:   slogQueryLogger{threshold: threshold},
			LogLevel: tracelog.LogLevelInfo,
		}
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect db: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	slog.Info("db pool ready",
		"max_conns", cfg.MaxConns,
		"min_conns", cfg.MinConns,
		"max_lifetime", cfg.MaxConnLifetime,
		"max_idle", cfg.MaxConnIdleTime,
		"slow_threshold", threshold,
	)
	return pool, nil
}

// slogQueryLogger adapts pgx tracelog.Logger to slog. We only surface slow
// queries — every-statement logging buries real signals.
type slogQueryLogger struct {
	threshold time.Duration
}

func (l slogQueryLogger) Log(ctx context.Context, level tracelog.LogLevel, msg string, data map[string]any) {
	if msg != "Query" && msg != "Exec" && msg != "BatchQuery" {
		return
	}
	d, _ := data["time"].(time.Duration)
	if d < l.threshold {
		return
	}
	sql, _ := data["sql"].(string)
	slog.Warn("db slow query",
		"op", msg,
		"duration", d,
		"sql", truncate(sql, 200),
	)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// Stat is a thin wrapper around pgxpool.Stat exposing just the fields
// metrics scrapers care about, so the import surface stays narrow.
type Stat struct {
	Acquired       int32
	Idle           int32
	Total          int32
	MaxConns       int32
	NewConnsCount  int64
	AcquireCount   int64
}

func Snapshot(p *pgxpool.Pool) Stat {
	s := p.Stat()
	return Stat{
		Acquired:      s.AcquiredConns(),
		Idle:          s.IdleConns(),
		Total:         s.TotalConns(),
		MaxConns:      s.MaxConns(),
		NewConnsCount: s.NewConnsCount(),
		AcquireCount:  s.AcquireCount(),
	}
}

