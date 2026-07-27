// Package cloudflare thin wrapper untuk Cloudflare API v4 + DB config storage.
// Web builder pakai Cloudflare untuk auto-attach domain baru → CDN + SSL + fast
// routing tanpa manual setup user. NS di-push balik ke registrar via existing
// registrar.Client.UpdateNameservers.
package cloudflare

import (
	"time"

	"github.com/google/uuid"
)

// Config = 1 baris cloudflare_configs. `IsDefault` menandai config yang
// otomatis dipakai saat auto-attach domain. Multi-config OK (mis. account
// terpisah per billing).
type Config struct {
	ID         uuid.UUID
	Name       string
	APIToken   string
	AccountID  string
	IsDefault  bool
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// CreateZoneResponse mirror shape response Cloudflare `POST /zones`.
// Field yang kita butuh: `Id` + `NameServers`. Sisanya di-drop.
//
// Cloudflare envelope: { "success": true, "result": { "id", "name_servers": [...] } }
type CreateZoneResponse struct {
	Success bool     `json:"success"`
	Errors  []Error  `json:"errors,omitempty"`
	Result  ZoneData `json:"result"`
}

type ZoneData struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Status      string   `json:"status"` // "pending" (waiting NS switch) → "active"
	NameServers []string `json:"name_servers"`
}

type Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// DNSRecordRequest = payload untuk POST /zones/:id/dns_records.
//
// `Proxied=true` (default kita) = traffic lewat Cloudflare edge → dapat SSL
// gratis + CDN caching + DDoS protection. `Proxied=false` = DNS-only (langsung
// resolve ke origin IP, no CDN). Untuk web builder pakai true supaya user
// dapat semua benefit CF tanpa config tambahan.
//
// TTL 1 = "auto" (Cloudflare pilih sendiri, biasanya 300s).
//
// Priority hanya berlaku untuk MX record — omitempty supaya tidak kirim
// field yang tidak relevan untuk type lain.
type DNSRecordRequest struct {
	Type     string `json:"type"`               // "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS" | "SRV" | "CAA"
	Name     string `json:"name"`               // "@" untuk root, "www", "*", "sub.foo", dst.
	Content  string `json:"content"`            // IP untuk A/AAAA, hostname untuk CNAME/MX/NS, text untuk TXT
	TTL      int    `json:"ttl"`                // 1 = auto, or seconds (60..86400)
	Proxied  bool   `json:"proxied"`            // hanya berlaku untuk A/AAAA/CNAME
	Priority *int   `json:"priority,omitempty"` // MX only
	Comment  string `json:"comment,omitempty"`  // optional note dari user (Cloudflare simpan max 100 char)
}

// DNSRecordResponse = envelope response (single record).
type DNSRecordResponse struct {
	Success bool          `json:"success"`
	Errors  []Error       `json:"errors,omitempty"`
	Result  DNSRecordData `json:"result"`
}

// DNSRecordListResponse = envelope response paginated list.
type DNSRecordListResponse struct {
	Success bool            `json:"success"`
	Errors  []Error         `json:"errors,omitempty"`
	Result  []DNSRecordData `json:"result"`
}

type DNSRecordData struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Proxied  bool   `json:"proxied"`
	Priority *int   `json:"priority,omitempty"`
	Comment  string `json:"comment,omitempty"`
	// ZoneName populated Cloudflare untuk convenience; kita passthrough.
	ZoneName   string `json:"zone_name,omitempty"`
	Proxiable  bool   `json:"proxiable,omitempty"` // true kalau type support proxy (A/AAAA/CNAME)
	ModifiedOn string `json:"modified_on,omitempty"`
}

// ZoneListResponse = envelope untuk GET /zones?name=...
type ZoneListResponse struct {
	Success bool       `json:"success"`
	Errors  []Error    `json:"errors,omitempty"`
	Result  []ZoneData `json:"result"`
}
