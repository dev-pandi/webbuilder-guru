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
		// Normalize backend-specific "zone exists" variations → sentinel supaya
		// caller (tryAttachToDNS, BYO Connect) bisa pakai errors.Is tanpa
		// nge-couple ke CF error codes.
		if IsCloudflareDuplicateZone(err) {
			return nil, dnsprovider.ErrZoneAlreadyExists
		}
		return nil, err
	}
	return &dnsprovider.Zone{ID: zone.ID, Nameservers: zone.NameServers}, nil
}

// FindZoneByDomain wraps *Client.GetZoneByDomain. Returns (nil, nil) jika
// zone tidak ada — distinct dari error, biar caller bisa decide "memang
// baru" vs "lookup gagal".
func (p *Provider) FindZoneByDomain(ctx context.Context, domain string) (*dnsprovider.Zone, error) {
	zone, err := p.client.GetZoneByDomain(ctx, domain)
	if err != nil {
		if errors.Is(err, ErrZoneNotFound) {
			return nil, nil
		}
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

// DeleteRecord — list records di zone, filter by type+name, delete semua
// yang match. Idempotent (list kosong = no-op). CF API tidak expose
// delete-by-name-type langsung, jadi pattern list+filter+delete yang paling
// safe.
func (p *Provider) DeleteRecord(ctx context.Context, zoneID, recordType, name string) error {
	records, err := p.client.ListDNSRecords(ctx, zoneID)
	if err != nil {
		return err
	}
	// CF stores full FQDN di `Name` (e.g., "www.example.com"), tapi apex
	// stored as plain zone name. Normalize nama kita untuk match: "@" di
	// kita = exact zone name di CF. Simpler: match by suffix-match karena
	// kita selalu passing name relatif ("@" atau "www").
	for _, r := range records {
		if !strings.EqualFold(r.Type, recordType) {
			continue
		}
		// Match: "@" → nama = zone name (ends with no subdomain prefix);
		// otherwise name di awal full FQDN.
		match := false
		if name == "@" {
			// Apex: CF Name = zone name tanpa subdomain prefix.
			if r.ZoneName != "" && strings.EqualFold(r.Name, r.ZoneName) {
				match = true
			}
		} else {
			if r.ZoneName != "" && strings.EqualFold(r.Name, name+"."+r.ZoneName) {
				match = true
			}
		}
		if !match {
			continue
		}
		if dErr := p.client.DeleteDNSRecord(ctx, zoneID, r.ID); dErr != nil {
			return dErr
		}
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
