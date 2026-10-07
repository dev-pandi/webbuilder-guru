// Package dnsprovider defines the abstraction for DNS backends used by BYO
// and purchase flows. Lives in its own package to break the import cycle
// between consumers (site_byo_domains, domain_purchase) and backend adapters
// (cloudflare, dnscloud). Both sides import this package; neither imports
// the other.
package dnsprovider

import (
	"context"
	"errors"
)

// ErrZoneAlreadyExists signals that CreateZone found an existing zone with
// the same name owned by the same account. Callers (tryAttachToDNS, BYO
// Connect) should treat this as "retry-safe idempotent" — look up the
// existing zone via FindZoneByDomain and continue the flow.
//
// Adapters wrap backend-specific errors (CF code 1061, DNSCloud ZONE_EXISTS,
// etc.) into this sentinel so caller logic stays provider-agnostic.
var ErrZoneAlreadyExists = errors.New("dns provider: zone already exists")

// Kind identifies which DNS backend is behind a provider instance. Column
// `dns_provider` on site_byo_domains + registered_domains stores this value.
type Kind string

const (
	KindCloudflare Kind = "cloudflare"
	KindDNSCloud   Kind = "dnscloud"
)

// Zone is the backend-agnostic result of CreateZone.
type Zone struct {
	ID          string
	Nameservers []string
}

// Record is a generic DNS record upsert request. Backends that support edge
// proxying per-record (Cloudflare) honor Proxied directly; backends with a
// separate proxy toggle (DNSCloud) translate it into an EnableProxy call.
type Record struct {
	Type    string // A | AAAA | CNAME | MX | TXT | CAA | NS
	Name    string // "@" for apex, "www", "*", or "sub.foo"
	Content string
	TTL     int  // 0 = backend default
	Proxied bool
}

// VerifyStatus is the result of a delegation check. `Pending=true` means the
// backend is still checking asynchronously (DNSCloud queue-based model); the
// handler should ask the caller to retry shortly.
type VerifyStatus struct {
	Verified bool
	Pending  bool
	Detail   string // optional human-readable hint, surfaced in UI on failure
}

// Provider abstracts the operations BYO + purchase flows need. Each backend
// (cloudflare, dnscloud) ships one implementation.
//
// The interface is deliberately small — anything beyond zone/record/proxy/
// verify/delete belongs to backend-specific admin endpoints, not the hot
// BYO path.
type Provider interface {
	// Kind identifies the backend for logging + metrics.
	Kind() Kind

	// CreateZone registers the domain and returns the NS pair the user must
	// delegate to at their registrar. Returns ErrZoneAlreadyExists if a zone
	// with that name already exists in the account — caller should fall back
	// to FindZoneByDomain for idempotent retry.
	CreateZone(ctx context.Context, domain string) (*Zone, error)

	// FindZoneByDomain looks up an existing zone by its domain name. Used by
	// idempotent retry paths after CreateZone returned ErrZoneAlreadyExists.
	// Returns nil, nil if the zone truly doesn't exist (not an error).
	FindZoneByDomain(ctx context.Context, domain string) (*Zone, error)

	// UpsertRecord creates or replaces an RRset.
	UpsertRecord(ctx context.Context, zoneID string, rec Record) error

	// EnableProxy flips edge proxy on for a hostname. Backends that express
	// proxied state via UpsertRecord may return nil as a no-op.
	EnableProxy(ctx context.Context, zoneID, hostname string) error

	// QueueVerify asks an async-verifying backend (DNSCloud) to recheck NS
	// delegation. Sync backends (Cloudflare) return nil — the real check
	// happens in CheckVerify via a direct NS lookup.
	QueueVerify(ctx context.Context, zoneID string) error

	// CheckVerify reports current delegation state. `assignedNS` is passed in
	// so sync backends (Cloudflare) can compare against the NS they issued at
	// CreateZone time without a round-trip.
	CheckVerify(ctx context.Context, zoneID, hostname string, assignedNS []string) (*VerifyStatus, error)

	// DeleteZone removes the zone from the backend. Must be idempotent: a
	// zone that is already gone returns nil (not an error), so the orphan
	// reconciler can treat "already deleted" as success.
	DeleteZone(ctx context.Context, zoneID string) error
}

// Choice tells the factory how to resolve a provider. Exactly one of the
// modes applies per call.
type Choice struct {
	// StickyConfigID — set when the operation targets an existing BYO/
	// registered row. Factory MUST return the exact config that was used
	// originally; priority changes do NOT migrate existing zones.
	StickyConfigID string

	// Explicit — user chose a specific kind at Connect/Purchase. Factory
	// picks the highest-priority active config of that kind. Ignored if
	// StickyConfigID is set.
	Explicit Kind

	// If both fields are empty: factory picks the highest-priority active
	// config across all kinds.
}

// Factory resolves a Provider for a given operation and returns the backing
// config ID so the caller can persist it on the row for sticky future ops.
type Factory func(ctx context.Context, choice Choice) (p Provider, configID string, err error)
