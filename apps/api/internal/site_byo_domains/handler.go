package site_byo_domains

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/cloudflare"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/registrar"
	"github.com/webbuilder/api/internal/sites"
)

// WhoisClient is the slice of registrar.Client that handlers need. Interface
// kept small so tests can mock without pulling in HTTP.
type WhoisClient interface {
	Whois(ctx context.Context, domain string) (*registrar.Whois, error)
}

// CFClient is the subset of *cloudflare.Client that handlers call. Lets tests
// stub without a real HTTP CF account.
type CFClient interface {
	CreateZone(ctx context.Context, domain string) (*cloudflare.ZoneData, error)
	CreateDNSRecord(ctx context.Context, zoneID string, req cloudflare.DNSRecordRequest) (*cloudflare.DNSRecordData, error)
	DeleteZone(ctx context.Context, zoneID string) error
}

// CFClientFactory builds a Cloudflare client per request. In production, the
// factory reads cloudflare_configs (default row) and constructs
// *cloudflare.Client. Keeps config lookup out of the hot handler path.
type CFClientFactory func(ctx context.Context) (CFClient, error)

// NSLookup resolves nameservers for a hostname. Default implementation uses
// the system resolver (net.LookupNS). Swappable for tests, or to point at
// an authoritative .id resolver via miekg/dns later.
type NSLookup func(ctx context.Context, hostname string) ([]string, error)

// DefaultNSLookup uses Go's net.Resolver with PreferGo=true to bypass CGO
// resolver quirks on macOS. Returns bare host strings (trailing dots stripped).
func DefaultNSLookup(ctx context.Context, hostname string) ([]string, error) {
	res := &net.Resolver{PreferGo: true}
	nss, err := res.LookupNS(ctx, hostname)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(nss))
	for _, ns := range nss {
		out = append(out, strings.TrimSuffix(ns.Host, "."))
	}
	return out, nil
}

type HandlerDeps struct {
	Repo        *Repo
	Sites       *sites.Repo
	Purchases   *domain_purchase.Repo
	Registrar   WhoisClient
	CFFactory   CFClientFactory
	NSLookup    NSLookup
	PlatformIPs []string // used to populate the A record after verify
}

type Handler struct {
	repo      *Repo
	sites     *sites.Repo
	purchases *domain_purchase.Repo
	whois     WhoisClient
	cfFactory CFClientFactory
	nsLookup  NSLookup
	ips       []string
}

func NewHandler(d HandlerDeps) *Handler {
	nsFn := d.NSLookup
	if nsFn == nil {
		nsFn = DefaultNSLookup
	}
	return &Handler{
		repo:      d.Repo,
		sites:     d.Sites,
		purchases: d.Purchases,
		whois:     d.Registrar,
		cfFactory: d.CFFactory,
		nsLookup:  nsFn,
		ips:       d.PlatformIPs,
	}
}

// --- response shapes ---------------------------------------------------------

type checkResponse struct {
	Hostname string         `json:"hostname"`
	Valid    bool           `json:"valid"`
	Whois    *checkWhois    `json:"whois,omitempty"`
	Warnings []checkWarning `json:"warnings,omitempty"`
}

type checkWhois struct {
	Exists         bool      `json:"exists"`
	ExpiresAt      time.Time `json:"expires_at"`
	RegistrantName string    `json:"registrant_name,omitempty"`
}

type checkWarning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type connectResponse struct {
	DomainID         uuid.UUID `json:"domain_id"`
	Hostname         string    `json:"hostname"`
	Status           State     `json:"status"`
	AssignedNS       []string  `json:"assigned_ns"`
	CloudflareZoneID string    `json:"cloudflare_zone_id"`
	ExpiresAt        time.Time `json:"expires_at"`
}

type verifyResponse struct {
	DomainID   uuid.UUID `json:"domain_id"`
	Hostname   string    `json:"hostname"`
	Status     State     `json:"status"`
	VerifiedAt time.Time `json:"verified_at"`
}

