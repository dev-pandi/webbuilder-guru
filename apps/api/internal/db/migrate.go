package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver bridge for pgx
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate applies all pending Up migrations using goose v3.
// On first run after upgrading from the old custom migrator, it transparently
// imports the old schema_migrations rows into goose_db_version so existing DBs
// don't re-run already-applied migrations.
func Migrate(ctx context.Context, pool *pgxpool.Pool, databaseURL string) error {
	// Compatibility shim: if the legacy schema_migrations table exists and
	// goose_db_version doesn't, populate goose's table from it then drop the old one.
	if err := importLegacyMigrationState(ctx, pool); err != nil {
		return fmt.Errorf("migrate: legacy import: %w", err)
	}

	// goose uses database/sql. Open a separate connection (closed right after).
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("migrate: open sql: %w", err)
	}
	defer db.Close()

	goose.SetBaseFS(migrationsFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("migrate: dialect: %w", err)
	}
	goose.SetLogger(goose.NopLogger()) // silent; we surface our own log line below

	if err := goose.UpContext(ctx, db, "migrations"); err != nil {
		return fmt.Errorf("migrate: up: %w", err)
	}

	v, err := goose.GetDBVersionContext(ctx, db)
	if err == nil {
		fmt.Printf("[migrate] schema at version %d\n", v)
	}
	return nil
}

// importLegacyMigrationState bridges from the old internal/db custom migrator
// (table: schema_migrations) to goose (table: goose_db_version). Safe to call
// every startup — does nothing if the legacy table is missing or goose is already set up.
func importLegacyMigrationState(ctx context.Context, pool *pgxpool.Pool) error {
	var oldExists bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations')`,
	).Scan(&oldExists); err != nil {
		return err
	}
	if !oldExists {
		return nil
	}
	var gooseExists bool
	if err := pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goose_db_version')`,
	).Scan(&gooseExists); err != nil {
		return err
	}
	if gooseExists {
		return nil
	}

	// Create goose's tracking table.
	if _, err := pool.Exec(ctx, `
		CREATE TABLE goose_db_version (
			id          SERIAL PRIMARY KEY,
			version_id  BIGINT NOT NULL,
			is_applied  BOOLEAN NOT NULL,
			tstamp      TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
		)
	`); err != nil {
		return err
	}
	// goose's baseline row.
	if _, err := pool.Exec(ctx, `INSERT INTO goose_db_version (version_id, is_applied) VALUES (0, true)`); err != nil {
		return err
	}
	// Bring across each previously-applied version. version files are like "0001_init.sql"
	// so we extract the leading numeric prefix.
	if _, err := pool.Exec(ctx, `
		INSERT INTO goose_db_version (version_id, is_applied, tstamp)
		SELECT CAST(SUBSTRING(version FROM '^[0-9]+') AS BIGINT), true, applied_at
		FROM schema_migrations
	`); err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, `DROP TABLE schema_migrations`); err != nil {
		return err
	}
	fmt.Println("[migrate] imported legacy schema_migrations into goose_db_version")
	return nil
}
