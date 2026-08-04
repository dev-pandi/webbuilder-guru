package registrar

import (
	"context"
)

// Domain lookups — semua delegate ke api-registry via adapter methods
// (Phase 3 full self-sufficient; legacy HTTP path sudah dihapus).

// Whois — public lookup. Return (nil, nil) kalau domain not registered
// supaya caller distinguish "available" vs error.
func (c *Client) Whois(ctx context.Context, domain string) (*Whois, error) {
	return c.whoisViaAPIRegistry(ctx, domain)
}

// CheckDomain — availability check via api-registry (EPP under the hood).
// Response include AllowedZones + per-domain Available flag; price + zone
// flags TIDAK di-return (enrich upstream dari platform_prices / zones).
func (c *Client) CheckDomain(ctx context.Context, domain string) (*DomainCheckResponse, error) {
	return c.checkDomainViaAPIRegistry(ctx, domain)
}

// InfoDomain — EPP domain:info via api-registry. Dipakai post-register
// / post-renew untuk fetch expires_at + registrant contact handle supaya
// bisa di-cache di tabel `domains`.
func (c *Client) InfoDomain(ctx context.Context, domain string) (*DomainInfo, error) {
	return c.infoDomainViaAPIRegistry(ctx, domain)
}

// NameserverInfo — response shape untuk nameserver get/update.
type NameserverInfo struct {
	Domain      string   `json:"domain"`
	Nameservers []string `json:"nameservers"`
}

// GetNameservers — baca list NS current dari EPP via api-registry.
func (c *Client) GetNameservers(ctx context.Context, name string) (*NameserverInfo, error) {
	return c.getNameserversViaAPIRegistry(ctx, name)
}

// UpdateNameservers — replace-all NS via api-registry. Min 2, max 13.
func (c *Client) UpdateNameservers(ctx context.Context, name string, ns []string) (*NameserverInfo, error) {
	return c.updateNameserversViaAPIRegistry(ctx, name, ns)
}