// listDomainRow is one entry of the GET /sites/:id/domains payload. Covers
// both the purchased anchor and the BYO alias so the dashboard can render
// both with one request.
type listDomainRow struct {
	ID         *uuid.UUID `json:"id,omitempty"` // null for anchor (not a BYO row)
	Hostname   string     `json:"hostname"`
	Source     string     `json:"source"` // "purchased" | "byo"
	IsAnchor   bool       `json:"is_anchor"`
	IsPrimary  bool       `json:"is_primary"`
	Status     string     `json:"status"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	AssignedNS []string   `json:"assigned_ns,omitempty"`
}

// --- handlers ----------------------------------------------------------------

type hostnameReq struct {
	Hostname string `json:"hostname"`
}

// Check — POST /api/v1/sites/:id/byo-domain/check
// Pre-flight: validates hostname, WHOIS lookup, uniqueness. Does not mutate.
func (h *Handler) Check(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	uid := auth.UserIDFrom(c)
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	var req hostnameReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	host := NormalizeHostname(req.Hostname)
	if err := ValidateApexID(host); err != nil {
		return hostnameErrorResp(c, err)
	}

	// Uniqueness: not already BYO somewhere.
	if existing, _ := h.repo.GetByHostname(c.Context(), host); existing != nil {
		if existing.SiteID == siteID {
			return httpx.Err(c, fiber.StatusConflict, "already_connected_here",
				"Domain ini sudah terhubung ke situs ini.")
		}
		return httpx.Err(c, fiber.StatusConflict, "already_connected_elsewhere",
			"Domain ini sudah dihubungkan ke situs lain. Lepas dulu dari sana.")
	}
	// Uniqueness: not managed via Beli flow at the platform.
	if existing, _ := h.purchases.GetDomainByNameAdmin(c.Context(), host); existing != nil {
		return httpx.Err(c, fiber.StatusConflict, "managed_by_platform",
			"Domain ini terdaftar di platform. Pakai menu 'Beli Domain' untuk mengelolanya.")
	}

	// Site slot: at most 1 BYO per site.
	if existing, _ := h.repo.GetBySite(c.Context(), siteID); existing != nil {
		return httpx.Err(c, fiber.StatusConflict, "site_already_has_byo",
			"Situs ini sudah punya BYO domain ("+existing.Hostname+"). Lepas dulu yang lama.")
	}

	// WHOIS probe — authoritative expiry source for .id via api-registry.
	w, err := h.whois.Whois(c.Context(), host)
	if err != nil {
		slog.Warn("byo check: whois failed", "host", host, "error", err)
		return httpx.Err(c, fiber.StatusServiceUnavailable, "whois_unavailable",
			"Layanan WHOIS sedang tidak tersedia. Coba lagi beberapa menit lagi.")
	}
	if w == nil {
		return httpx.Err(c, fiber.StatusBadRequest, "domain_not_registered",
			"Domain .id ini tidak terdaftar di PANDI. Pastikan ejaannya benar.")
	}

	expiresAt, _ := time.Parse(time.RFC3339, w.ExpiresAt)
	now := time.Now()
	if !expiresAt.IsZero() && expiresAt.Before(now) {
		return httpx.Err(c, fiber.StatusBadRequest, "domain_expired",
			fmt.Sprintf("Domain Anda sudah expired sejak %s. Perpanjang di registrar sebelum menghubungkan.",
				expiresAt.Format("2 January 2006")))
	}

	resp := checkResponse{
		Hostname: host,
		Valid:    true,
		Whois: &checkWhois{
			Exists:         true,
			ExpiresAt:      expiresAt,
			RegistrantName: w.OwnerMasked,
		},
	}
	if !expiresAt.IsZero() {
		days := int(expiresAt.Sub(now) / (24 * time.Hour))
		if days >= 0 && days <= 30 {
			resp.Warnings = append(resp.Warnings, checkWarning{
				Code: "expiring_soon",
				Message: fmt.Sprintf("Domain akan expired dalam %d hari (%s). Perpanjang segera.",
					days, expiresAt.Format("2 January 2006")),
			})
		}
	}
	return httpx.OK(c, resp)
}

// Connect — POST /api/v1/sites/:id/byo-domain/connect
// Creates CF zone, persists pending row. Idempotent per (site_id, hostname).
func (h *Handler) Connect(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	uid := auth.UserIDFrom(c)
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	var req hostnameReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	host := NormalizeHostname(req.Hostname)
	if err := ValidateApexID(host); err != nil {
		return hostnameErrorResp(c, err)
	}

	// Idempotency: same hostname + site = return existing row (user clicked
	// Connect twice from the modal). Different site = conflict.
	if existing, _ := h.repo.GetByHostname(c.Context(), host); existing != nil {
		if existing.SiteID != siteID {
			return httpx.Err(c, fiber.StatusConflict, "already_connected_elsewhere",
				"Domain ini sudah dihubungkan ke situs lain.")
		}
		return httpx.OK(c, connectRespFromRow(existing))
	}
	if existing, _ := h.repo.GetBySite(c.Context(), siteID); existing != nil {
		return httpx.Err(c, fiber.StatusConflict, "site_already_has_byo",
			"Situs ini sudah punya BYO domain. Lepas dulu yang lama.")
	}
	if existing, _ := h.purchases.GetDomainByNameAdmin(c.Context(), host); existing != nil {
		return httpx.Err(c, fiber.StatusConflict, "managed_by_platform",
			"Domain ini terdaftar di platform. Pakai menu 'Beli Domain'.")
	}

	w, err := h.whois.Whois(c.Context(), host)
	if err != nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "whois_unavailable",
			"Layanan WHOIS sedang tidak tersedia. Coba lagi beberapa menit lagi.")
	}
	if w == nil {
		return httpx.Err(c, fiber.StatusBadRequest, "domain_not_registered",
			"Domain .id ini tidak terdaftar di PANDI.")
	}
	expiresAt, _ := time.Parse(time.RFC3339, w.ExpiresAt)
	if !expiresAt.IsZero() && expiresAt.Before(time.Now()) {
		return httpx.Err(c, fiber.StatusBadRequest, "domain_expired",
			"Domain Anda sudah expired. Perpanjang di registrar sebelum menghubungkan.")
	}

	cf, err := h.cfFactory(c.Context())
	if err != nil {
		slog.Error("byo connect: cf factory failed", "error", err)
		return httpx.Err(c, fiber.StatusServiceUnavailable, "cloudflare_unavailable",
			"Konfigurasi Cloudflare belum siap. Hubungi admin.")
	}
	zone, err := cf.CreateZone(c.Context(), host)
	if err != nil {
		slog.Error("byo connect: cf create zone failed", "host", host, "error", err)
		return httpx.Err(c, fiber.StatusBadGateway, "cloudflare_create_zone_failed",
			"Gagal membuat zone Cloudflare: "+shorten(err.Error()))
	}

	var expPtr *time.Time
	if !expiresAt.IsZero() {
		expPtr = &expiresAt
	}
	row, err := h.repo.Create(c.Context(), CreateInput{
		SiteID:           siteID,
		UserID:           uid,
		Hostname:         host,
		CloudflareZoneID: zone.ID,
		AssignedNS:       zone.NameServers,
		ExpiresAt:        expPtr,
	})
	if err != nil {
		// Rollback: delete the CF zone so we don't leak orphans on race.
		if dErr := cf.DeleteZone(c.Context(), zone.ID); dErr != nil && !errors.Is(dErr, cloudflare.ErrZoneNotFound) {
			slog.Warn("byo connect: rollback cf delete failed", "zone_id", zone.ID, "error", dErr)
		}
		switch {
		case errors.Is(err, ErrHostnameTaken):
			return httpx.Err(c, fiber.StatusConflict, "already_connected_elsewhere",
				"Domain ini baru saja dihubungkan ke situs lain. Refresh.")
		case errors.Is(err, ErrSiteSlotTaken):
			return httpx.Err(c, fiber.StatusConflict, "site_already_has_byo",
				"Situs ini sudah punya BYO domain.")
		default:
			slog.Error("byo connect: db insert failed", "error", err)
			return httpx.Internal(c, "create failed")
		}
	}
	return httpx.Created(c, connectRespFromRow(row))
}

// Verify — POST /api/v1/sites/:id/byo-domain/verify
// NS lookup → compare to assigned_ns → flip verified + populate A record.
func (h *Handler) Verify(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	uid := auth.UserIDFrom(c)
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}

	row, err := h.repo.GetBySite(c.Context(), siteID)
	if err != nil {
		return httpx.NotFound(c, "byo domain not found")
	}
	if row.Status != StatePending {
		return httpx.Err(c, fiber.StatusConflict, "already_verified",
			"BYO domain sudah dalam status "+string(row.Status)+".")
	}

	resolved, err := h.nsLookup(c.Context(), row.Hostname)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadRequest, "ns_lookup_failed",
			"Tidak bisa resolve nameserver domain. Pastikan domain aktif.")
	}
	if !NSOverlap(resolved, row.AssignedNS) {
		return httpx.Err(c, fiber.StatusBadRequest, "ns_mismatch",
			"Nameserver belum menunjuk ke kami. Resolved: "+strings.Join(resolved, ", ")+
				". Propagasi DNS bisa butuh sampai 48 jam.")
	}

	// Populate A record so the site serves immediately. Proxied so CF edge
	// handles TLS + CDN; origin only sees CF IPs. SSL mode is set zone-wide
	// to full_strict by the CF factory (or admin), not per-record.
	if len(h.ips) == 0 {
		slog.Error("byo verify: platform_ips not configured")
		return httpx.Internal(c, "platform ips not configured")
	}
	cf, err := h.cfFactory(c.Context())
	if err != nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "cloudflare_unavailable",
			"Konfigurasi Cloudflare belum siap.")
	}
	if _, err := cf.CreateDNSRecord(c.Context(), row.CloudflareZoneID, cloudflare.DNSRecordRequest{
		Type: "A", Name: "@", Content: h.ips[0], TTL: 1, Proxied: true,
		Comment: "web builder apex",
	}); err != nil {
		slog.Error("byo verify: cf create A failed", "host", row.Hostname, "error", err)
		return httpx.Err(c, fiber.StatusBadGateway, "cloudflare_dns_failed",
			"Gagal setup A record di Cloudflare: "+shorten(err.Error()))
	}

	if err := h.repo.MarkVerified(c.Context(), row.ID); err != nil {
		return httpx.Internal(c, "mark verified failed")
	}
	// Refetch to grab verified_at from DB (now()).
	fresh, err := h.repo.GetByID(c.Context(), row.ID)
	if err != nil {
		return httpx.Internal(c, "refetch failed")
	}
	resp := verifyResponse{
		DomainID: fresh.ID,
		Hostname: fresh.Hostname,
		Status:   fresh.Status,
	}
	if fresh.VerifiedAt != nil {
		resp.VerifiedAt = *fresh.VerifiedAt
	}
	return httpx.OK(c, resp)
}

// Delete — DELETE /api/v1/sites/:id/byo-domain
// Hard-delete BYO row + CF zone. If primary points at BYO, revert to anchor.
func (h *Handler) Delete(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	uid := auth.UserIDFrom(c)
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	row, err := h.repo.GetBySite(c.Context(), siteID)
	if err != nil {
		return httpx.NotFound(c, "byo domain not found")
	}

	// If BYO is primary, clear it — fallback to anchor via NULL.
	primary, err := h.sites.GetPrimaryHostname(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "primary lookup failed")
	}
	if primary == row.Hostname {
		if err := h.sites.SetPrimaryHostname(c.Context(), siteID, uid, ""); err != nil {
			return httpx.Internal(c, "clear primary failed")
		}
	}

	// Best-effort CF delete — row delete still proceeds if CF is down. The
	// orphan reconciler (step 5) will mop up stray zones later.
	if row.CloudflareZoneID != "" {
		cf, cfErr := h.cfFactory(c.Context())
		if cfErr == nil {
			if dErr := cf.DeleteZone(c.Context(), row.CloudflareZoneID); dErr != nil && !errors.Is(dErr, cloudflare.ErrZoneNotFound) {
				slog.Warn("byo delete: cf delete failed", "zone_id", row.CloudflareZoneID, "error", dErr)
			}
		}
	}

	if err := h.repo.Delete(c.Context(), row.ID); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

type setPrimaryReq struct {
	Hostname string `json:"hostname"`
}

// SetPrimary — POST /api/v1/sites/:id/domains/primary
// Resolves hostname to either anchor or BYO; writes sites.primary_hostname.
func (h *Handler) SetPrimary(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	uid := auth.UserIDFrom(c)
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}
	var req setPrimaryReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	host := NormalizeHostname(req.Hostname)
	if host == "" {
		return httpx.BadRequest(c, "hostname required")
	}

	anchor, _ := h.purchases.GetDomainBySite(c.Context(), siteID)
	byo, _ := h.repo.GetBySite(c.Context(), siteID)

	switch {
	case anchor != nil && anchor.Name == host:
		// Promoting anchor = clear primary_hostname (NULL = anchor fallback).
		if err := h.sites.SetPrimaryHostname(c.Context(), siteID, uid, ""); err != nil {
			return httpx.Internal(c, "set primary failed")
		}
	case byo != nil && byo.Hostname == host:
		if err := CanSetPrimary(byo.ToMachineRow(false)); err != nil {
			return httpx.Err(c, fiber.StatusBadRequest, "byo_not_verified",
				"BYO domain belum verified. Verifikasi dulu sebelum dijadikan primary.")
		}
		if err := h.sites.SetPrimaryHostname(c.Context(), siteID, uid, host); err != nil {
			return httpx.Internal(c, "set primary failed")
		}
	default:
		return httpx.NotFound(c, "hostname bukan domain situs ini")
	}
	return httpx.OK(c, fiber.Map{"primary_hostname": host})
}

// List — GET /api/v1/sites/:id/domains
// Combined view: anchor + BYO (if any), with is_primary resolved.
func (h *Handler) List(c *fiber.Ctx) error {
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	uid := auth.UserIDFrom(c)
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}

	primary, err := h.sites.GetPrimaryHostname(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "primary lookup failed")
	}
	anchor, _ := h.purchases.GetDomainBySite(c.Context(), siteID)
	byo, _ := h.repo.GetBySite(c.Context(), siteID)

	// Resolve primary: explicit value if set, else fall back to anchor hostname.
	resolvedPrimary := primary
	if resolvedPrimary == "" && anchor != nil {
		resolvedPrimary = anchor.Name
	}

	out := []listDomainRow{}
	if anchor != nil {
		out = append(out, listDomainRow{
			Hostname:  anchor.Name,
			Source:    "purchased",
			IsAnchor:  true,
			IsPrimary: resolvedPrimary == anchor.Name,
			Status:    anchor.Status,
			ExpiresAt: anchor.ExpiresAt,
		})
	}
	if byo != nil {
		out = append(out, listDomainRow{
			ID:         &byo.ID,
			Hostname:   byo.Hostname,
			Source:     "byo",
			IsAnchor:   false,
			IsPrimary:  resolvedPrimary == byo.Hostname,
			Status:     string(byo.Status),
			ExpiresAt:  byo.ExpiresAt,
			AssignedNS: byo.AssignedNS,
		})
	}
	// Primary first for UI ordering.
	if len(out) == 2 && !out[0].IsPrimary {
		out[0], out[1] = out[1], out[0]
	}
	return httpx.OK(c, out)
}

// --- helpers -----------------------------------------------------------------

func hostnameErrorResp(c *fiber.Ctx, err error) error {
	switch err {
	case ErrHostnameEmpty, ErrHostnameFormat, ErrHostnameTooLong:
		return httpx.Err(c, fiber.StatusBadRequest, "invalid_hostname",
			"Format hostname tidak valid.")
	case ErrNotID:
		return httpx.Err(c, fiber.StatusBadRequest, "tld_not_supported",
			"Saat ini hanya domain .id yang bisa dihubungkan.")
	case ErrSubdomainNotAllowed:
		return httpx.Err(c, fiber.StatusBadRequest, "subdomain_not_allowed",
			"Hanya domain utama (apex) yang bisa dihubungkan, bukan subdomain.")
	}
	return httpx.BadRequest(c, "invalid hostname")
}

func connectRespFromRow(r *DBRow) connectResponse {
	resp := connectResponse{
		DomainID:         r.ID,
		Hostname:         r.Hostname,
		Status:           r.Status,
		AssignedNS:       r.AssignedNS,
		CloudflareZoneID: r.CloudflareZoneID,
	}
	if r.ExpiresAt != nil {
		resp.ExpiresAt = *r.ExpiresAt
	}
	return resp
}

func shorten(s string) string {
	const max = 200
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}
