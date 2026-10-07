package dns_providers

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/dnsprovider"
)

// mockReader is a minimal in-memory implementation of ConfigReader so factory
// resolution rules can be tested without a Postgres connection.
type mockReader struct {
	byID             map[uuid.UUID]*Config
	highestPerKind   map[string]*Config
	highestOverall   *Config
	getByIDErr       error
	highestForKindFn func(kind string) (*Config, error) // optional override
}

func (m *mockReader) GetByID(ctx context.Context, id uuid.UUID) (*Config, error) {
	if m.getByIDErr != nil {
		return nil, m.getByIDErr
	}
	if c, ok := m.byID[id]; ok {
		return c, nil
	}
	return nil, ErrNotFound
}

func (m *mockReader) GetHighestPriorityForKind(ctx context.Context, kind string) (*Config, error) {
	if m.highestForKindFn != nil {
		return m.highestForKindFn(kind)
	}
	if c, ok := m.highestPerKind[kind]; ok {
		return c, nil
	}
	return nil, ErrNotFound
}

func (m *mockReader) GetHighestPriority(ctx context.Context) (*Config, error) {
	if m.highestOverall == nil {
		return nil, ErrNotFound
	}
	return m.highestOverall, nil
}

// --- Resolution rule 1: sticky ----------------------------------------------

func TestFactory_Sticky_LoadsExactConfig(t *testing.T) {
	id := uuid.New()
	cfg := &Config{ID: id, Kind: KindCloudflare, Name: "CF-1", APIToken: "k", AccountID: "a", IsActive: true, Priority: 50}
	f := NewFactoryWithReader(&mockReader{byID: map[uuid.UUID]*Config{id: cfg}})

	prov, configID, err := f.Resolve(context.Background(), dnsprovider.Choice{
		StickyConfigID: id.String(),
	})
	if err != nil {
		t.Fatalf("Resolve err: %v", err)
	}
	if prov.Kind() != dnsprovider.KindCloudflare {
		t.Errorf("provider.Kind() = %v, want cloudflare", prov.Kind())
	}
	if configID != id.String() {
		t.Errorf("configID = %q, want %q", configID, id.String())
	}
}

func TestFactory_Sticky_RejectsInactive(t *testing.T) {
	id := uuid.New()
	cfg := &Config{ID: id, Kind: KindCloudflare, Name: "CF-1", APIToken: "k", IsActive: false}
	f := NewFactoryWithReader(&mockReader{byID: map[uuid.UUID]*Config{id: cfg}})

	_, _, err := f.Resolve(context.Background(), dnsprovider.Choice{
		StickyConfigID: id.String(),
	})
	if !errors.Is(err, ErrStickyConfigInactive) {
		t.Errorf("want ErrStickyConfigInactive, got %v", err)
	}
}

