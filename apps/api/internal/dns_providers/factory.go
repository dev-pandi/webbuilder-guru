package dns_providers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/cloudflare"
	"github.com/webbuilder/api/internal/dnscloud"
	"github.com/webbuilder/api/internal/dnsprovider"
)

// ConfigReader is the slice of *Repo that Factory needs. Extracting lets
// tests mock resolution without touching Postgres.
type ConfigReader interface {
	GetByID(ctx context.Context, id uuid.UUID) (*Config, error)
	GetHighestPriorityForKind(ctx context.Context, kind string) (*Config, error)
	GetHighestPriority(ctx context.Context) (*Config, error)
}

// Factory resolves a dnsprovider.Provider based on priority ordering + sticky
// per-row config + optional user override. Implements dnsprovider.Factory.
//
// Resolution rules (ONE applies per call):
//
//  1. Sticky — StickyConfigID set: load that exact config.
//     Fail if config is missing OR inactive. We NEVER silently fall back,
//     because lifecycle ops on an existing row must go to the same backend
//     that owns the zone. Priority changes do not migrate zones.
//
//  2. Explicit kind — Explicit = "cloudflare" | "dnscloud": pick the
//     highest-priority ACTIVE config of that kind.
//
//  3. Default — both empty: pick the highest-priority active config overall.
//
// Return value includes the config ID so callers can persist it on the new
// row (makes future ops sticky without extra lookups).
type Factory struct {
	repo ConfigReader
}

// NewFactory wires a real *Repo. Tests use NewFactoryWithReader.
func NewFactory(r *Repo) *Factory { return &Factory{repo: r} }

// NewFactoryWithReader lets tests inject a mock ConfigReader.
func NewFactoryWithReader(r ConfigReader) *Factory { return &Factory{repo: r} }

// AsFactoryFn returns a dnsprovider.Factory bound to this instance. Handy
// for packages that only want the function signature.
func (f *Factory) AsFactoryFn() dnsprovider.Factory {
	return func(ctx context.Context, choice dnsprovider.Choice) (dnsprovider.Provider, string, error) {
		return f.Resolve(ctx, choice)
	}
}

var (
	ErrNoProviderAvailable  = errors.New("no active DNS provider configured")
	ErrStickyConfigInactive = errors.New("sticky config exists but is inactive")
	ErrUnknownKind          = errors.New("unknown provider kind")
)

// Resolve picks the right config + builds the backing provider.
func (f *Factory) Resolve(ctx context.Context, choice dnsprovider.Choice) (dnsprovider.Provider, string, error) {
	cfg, err := f.resolveConfig(ctx, choice)
	if err != nil {
		return nil, "", err
	}
	prov, err := buildProvider(*cfg)
	if err != nil {
		return nil, "", err
	}
	return prov, cfg.ID.String(), nil
}

// resolveConfig picks the Config row to use (does NOT build the provider).
// Separated so admin "test connection" can reuse the resolution without
// instantiating the provider.
func (f *Factory) resolveConfig(ctx context.Context, choice dnsprovider.Choice) (*Config, error) {
	// Rule 1: sticky
	if choice.StickyConfigID != "" {
		id, err := uuid.Parse(choice.StickyConfigID)
		if err != nil {
			return nil, fmt.Errorf("invalid sticky config id: %w", err)
		}
		cfg, err := f.repo.GetByID(ctx, id)
		if err != nil {
			return nil, err
		}
		if !cfg.IsActive {
			slog.Warn("dns factory: sticky config inactive",
				"config_id", cfg.ID, "kind", cfg.Kind, "name", cfg.Name)
			return nil, ErrStickyConfigInactive
		}
		return cfg, nil
	}

	// Rule 2: explicit kind
	if choice.Explicit != "" {
		cfg, err := f.repo.GetHighestPriorityForKind(ctx, string(choice.Explicit))
		if err != nil {
			if errors.Is(err, ErrNotFound) {
				return nil, ErrNoProviderAvailable
			}
			return nil, err
		}
		return cfg, nil
	}

	// Rule 3: default — overall highest priority
	cfg, err := f.repo.GetHighestPriority(ctx)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNoProviderAvailable
		}
		return nil, err
	}
	return cfg, nil
}

// buildProvider instantiates the backend adapter from a Config row.
// Unknown kinds return ErrUnknownKind — safety net for a corrupted row that
// slipped past the CHECK constraint.
func buildProvider(cfg Config) (dnsprovider.Provider, error) {
	switch cfg.Kind {
	case KindCloudflare:
		cfClient := cloudflare.NewClient(cloudflare.Config{
			ID:        cfg.ID,
			Name:      cfg.Name,
			APIToken:  cfg.APIToken,
			AccountID: cfg.AccountID,
			IsDefault: cfg.IsDefault,
			CreatedAt: cfg.CreatedAt,
			UpdatedAt: cfg.UpdatedAt,
		})
		return cloudflare.NewProvider(cfClient), nil
	case KindDNSCloud:
		dcClient := dnscloud.NewClient(dnscloud.Config{
			APIToken: cfg.APIToken,
		})
		return dnscloud.NewProvider(dcClient), nil
	}
	return nil, ErrUnknownKind
}

// BuildProviderForConfig is the exported form of buildProvider — used by
// admin test-connection handler (Step 12) which already has the Config row.
func BuildProviderForConfig(cfg Config) (dnsprovider.Provider, error) {
	return buildProvider(cfg)
}
