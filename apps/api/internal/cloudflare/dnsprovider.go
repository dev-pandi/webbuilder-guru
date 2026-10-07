package cloudflare

import (
	"context"
	"errors"
	"net"
	"strings"

	"github.com/webbuilder/api/internal/dnsprovider"
)

// Provider adapts *Client to dnsprovider.Provider. Lives in the cloudflare
// package (not dnsprovider) so the thin adapter can access unexported
// helpers like IsCloudflareDuplicateRecord.
type Provider struct {
	client *Client
}

func NewProvider(c *Client) *Provider { return &Provider{client: c} }

func (p *Provider) Kind() dnsprovider.Kind { return dnsprovider.KindCloudflare }

func (p *Provider) CreateZone(ctx context.Context, domain string) (*dnsprovider.Zone, error) {
	zone, err := p.client.CreateZone(ctx, domain)
	if err != nil {
		return nil, err
	}
	return &dnsprovider.Zone{ID: zone.ID, Nameservers: zone.NameServers}, nil
}

func (p *Provider) UpsertRecord(ctx context.Context, zoneID string, rec dnsprovider.Record) error {
	req := DNSRecordRequest{
		Type:    rec.Type,
		Name:    rec.Name,
		Content: rec.Content,
		TTL:     rec.TTL,
		Proxied: rec.Proxied,
	}
	if req.TTL == 0 {
		req.TTL = 1 // CF "auto"
	}
	_, err := p.client.CreateDNSRecord(ctx, zoneID, req)
	if err != nil && !IsCloudflareDuplicateRecord(err) {
		return err
	}
	return nil
}

// EnableProxy is a no-op for Cloudflare — proxied state is set per-record
// via UpsertRecord. Kept for interface symmetry with DNSCloud.
func (p *Provider) EnableProxy(ctx context.Context, zoneID, hostname string) error {
	return nil
}

// QueueVerify is a no-op for Cloudflare — there is no server-side
// verification queue. Delegation health is checked synchronously in
// CheckVerify via a direct NS lookup.
func (p *Provider) QueueVerify(ctx context.Context, zoneID string) error { return nil }

// CheckVerify performs an authoritative NS lookup and compares against the
// nameservers CF assigned at CreateZone time. assignedNS is passed in so we
// skip the round-trip to CF just to re-read what we already stored.
func (p *Provider) CheckVerify(ctx context.Context, zoneID, hostname string, assignedNS []string) (*dnsprovider.VerifyStatus, error) {
	res := &net.Resolver{PreferGo: true}
	nss, lookupErr := res.LookupNS(ctx, hostname)
	if lookupErr != nil {
		return &dnsprovider.VerifyStatus{
			Verified: false,
			Detail:   "Tidak bisa resolve nameserver domain. Pastikan domain aktif.",
		}, nil
	}
	resolved := make([]string, 0, len(nss))
	for _, ns := range nss {
		resolved = append(resolved, strings.TrimSuffix(ns.Host, "."))
	}
	if nsOverlap(resolved, assignedNS) {
		return &dnsprovider.VerifyStatus{Verified: true}, nil
	}
	return &dnsprovider.VerifyStatus{
		Verified: false,
		Detail: "Nameserver belum menunjuk ke kami. Resolved: " + strings.Join(resolved, ", ") +
			". Propagasi DNS bisa butuh sampai 48 jam.",
	}, nil
}

// DeleteZone wraps *Client.DeleteZone and swallows ErrZoneNotFound so the
// orphan reconciler treats "already gone" as success.
func (p *Provider) DeleteZone(ctx context.Context, zoneID string) error {
	if err := p.client.DeleteZone(ctx, zoneID); err != nil {
		if errors.Is(err, ErrZoneNotFound) {
			return nil
		}
		return err
	}
	return nil
}

func nsOverlap(got, want []string) bool {
	norm := func(s string) string {
		return strings.ToLower(strings.TrimSuffix(strings.TrimSpace(s), "."))
	}
	set := make(map[string]struct{}, len(want))
	for _, ns := range want {
		set[norm(ns)] = struct{}{}
	}
	for _, ns := range got {
		if _, ok := set[norm(ns)]; ok {
			return true
		}
	}
	return false
}