func TestFactory_Sticky_NotFound(t *testing.T) {
	f := NewFactoryWithReader(&mockReader{byID: map[uuid.UUID]*Config{}})
	id := uuid.New()
	_, _, err := f.Resolve(context.Background(), dnsprovider.Choice{
		StickyConfigID: id.String(),
	})
	if err == nil {
		t.Fatal("want error for missing sticky id")
	}
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

func TestFactory_Sticky_InvalidUUID(t *testing.T) {
	f := NewFactoryWithReader(&mockReader{})
	_, _, err := f.Resolve(context.Background(), dnsprovider.Choice{
		StickyConfigID: "not-a-uuid",
	})
	if err == nil {
		t.Fatal("want error for invalid uuid")
	}
}

// --- Resolution rule 2: explicit kind ---------------------------------------

func TestFactory_ExplicitKind_PicksMatching(t *testing.T) {
	cfCfg := &Config{ID: uuid.New(), Kind: KindCloudflare, APIToken: "cf", AccountID: "a", IsActive: true, Priority: 1}
	dcCfg := &Config{ID: uuid.New(), Kind: KindDNSCloud, APIToken: "dcid_x", IsActive: true, Priority: 2}
	f := NewFactoryWithReader(&mockReader{
		highestPerKind: map[string]*Config{
			KindCloudflare: cfCfg,
			KindDNSCloud:   dcCfg,
		},
	})

	// Explicit "dnscloud" even though CF has higher priority → DNSCloud wins.
	prov, configID, err := f.Resolve(context.Background(), dnsprovider.Choice{
		Explicit: dnsprovider.KindDNSCloud,
	})
	if err != nil {
		t.Fatalf("Resolve err: %v", err)
	}
	if prov.Kind() != dnsprovider.KindDNSCloud {
		t.Errorf("Explicit=dnscloud returned %v", prov.Kind())
	}
	if configID != dcCfg.ID.String() {
		t.Errorf("configID = %q, want DNSCloud id %q", configID, dcCfg.ID)
	}
}

func TestFactory_ExplicitKind_NoActiveMatch(t *testing.T) {
	f := NewFactoryWithReader(&mockReader{
		highestForKindFn: func(kind string) (*Config, error) { return nil, ErrNotFound },
	})
	_, _, err := f.Resolve(context.Background(), dnsprovider.Choice{
		Explicit: dnsprovider.KindDNSCloud,
	})
	if !errors.Is(err, ErrNoProviderAvailable) {
		t.Errorf("want ErrNoProviderAvailable, got %v", err)
	}
}

// --- Resolution rule 3: default --------------------------------------------

func TestFactory_Default_PicksOverallHighestPriority(t *testing.T) {
	best := &Config{ID: uuid.New(), Kind: KindDNSCloud, APIToken: "x", IsActive: true, Priority: 1}
	f := NewFactoryWithReader(&mockReader{highestOverall: best})

	prov, configID, err := f.Resolve(context.Background(), dnsprovider.Choice{})
	if err != nil {
		t.Fatalf("Resolve err: %v", err)
	}
	if prov.Kind() != dnsprovider.KindDNSCloud {
		t.Errorf("default should return highest-priority config kind, got %v", prov.Kind())
	}
	if configID != best.ID.String() {
		t.Errorf("configID mismatch: %q vs %q", configID, best.ID)
	}
}

func TestFactory_Default_NoProviderConfigured(t *testing.T) {
	f := NewFactoryWithReader(&mockReader{})
	_, _, err := f.Resolve(context.Background(), dnsprovider.Choice{})
	if !errors.Is(err, ErrNoProviderAvailable) {
		t.Errorf("want ErrNoProviderAvailable, got %v", err)
	}
}

// --- Priority ordering: StickyConfigID takes precedence over Explicit -------

func TestFactory_StickyWinsOverExplicit(t *testing.T) {
	id := uuid.New()
	stickyCfg := &Config{ID: id, Kind: KindDNSCloud, APIToken: "x", IsActive: true}
	cfCfg := &Config{ID: uuid.New(), Kind: KindCloudflare, APIToken: "cf", AccountID: "a", IsActive: true, Priority: 1}
	f := NewFactoryWithReader(&mockReader{
		byID:           map[uuid.UUID]*Config{id: stickyCfg},
		highestPerKind: map[string]*Config{KindCloudflare: cfCfg},
	})

	// Both set → sticky wins (DNSCloud picked despite Explicit=cloudflare)
	prov, _, err := f.Resolve(context.Background(), dnsprovider.Choice{
		StickyConfigID: id.String(),
		Explicit:       dnsprovider.KindCloudflare,
	})
	if err != nil {
		t.Fatalf("Resolve err: %v", err)
	}
	if prov.Kind() != dnsprovider.KindDNSCloud {
		t.Errorf("Sticky should win over Explicit; got %v", prov.Kind())
	}
}

// --- buildProvider type dispatch --------------------------------------------

func TestBuildProvider_UnknownKind(t *testing.T) {
	_, err := BuildProviderForConfig(Config{Kind: "unknown"})
	if !errors.Is(err, ErrUnknownKind) {
		t.Errorf("want ErrUnknownKind, got %v", err)
	}
}

func TestBuildProvider_CloudflareAndDNSCloud(t *testing.T) {
	cf, err := BuildProviderForConfig(Config{Kind: KindCloudflare, APIToken: "x", AccountID: "a"})
	if err != nil {
		t.Fatalf("CF build err: %v", err)
	}
	if cf.Kind() != dnsprovider.KindCloudflare {
		t.Errorf("CF kind = %v", cf.Kind())
	}

	dc, err := BuildProviderForConfig(Config{Kind: KindDNSCloud, APIToken: "x"})
	if err != nil {
		t.Fatalf("DNSCloud build err: %v", err)
	}
	if dc.Kind() != dnsprovider.KindDNSCloud {
		t.Errorf("DNSCloud kind = %v", dc.Kind())
	}
}

// --- AsFactoryFn delegates to Resolve ---------------------------------------

func TestFactory_AsFactoryFn_Shape(t *testing.T) {
	best := &Config{ID: uuid.New(), Kind: KindCloudflare, APIToken: "x", AccountID: "a", IsActive: true, Priority: 1}
	f := NewFactoryWithReader(&mockReader{highestOverall: best})
	fn := f.AsFactoryFn()

	prov, cid, err := fn(context.Background(), dnsprovider.Choice{})
	if err != nil {
		t.Fatalf("AsFactoryFn result err: %v", err)
	}
	if prov == nil {
		t.Fatal("provider nil")
	}
	if cid != best.ID.String() {
		t.Errorf("configID mismatch: %q", cid)
	}
}
