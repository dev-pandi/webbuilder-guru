package domain_purchase

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"io"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/audit"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/cloudflare"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/invoices"
	"github.com/webbuilder/api/internal/metrics"
	"github.com/webbuilder/api/internal/registrar"
	"github.com/webbuilder/api/internal/sites"
	"github.com/webbuilder/api/internal/zones"
)


// AssignmentChecker — dependency untuk on-behalf-of verify. Interface, bukan
// concrete import ke reseller package, untuk cegah import cycle (reseller
// nanti mungkin butuh Purchase repo juga).
type AssignmentChecker interface {
	// HasActiveAssignment return nil kalau managerID mengelola clientID.
	// Return error non-nil kalau tidak ada assignment / sudah revoked.
	HasActiveAssignment(ctx context.Context, managerID, clientID uuid.UUID) error
	// ListManagedClientIDs — client IDs yang di-manage langsung oleh managerID.
	// Dipakai team invoice fan-out (aggregate self + client invoices di
	// portal reseller/agent).
	ListManagedClientIDs(ctx context.Context, managerID uuid.UUID) ([]uuid.UUID, error)
}

// Handler untuk domain purchase flow (2-phase self-sufficient).
//
// User-facing endpoints (JWT):
//   POST /api/v1/domains/check                    — availability + harga
//   POST /api/v1/domains/purchase                 — trigger register via api-registry
//   POST /api/v1/domains/:name/renew              — trigger renew via api-registry
//   GET  /api/v1/domains/purchases/:job_id        — poll job status
//   GET  /api/v1/domains/purchases                — list milik user
//   POST /api/v1/domains/purchases/:job_id/attach — link ke site_id existing
//   POST /api/v1/domains/purchases/:job_id/retry  — re-run EPP CREATE untuk failed job
type Handler struct {
	repo          *Repo
	registrar     *registrar.Client
	users         *auth.Repo
	sites         *sites.Repo      // dipakai Attach untuk verify site ownership
	cloudflare    *cloudflare.Repo // nil = auto-attach ke Cloudflare skipped
	platformIPs   []string         // dipakai jadi content A record CF auto-attach
	assignments   AssignmentChecker // nil = on-behalf-of disabled (Phase 3)
	audit         *audit.Repo       // nil = audit disabled
	zonesRepo     *zones.Repo       // nil = trust upstream AllowedZones (legacy)

	// --- 2-phase self-sufficient dependencies (Purchase flow) ---
	// Semua nil-safe: kalau salah satu belum di-wire, Purchase endpoint
	// return 503 dengan pesan jelas mana yang missing.
	pricingRepo PricingLookup     // fetch retail price per TLD
	invoicesSvc InvoiceCreator    // create invoice + apply PPN
	gwRegistry  GatewayRegistry   // resolve payment gateway by code
	promos      PromoValidator    // validate + redeem promo (nil = feature off)
}

// PricingLookup — abstraksi minimal: dapatkan retail price per TLD.
// Diimplementasikan oleh pricing.Repo (via adapter di main.go).
type PricingLookup interface {
	GetPlatformPrice(ctx context.Context, tld string) (retailRegister int64, retailRenew int64, err error)
}

// InvoiceCreator — abstraksi minimal: buat invoice untuk register/renew.
// Diimplementasikan oleh invoices.Service (+ Repo via adapter).
type InvoiceCreator interface {
	CreateForRegister(ctx context.Context, in InvoiceCreateInput) (invoiceID uuid.UUID, total int64, dueAt time.Time, err error)
	SavePaymentRef(ctx context.Context, id uuid.UUID, providerRef string) error
	// MarkPaid — untuk sync gateway (wallet) — bypass webhook, langsung
	// tandai paid.
	MarkPaid(ctx context.Context, id uuid.UUID, paidAt time.Time, providerRef string) error
	// GetInvoiceForCallback — fetch invoice + lines untuk pass ke
	// ExecuteAfterPayment callback (butuh metadata untuk parse kind/domain/years).
	GetInvoiceForCallback(ctx context.Context, id uuid.UUID) (*invoices.Invoice, error)
}

// InvoiceCreateInput — subset yang Purchase butuh; abstract dari
// invoices.CreateForRegisterInput supaya package tidak import cycle.
type InvoiceCreateInput struct {
	UserID        uuid.UUID
	PurchasedBy   *uuid.UUID // nil = self-purchase; set kalau reseller/agent beli untuk klien
	Domain        string
	Years         int
	UnitPrice     int64
	PaymentMethod string
	Kind          string // "register" | "renew"
	JobID         string
	// Promo — opsional. Kalau di-apply, subtotal invoice berkurang. Code
	// disimpan di metadata untuk audit; discount di-line item.
	PromoCode     string
	PromoDiscount int64
}

// GatewayRegistry — abstraksi resolve gateway.
type GatewayRegistry interface {
	Get(ctx context.Context, code string) (PaymentGateway, error)
}

// PaymentGateway — subset dari paymentgw.Gateway yang Purchase pakai.
type PaymentGateway interface {
	Code() string
	Type() string // "gateway" | "manual" | "wallet" — dipakai handler untuk
	              // dispatch flow (sync wallet vs async webhook).
	CreateCharge(ctx context.Context, req GatewayChargeRequest) (paymentURL string, providerRefID string, err error)
}

// GatewayChargeRequest — subset dari paymentgw.ChargeRequest. Include UserID
// supaya WalletGateway tahu user mana yang di-debit.
type GatewayChargeRequest struct {
	OrderID     string
	UserID      string
	Amount      int64
	Description string
	CustomerName, CustomerEmail, CustomerPhone string
	ReturnURL   string
	NotifURL    string
	ExpiresAt   time.Time
}

// PromoValidator — abstraksi validate + redeem promo. Nil = promo feature
// disabled (code apapun akan di-abaikan). Diimplementasi oleh
// promos.Service via adapter di main.go.
type PromoValidator interface {
	// Validate — cek constraint promo terhadap konteks. Return discount
	// yang boleh di-apply + promo ID untuk redemption trail. Error yang
	// user-facing sudah di-map di service.
	Validate(ctx context.Context, code string, userID uuid.UUID, tld, kind string, subtotal int64) (promoID uuid.UUID, discount int64, err error)
	// Redeem — commit redemption (insert row promo_redemptions). Dipanggil
	// setelah invoice created supaya invoice_id available. Idempotent via
	// unique(invoice_id).
	Redeem(ctx context.Context, promoID, userID, invoiceID uuid.UUID, discount int64) error
}

// SetZones inject local zones source. Kalau di-set, handler filter
// hasil check untuk hanya expose TLD yang active di local table (per
// arsitektur self-sufficient — operator kontrol full atas zone yang expose).
func (h *Handler) SetZones(z *zones.Repo) { h.zonesRepo = z }

// SetPricing inject pricing lookup untuk Purchase flow.
func (h *Handler) SetPricing(p PricingLookup) { h.pricingRepo = p }

// SetInvoices inject invoice creator untuk Purchase flow.
func (h *Handler) SetInvoices(i InvoiceCreator) { h.invoicesSvc = i }

// SetGatewayRegistry inject payment gateway registry untuk Purchase.
func (h *Handler) SetGatewayRegistry(g GatewayRegistry) { h.gwRegistry = g }

// SetPromos inject promo validator/redeem. Nil = fitur promo disabled
// (semua code akan return "not found" saat validate).
func (h *Handler) SetPromos(p PromoValidator) { h.promos = p }

// SetAudit inject audit repo untuk record purchase / retry / renew (Phase 7).
func (h *Handler) SetAudit(r *audit.Repo) { h.audit = r }

// logAudit fire-and-forget helper — pattern sama dengan admin/reseller handler.
func (h *Handler) logAudit(ctx context.Context, actor uuid.UUID, event, targetType, targetID string, meta map[string]any) {
	if h.audit == nil {
		return
	}
	var actorID *uuid.UUID
	if actor != uuid.Nil {
		actorID = &actor
	}
	_ = h.audit.Log(ctx, audit.Params{
		ActorID:    actorID,
		Event:      event,
		TargetType: targetType,
		TargetID:   targetID,
		Metadata:   meta,
	})
}

// SetAssignmentChecker — wire-up dari main.go setelah reseller repo dibuat.
// Kalau nil, purchase handler otomatis reject on_behalf_of_user_id.
func (h *Handler) SetAssignmentChecker(a AssignmentChecker) { h.assignments = a }

// NewHandler — cloudflareRepo + platformIPs optional untuk auto-attach.
// Kalau salah satu nil/empty, auto-attach ke Cloudflare skipped tanpa error
// (log warn saja). platformIPs biasanya dari cfg.PlatformIPs.
func NewHandler(
	repo *Repo, r *registrar.Client, users *auth.Repo, sitesRepo *sites.Repo,
	cloudflareRepo *cloudflare.Repo, platformIPs []string,
) *Handler {
	return &Handler{
		repo: repo, registrar: r, users: users, sites: sitesRepo, cloudflare: cloudflareRepo,
		platformIPs:   platformIPs,
	}
}

// ------------- Requests / responses -------------

type checkReq struct {
	// Domain bisa full FQDN ("myshop.co.id") atau SLD-only ("myshop"). Registrar
	// yang decide behavior — SLD-only → return results per allowed zone; full →
	// return 1 entry.
	Domain string `json:"domain"`
}

// checkResp = envelope shape identik dengan registrar (passthrough).
// Frontend cukup baca `results` array; kalau length 1 tampilkan single card,
// length >1 tampilkan grid. `allowed_zones` untuk hint UI.
type checkResp struct {
	Query        string        `json:"query"`
	AllowedZones []string      `json:"allowed_zones"`
	Results      []checkEntry  `json:"results"`
}

type checkEntry struct {
	Domain    string      `json:"domain"`
	TLD       string      `json:"tld"`
	Available bool        `json:"available"`
	Reason    string      `json:"reason,omitempty"`
	Price     *priceBlock `json:"price,omitempty"`
	Zone      *zoneBlock  `json:"zone,omitempty"`
}

type priceBlock struct {
	Currency string  `json:"currency"`
	Register float64 `json:"register"`
	Renew    float64 `json:"renew"`
	Transfer float64 `json:"transfer"`
}

// zoneBlock — flag dari zones catalog lokal. Frontend pakai untuk tentukan
// flow post-payment (kalau require_document=true, tampilkan document picker;
// kalau nik_auto_approved=true, NIK cukup tanpa upload).
type zoneBlock struct {
	Name            string `json:"name"`
	RequireDocument bool   `json:"require_document"`
	AutoApproved    bool   `json:"auto_approved"`
	NikAutoApproved bool   `json:"nik_auto_approved"`
}

type purchaseResp struct {
	JobID      string  `json:"job_id"`
	Domain     string  `json:"domain"`
	Status     string  `json:"status"`
	Kind       string  `json:"kind"` // "register" | "renew" — frontend adapt UI
	Reason     string  `json:"reason,omitempty"`
	PaymentURL string  `json:"payment_url,omitempty"`
	ExpiresAt  string  `json:"expires_at,omitempty"` // RFC3339 saat kind=register && status=active
	// SiteID di-set kalau user sudah attach purchase ini ke sites row (via
	// POST /sites/from-template/:slug atau /purchases/:job_id/attach).
	// Nil = domain aktif tapi belum ada situs → frontend prompt user pilih
	// template. Frontend pakai ini untuk decide CTA "Buat situs" vs "Edit situs".
	SiteID *string `json:"site_id,omitempty"`
}

// ------------- User endpoints -------------

func (h *Handler) Check(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Fitur domain belum dikonfigurasi (API_REGISTRY_URL kosong).")
	}
	var req checkReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Domain = strings.ToLower(strings.TrimSpace(req.Domain))
	if req.Domain == "" {
		return httpx.BadRequest(c, "domain kosong")
	}

	// Batch EPP check untuk 1..N zone dalam 1 call ke api-registry. Response
	// include `allowed_zones` supaya UI bisa hint TLD yang tersedia.
	res, err := h.registrar.CheckDomain(c.Context(), req.Domain)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	// Cross-check dengan local zones catalog: kalau zonesRepo di-set,
	// operator kontrol TLD apa yang expose ke user (bukan trust upstream).
	// Zone yang active=false di local akan drop dari response walau
	// upstream masih support.
	allowedLocal, allowedSet := h.resolveAllowedZones(c.Context(), res.AllowedZones)

	out := checkResp{
		Query:        res.Query,
		AllowedZones: allowedLocal,
		Results:      make([]checkEntry, 0, len(res.Results)),
	}
	for _, r := range res.Results {
		// Filter per-entry — kalau TLD tidak active di local, skip.
		if allowedSet != nil {
			if _, ok := allowedSet[strings.ToLower(r.TLD)]; !ok {
				continue
			}
		}
		e := checkEntry{
			Domain:    r.Domain,
			TLD:       r.TLD,
			Available: r.Available,
			Reason:    r.Reason,
		}
		if r.Price != nil {
			e.Price = &priceBlock{
				Currency: r.Price.Currency,
				Register: r.Price.Register,
				Renew:    r.Price.Renew,
				Transfer: r.Price.Transfer,
			}
		}
		if r.Zone != nil {
			e.Zone = &zoneBlock{
				Name:            r.Zone.Name,
				RequireDocument: r.Zone.RequireDocument,
				AutoApproved:    r.Zone.AutoApproved,
				NikAutoApproved: r.Zone.NikAutoApproved,
			}
		}
		out.Results = append(out.Results, e)
	}
	return httpx.OK(c, out)
}

// resolveAllowedZones — kalau zonesRepo di-set, intersect upstream zones
// dengan local active. Return (finalList, membershipSet). Set nil = no
// local filter (legacy passthrough).
func (h *Handler) resolveAllowedZones(ctx context.Context, upstream []string) ([]string, map[string]struct{}) {
	if h.zonesRepo == nil {
		return upstream, nil
	}
	local, err := h.zonesRepo.ListActive(ctx)
	if err != nil {
		// Fallback: trust upstream kalau local query fail. Log tapi jangan
		// block user — better degrade to upstream-only than break wizard.
		return upstream, nil
	}
	localSet := make(map[string]struct{}, len(local))
	for _, z := range local {
		localSet[strings.ToLower(z.TLD)] = struct{}{}
	}
	// Intersect: hanya TLD yang muncul di kedua source.
	// Kalau upstream empty (mis. api-registry tidak return zones), fallback
	// pakai semua local active.
	if len(upstream) == 0 {
		out := make([]string, 0, len(local))
		for _, z := range local {
			out = append(out, z.TLD)
		}
		return out, localSet
	}
	out := make([]string, 0, len(upstream))
	for _, tld := range upstream {
		if _, ok := localSet[strings.ToLower(tld)]; ok {
			out = append(out, tld)
		}
	}
	return out, localSet
}

// Audit event constants — dipakai lokal supaya tidak import cycle string
// literal ke package audit. Match dengan audit.EventDomain* di paket sana.
const (
	EventPurchaseCreated    = audit.EventDomainPurchased
	EventPurchaseOnBehalfOf = audit.EventDomainPurchasedOBO
)

// Status — dipakai frontend polling. Kalau status lokal masih pending +
// belum ada payment_url, hit registrar (mungkin sudah generate). Kalau sudah
// terminal, cukup baca dari cache lokal.
func (h *Handler) Status(c *fiber.Ctx) error {
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	jobID := c.Params("job_id")
	if jobID == "" {
		return httpx.BadRequest(c, "job_id required")
	}
	// Actor-inclusive lookup: reseller/agent yang beli on-behalf-of tetap boleh
	// poll walaupun user_id purchase = client_id.
	local, err := h.repo.GetByJobIDForActor(c.Context(), jobID, cl.UserID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "job tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}

	// Self-sufficient: local DB authoritative. Status update via
	// ExecuteAfterPayment (webhook) atau Retry langsung tulis ke DB —
	// tidak butuh refresh dari external source.
	return httpx.OK(c, toResp(local))
}

// GetNameservers — GET /api/v1/domains/:name/nameservers
//
// Verify ownership dulu (user harus punya active register-job untuk domain
// ini), lalu proxy ke registrar. Ownership check ganda: web builder DB +
// registrar-side check.
func (h *Handler) GetNameservers(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	name := strings.ToLower(strings.TrimSpace(c.Params("name")))
	if name == "" {
		return httpx.BadRequest(c, "name required")
	}
	if _, err := h.repo.GetLatestActiveByDomain(c.Context(), name, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "domain tidak ditemukan atau bukan milik Anda")
		}
		return httpx.Internal(c, "ownership check failed")
	}
	info, err := h.registrar.GetNameservers(c.Context(), name)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	return httpx.OK(c, info)
}

// UpdateNameservers — POST /api/v1/domains/:name/nameservers
// Body: { nameservers: [ "ns1.example.com", ... ] } (min 2, max 13)
func (h *Handler) UpdateNameservers(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	name := strings.ToLower(strings.TrimSpace(c.Params("name")))
	if name == "" {
		return httpx.BadRequest(c, "name required")
	}

	var req struct {
		Nameservers []string `json:"nameservers"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	// Trim + drop empty upfront; registrar validate hostname format lebih ketat.
	cleaned := make([]string, 0, len(req.Nameservers))
	for _, n := range req.Nameservers {
		if v := strings.ToLower(strings.TrimSpace(n)); v != "" {
			cleaned = append(cleaned, v)
		}
	}
	if len(cleaned) < 2 {
		return httpx.BadRequest(c, "minimal 2 nameserver")
	}
	if len(cleaned) > 13 {
		return httpx.BadRequest(c, "maksimal 13 nameserver")
	}

	if _, err := h.repo.GetLatestActiveByDomain(c.Context(), name, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "domain tidak ditemukan atau bukan milik Anda")
		}
		return httpx.Internal(c, "ownership check failed")
	}

	info, err := h.registrar.UpdateNameservers(c.Context(), name, cleaned)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	return httpx.OK(c, info)
}

// dnsPrecheck — helper untuk DNS handlers. Verify:
//  1. Cloudflare config tersedia (kalau tidak, 503 "cf_disabled")
//  2. Domain milik user yang login (via GetLatestActiveByDomain — same lock
//     yang dipakai renew + nameserver flow)
//  3. Zone terdaftar di CF akun kita (mungkin belum kalau auto-attach fail)
//
// Return zone_id + client siap pakai, atau error yang sudah ter-write ke
// response (caller cukup return err).
func (h *Handler) dnsPrecheck(c *fiber.Ctx, name string) (string, *cloudflare.Client, error) {
	if h.cloudflare == nil {
		return "", nil, httpx.Err(c, fiber.StatusServiceUnavailable, "cloudflare_disabled",
			"Fitur DNS belum aktif — admin perlu setup Cloudflare config.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return "", nil, httpx.Unauthorized(c, "no claims")
	}
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return "", nil, httpx.BadRequest(c, "name required")
	}
	if _, err := h.repo.GetLatestActiveByDomain(c.Context(), name, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return "", nil, httpx.NotFound(c, "domain tidak ditemukan atau bukan milik Anda")
		}
		return "", nil, httpx.Internal(c, "ownership check failed")
	}
	cfg, err := h.cloudflare.GetDefault(c.Context())
	if err != nil {
		if errors.Is(err, cloudflare.ErrNotFound) {
			return "", nil, httpx.Err(c, fiber.StatusServiceUnavailable, "cloudflare_no_config",
				"Cloudflare default config belum di-set. Hubungi admin.")
		}
		return "", nil, httpx.Internal(c, "cloudflare config lookup failed")
	}
	client := cloudflare.NewClient(*cfg)
	zone, err := client.GetZoneByDomain(c.Context(), name)
	if err != nil {
		if errors.Is(err, cloudflare.ErrZoneNotFound) {
			return "", nil, httpx.Err(c, fiber.StatusNotFound, "zone_not_found",
				"Zone Cloudflare untuk domain ini belum tersedia — biasanya muncul beberapa menit setelah pembelian selesai.")
		}
		return "", nil, httpx.Err(c, fiber.StatusBadGateway, "cloudflare_error", err.Error())
	}
	return zone.ID, client, nil
}

// ListDNSRecords — GET /api/v1/domains/:name/dns
//
// Return semua DNS record di zone Cloudflare untuk domain ini. Payload
// dikirim apa adanya dari CF (id, type, name, content, ttl, proxied,
// priority, comment) — frontend bebas render tabel + filter.
func (h *Handler) ListDNSRecords(c *fiber.Ctx) error {
	zoneID, client, errResp := h.dnsPrecheck(c, c.Params("name"))
	if errResp != nil {
		return errResp
	}
	records, err := client.ListDNSRecords(c.Context(), zoneID)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "cloudflare_error", err.Error())
	}
	return httpx.OK(c, fiber.Map{"records": records, "zone_id": zoneID})
}

// dnsRecordReq = payload create/update dari frontend. Field mirror
// cloudflare.DNSRecordRequest tapi kita re-declare supaya bisa validate +
// friendly error message sebelum forward.
type dnsRecordReq struct {
	Type     string `json:"type"`
	Name     string `json:"name"`
	Content  string `json:"content"`
	TTL      int    `json:"ttl"`
	Proxied  bool   `json:"proxied"`
	Priority *int   `json:"priority,omitempty"`
	Comment  string `json:"comment,omitempty"`
}

// validDNSTypes whitelist supaya user tidak forward type aneh yang bikin
// CF error 400. Cover 99% use case UMKM (verifikasi email, custom subdomain,
// mail routing).
var validDNSTypes = map[string]bool{
	"A": true, "AAAA": true, "CNAME": true, "TXT": true,
	"MX": true, "NS": true, "SRV": true, "CAA": true,
}

func (r *dnsRecordReq) validate() error {
	r.Type = strings.ToUpper(strings.TrimSpace(r.Type))
	r.Name = strings.TrimSpace(r.Name)
	r.Content = strings.TrimSpace(r.Content)
	if !validDNSTypes[r.Type] {
		return errors.New("type harus salah satu: A, AAAA, CNAME, TXT, MX, NS, SRV, CAA")
	}
	if r.Name == "" {
		return errors.New("name wajib (@ untuk root, atau subdomain seperti 'www')")
	}
	if r.Content == "" {
		return errors.New("content wajib")
	}
	// Proxied hanya berlaku A/AAAA/CNAME. CF ignore untuk type lain, tapi kita
	// force false supaya payload konsisten.
	if r.Type != "A" && r.Type != "AAAA" && r.Type != "CNAME" {
		r.Proxied = false
	}
	if r.Type == "MX" && r.Priority == nil {
		return errors.New("priority wajib untuk record MX")
	}
	// TTL: 1 = auto, else 60..86400
	if r.TTL != 1 && (r.TTL < 60 || r.TTL > 86400) {
		if r.TTL == 0 {
			r.TTL = 1
		} else {
			return errors.New("TTL harus 1 (auto) atau antara 60 dan 86400 detik")
		}
	}
	if len(r.Comment) > 100 {
		return errors.New("comment maksimal 100 karakter")
	}
	return nil
}

// CreateDNSRecord — POST /api/v1/domains/:name/dns
// Body: dnsRecordReq
func (h *Handler) CreateDNSRecord(c *fiber.Ctx) error {
	zoneID, client, errResp := h.dnsPrecheck(c, c.Params("name"))
	if errResp != nil {
		return errResp
	}
	var req dnsRecordReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if err := req.validate(); err != nil {
		return httpx.BadRequest(c, err.Error())
	}
	rec, err := client.CreateDNSRecord(c.Context(), zoneID, cloudflare.DNSRecordRequest{
		Type: req.Type, Name: req.Name, Content: req.Content,
		TTL: req.TTL, Proxied: req.Proxied, Priority: req.Priority,
		Comment: req.Comment,
	})
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "cloudflare_error", err.Error())
	}
	return httpx.Created(c, rec)
}

// UpdateDNSRecord — PATCH /api/v1/domains/:name/dns/:record_id
func (h *Handler) UpdateDNSRecord(c *fiber.Ctx) error {
	zoneID, client, errResp := h.dnsPrecheck(c, c.Params("name"))
	if errResp != nil {
		return errResp
	}
	recordID := strings.TrimSpace(c.Params("record_id"))
	if recordID == "" {
		return httpx.BadRequest(c, "record_id required")
	}
	var req dnsRecordReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if err := req.validate(); err != nil {
		return httpx.BadRequest(c, err.Error())
	}
	rec, err := client.UpdateDNSRecord(c.Context(), zoneID, recordID, cloudflare.DNSRecordRequest{
		Type: req.Type, Name: req.Name, Content: req.Content,
		TTL: req.TTL, Proxied: req.Proxied, Priority: req.Priority,
		Comment: req.Comment,
	})
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "cloudflare_error", err.Error())
	}
	return httpx.OK(c, rec)
}

// DeleteDNSRecord — DELETE /api/v1/domains/:name/dns/:record_id
func (h *Handler) DeleteDNSRecord(c *fiber.Ctx) error {
	zoneID, client, errResp := h.dnsPrecheck(c, c.Params("name"))
	if errResp != nil {
		return errResp
	}
	recordID := strings.TrimSpace(c.Params("record_id"))
	if recordID == "" {
		return httpx.BadRequest(c, "record_id required")
	}
	if err := client.DeleteDNSRecord(c.Context(), zoneID, recordID); err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "cloudflare_error", err.Error())
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// Whois — GET /api/v1/domains/:name/whois
//
// Return WHOIS info dari registrar. Ownership required — kita tidak expose
// public WHOIS ke sembarang user, biar registrar tidak kena rate-limit
// karena user iseng ngecek domain orang lain via web builder.
func (h *Handler) Whois(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	name := strings.ToLower(strings.TrimSpace(c.Params("name")))
	if name == "" {
		return httpx.BadRequest(c, "name required")
	}
	if _, err := h.repo.GetLatestActiveByDomain(c.Context(), name, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "domain tidak ditemukan atau bukan milik Anda")
		}
		return httpx.Internal(c, "ownership check failed")
	}
	w, err := h.registrar.Whois(c.Context(), name)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	if w == nil {
		// Whois() return (nil, nil) kalau domain tidak terdaftar — aneh untuk
		// domain milik user (active). Return empty struct, biar frontend
		// tetap render tanpa crash.
		return httpx.OK(c, map[string]string{"domain": name, "status": "unknown"})
	}
	return httpx.OK(c, w)
}

// UpdateContact — PATCH /api/v1/domains/:name/contact
// Body: Contact fields (name, email, phone, address, city, state, postal_code)
//
// Update WHOIS contact object untuk domain existing. Semua field WAJIB
// (EPP replace-all — kalau tidak dikirim, wipe di registry). Ownership
// check dulu: domain harus punya active job milik user.
//
// Response contain `message` dari api-registry yang bisa jadi 3 varian:
//   - "DB + EPP registry synced" — happy path
//   - "DB only, EPP drift" — registry down / diff detected, admin follow-up
//   - "created new contact" — kalau nic_handle belum ada
type updateContactReq struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	Phone      string `json:"phone"`
	Address    string `json:"address"`
	City       string `json:"city"`
	State      string `json:"state,omitempty"`
	PostalCode string `json:"postal_code"`
}

func (h *Handler) UpdateContact(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Fitur domain belum dikonfigurasi (API_REGISTRY_URL kosong).")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	name := strings.ToLower(strings.TrimSpace(c.Params("name")))
	if name == "" {
		return httpx.BadRequest(c, "name required")
	}
	// Ownership: user harus punya active job untuk domain ini.
	if _, err := h.repo.GetLatestActiveByDomain(c.Context(), name, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "domain tidak ditemukan atau bukan milik Anda")
		}
		return httpx.Internal(c, "ownership check failed")
	}

	var req updateContactReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	// Validate mandatory fields (EPP contact:update tolak kalau incomplete).
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.TrimSpace(req.Email)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Address = strings.TrimSpace(req.Address)
	req.City = strings.TrimSpace(req.City)
	req.PostalCode = strings.TrimSpace(req.PostalCode)
	req.State = strings.TrimSpace(req.State)
	missing := []string{}
	if req.Name == "" {
		missing = append(missing, "name")
	}
	if req.Email == "" {
		missing = append(missing, "email")
	}
	if req.Phone == "" {
		missing = append(missing, "phone")
	}
	if req.Address == "" {
		missing = append(missing, "address")
	}
	if req.City == "" {
		missing = append(missing, "city")
	}
	if req.PostalCode == "" {
		missing = append(missing, "postal_code")
	}
	if len(missing) > 0 {
		return httpx.Err(c, fiber.StatusBadRequest, "contact_incomplete",
			"Field wajib kosong: "+strings.Join(missing, ", "))
	}

	resp, err := h.registrar.UpdateDomainContact(c.Context(), name, registrar.Contact{
		Name:        req.Name,
		Email:       req.Email,
		Phone:       req.Phone,
		Address:     req.Address,
		City:        req.City,
		State:       req.State,
		PostalCode:  req.PostalCode,
		CountryCode: "ID",
	})
	if err != nil {
		var apiErr *registrar.APIError
		if errors.As(err, &apiErr) && apiErr.Status >= 400 && apiErr.Status < 500 {
			return httpx.Err(c, apiErr.Status, "contact_update_failed", apiErr.Msg)
		}
		return httpx.Err(c, fiber.StatusBadGateway, "contact_update_failed", err.Error())
	}
	h.logAudit(c.Context(), cl.UserID, "domain.contact_updated", "domain", name, map[string]any{
		"contact_id": resp.ContactID,
		"nic_handle": resp.NicHandle,
	})
	return httpx.OK(c, resp)
}

func (h *Handler) List(c *fiber.Ctx) error {
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	items, err := h.repo.ListByUser(c.Context(), cl.UserID, limit)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	out := make([]purchaseResp, 0, len(items))
	for i := range items {
		out = append(out, toResp(&items[i]))
	}
	return httpx.OK(c, out)
}

// ExportOnBehalfOfCSV — GET /api/v1/reseller/purchases.csv (Phase 6).
// Streaming CSV dari portfolio domain reseller. Include kolom client info
// supaya bisa dipakai accounting/reconciliation di spreadsheet.
//
// Format: satu row per purchase, kolom sesuai header di line pertama.
// TIDAK paginated — asumsi reseller punya <10k domain (kalau makin besar,
// admin bisa expose paged CSV di route berbeda).
func (h *Handler) ExportOnBehalfOfCSV(c *fiber.Ctx) error {
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	// Batch 1000 — realistis untuk reseller MVP; kalau butuh lebih, page later.
	items, err := h.repo.ListByPurchaser(c.Context(), cl.UserID, 10000)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	// Enrich client info (email + name) via cache — sama pattern dengan
	// ListOnBehalfOf.
	cache := map[uuid.UUID]*auth.User{}
	lookup := func(id uuid.UUID) *auth.User {
		if u, ok := cache[id]; ok {
			return u
		}
		u, err := h.users.GetByID(c.Context(), id)
		if err == nil && u != nil {
			cache[id] = u
			return u
		}
		return nil
	}

	c.Set("Content-Type", "text/csv; charset=utf-8")
	c.Set("Content-Disposition", `attachment; filename="reseller-domains.csv"`)

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{
		"domain", "kind", "status", "years", "expires_at",
		"client_id", "client_email", "client_name",
		"payment_method", "created_at",
	})
	for i := range items {
		p := &items[i]
		u := lookup(p.UserID)
		email, name := "", ""
		if u != nil {
			email, name = u.Email, u.Name
		}
		exp := ""
		if p.ExpiresAt != nil {
			exp = p.ExpiresAt.UTC().Format(time.RFC3339)
		}
		_ = w.Write([]string{
			p.Domain, p.Kind, p.Status,
			strconv.Itoa(p.Years), exp,
			p.UserID.String(), email, name,
			p.PaymentMethod, p.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	w.Flush()
	return c.Send(buf.Bytes())
}

// ListOnBehalfOf — reseller/agent lihat purchase yang mereka trigger untuk
// client (bukan self-purchase). Enrich dengan client email + name supaya UI
// bisa langsung display "domain X untuk klien Y" tanpa second fetch.
//
// Middleware RequireResellerOrAgent sudah enforce role; kita tinggal filter
// purchased_by = caller.
func (h *Handler) ListOnBehalfOf(c *fiber.Ctx) error {
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	items, err := h.repo.ListByPurchaser(c.Context(), cl.UserID, limit)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	// Enrich per-row dengan client info. Cache users lookup dalam satu request
	// untuk hindari N+1 saat banyak purchase untuk klien yang sama.
	type row struct {
		purchaseResp
		ClientID    string `json:"client_id"`
		ClientName  string `json:"client_name"`
		ClientEmail string `json:"client_email"`
	}
	out := make([]row, 0, len(items))
	cache := map[uuid.UUID]*auth.User{}
	for i := range items {
		p := &items[i]
		u, ok := cache[p.UserID]
		if !ok {
			if lookup, err := h.users.GetByID(c.Context(), p.UserID); err == nil {
				cache[p.UserID] = lookup
				u = lookup
			}
		}
		r := row{purchaseResp: toResp(p), ClientID: p.UserID.String()}
		if u != nil {
			r.ClientName = u.Name
			r.ClientEmail = u.Email
		}
		out = append(out, r)
	}
	return httpx.OK(c, out)
}

// reconcilePerPage = ukuran page saat sweep registrar list. 100 = balance
// antara jumlah round-trip dan payload size (registrar-side default).
const reconcilePerPage = 100

// reconcileMaxPages = cap safety supaya kalau registrar salah return non-strictly
// decreasing page (misconfigured pagination), loop tidak infinite. 50 pages ×
// 100 = 5000 jobs — cukup untuk reseller besar; realistis MVP.
const reconcileMaxPages = 50

// Attach — dipanggil setelah user pilih template + slug supaya domain
// ter-link ke sites.id. Idempoten: sekali attached, tidak bisa detach dari
// endpoint ini (harus lewat delete site).
func (h *Handler) Attach(c *fiber.Ctx) error {
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	jobID := c.Params("job_id")
	var req struct {
		SiteID string `json:"site_id"`
	}
	if err := c.BodyParser(&req); err != nil || req.SiteID == "" {
		return httpx.BadRequest(c, "site_id required")
	}
	siteID, err := uuid.Parse(req.SiteID)
	if err != nil {
		return httpx.BadRequest(c, "invalid site_id")
	}
	// Two-layer ownership check:
	//   1. Site milik user yang login — cegah user A attach domain-nya ke
	//      site_id user B (walaupun butuh tebak UUID, defence in depth).
	//   2. Purchase milik user yang login — di-enforce di repo.AttachSite via
	//      WHERE user_id di kolom domain_purchases.
	if h.sites != nil {
		if _, err := h.sites.GetOwned(c.Context(), siteID, cl.UserID); err != nil {
			if errors.Is(err, sites.ErrNotFound) {
				return httpx.NotFound(c, "site tidak ditemukan")
			}
			return httpx.Internal(c, "site lookup failed")
		}
	}
	if err := h.repo.AttachSite(c.Context(), jobID, cl.UserID, siteID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "job tidak ditemukan atau sudah di-attach")
		}
		return httpx.Internal(c, "attach failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// ------------- Admin: registrar webhook config -------------
//
// Admin endpoints — /api/v1/admin/* — proteksi via auth.RequireAdmin di router.

// AdminListPurchases — GET /api/v1/admin/registrar/purchases
//
// Paginated + filter (status, kind, q). Join dengan users → row include email
// + nama supaya admin bisa trace tanpa lookup manual.
//
// Query params:
//   status: pending_payment | pending_document | pending_provisioning | active | failed | expired
//   kind:   register | renew
//   q:      LIKE match domain OR user email
//   page, page_size, sort (default created_at DESC)
func (h *Handler) AdminListPurchases(c *fiber.Ctx) error {
	p := httpx.ParsePagination(c)
	f := AdminListFilter{
		Status: c.Query("status"),
		Kind:   c.Query("kind"),
		Like:   p.LikePattern(),
		Sort:   p.Sort,
		Limit:  p.PageSize,
		Offset: p.Offset(),
	}
	items, total, err := h.repo.AdminList(c.Context(), f)
	if err != nil {
		slog.Error("admin list purchases failed", "error", err)
		return httpx.Internal(c, "list failed")
	}
	// Transform ke response shape ringkas — jangan expose raw column tanpa filter.
	type row struct {
		JobID         string  `json:"job_id"`
		Domain        string  `json:"domain"`
		Status        string  `json:"status"`
		Kind          string  `json:"kind"`
		Reason        string  `json:"reason,omitempty"`
		Years         int     `json:"years"`
		PaymentMethod string  `json:"payment_method,omitempty"`
		ExpiresAt     string  `json:"expires_at,omitempty"`
		CreatedAt     string  `json:"created_at"`
		UpdatedAt     string  `json:"updated_at"`
		UserID        string  `json:"user_id"`
		UserEmail     string  `json:"user_email"`
		UserName      string  `json:"user_name"`
		SiteID        *string `json:"site_id,omitempty"`
	}
	out := make([]row, 0, len(items))
	for i := range items {
		it := &items[i]
		r := row{
			JobID:         it.RegistrarJobID,
			Domain:        it.Domain,
			Status:        it.Status,
			Kind:          it.Kind,
			Reason:        it.Reason,
			Years:         it.Years,
			PaymentMethod: it.PaymentMethod,
			CreatedAt:     it.CreatedAt.UTC().Format(time.RFC3339),
			UpdatedAt:     it.UpdatedAt.UTC().Format(time.RFC3339),
			UserID:        it.UserID.String(),
			UserEmail:     it.UserEmail,
			UserName:      it.UserName,
		}
		if it.ExpiresAt != nil {
			r.ExpiresAt = it.ExpiresAt.UTC().Format(time.RFC3339)
		}
		if it.SiteID != nil {
			s := it.SiteID.String()
			r.SiteID = &s
		}
		out = append(out, r)
	}
	return httpx.OK(c, httpx.MakePaginated(out, p, total))
}

// tryAttachToCloudflare = best-effort auto-attach domain baru ke Cloudflare:
//  1. Ambil config CF default (skip kalau belum di-setup admin).
//  2. Create zone di CF → dapat NS assignment + zone_id.
//  3. Create A record `@` → PLATFORM_IPS[0] (proxied=true, lewat CF edge).
//  4. Create CNAME `www` → root domain (proxied=true).
//  5. Push NS itu ke registrar via UpdateNameservers.
//
// Semua error di-log tapi TIDAK propagate — domain sudah live di registry,
// CF attach hanya optimization. DNS record failure (mis. duplicate) di-treat
// warn tapi flow lanjut (zone tetap valid, admin bisa fix DNS manual).
//
// Kalau PLATFORM_IPS kosong, skip create DNS records (zone tetap dibuat +
// NS di-push, tapi user harus setup DNS record manual di CF dashboard).
func (h *Handler) tryAttachToCloudflare(ctx context.Context, domain string) {
	if h.cloudflare == nil || h.registrar == nil || domain == "" {
		return
	}
	cfg, err := h.cloudflare.GetDefault(ctx)
	if err != nil {
		if !errors.Is(err, cloudflare.ErrNotFound) {
			slog.Warn("cloudflare attach: default lookup failed", "error", err, "domain", domain)
		}
		metrics.Default.CounterInc("cloudflare_attach_total",
			"Auto-attach ke Cloudflare per outcome",
			map[string]string{"result": "skipped_no_config"},
		)
		return
	}

	client := cloudflare.NewClient(*cfg)
	zone, err := client.CreateZone(ctx, domain)
	if err != nil {
		slog.Warn("cloudflare attach: create zone failed",
			"error", err, "domain", domain, "cf_config", cfg.Name)
		metrics.Default.CounterInc("cloudflare_attach_total",
			"Auto-attach ke Cloudflare per outcome",
			map[string]string{"result": "zone_failed"},
		)
		return
	}

	// -------- DNS records --------
	// A record `@` → platform IP + CNAME `www` → root. Skip kalau PLATFORM_IPS
	// belum di-config (admin bisa setup manual di CF dashboard).
	if len(h.platformIPs) > 0 {
		platformIP := h.platformIPs[0]
		if _, err := client.CreateDNSRecord(ctx, zone.ID, cloudflare.DNSRecordRequest{
			Type: "A", Name: "@", Content: platformIP, Proxied: true,
		}); err != nil && !cloudflare.IsCloudflareDuplicateRecord(err) {
			slog.Warn("cloudflare attach: create A record failed",
				"error", err, "domain", domain, "content", platformIP)
			// Non-fatal — lanjut push NS. Admin bisa fix DNS manual di CF.
		}
		if _, err := client.CreateDNSRecord(ctx, zone.ID, cloudflare.DNSRecordRequest{
			Type: "CNAME", Name: "www", Content: domain, Proxied: true,
		}); err != nil && !cloudflare.IsCloudflareDuplicateRecord(err) {
			slog.Warn("cloudflare attach: create CNAME www failed",
				"error", err, "domain", domain)
		}
	} else {
		slog.Warn("cloudflare attach: PLATFORM_IPS kosong, skip create DNS records — domain resolve tidak akan point ke platform sampai admin setup manual",
			"domain", domain, "zone_id", zone.ID)
	}

	// -------- Push NS ke registrar --------
	if _, err := h.registrar.UpdateNameservers(ctx, domain, zone.NameServers); err != nil {
		slog.Warn("cloudflare attach: update NS at registrar failed",
			"error", err, "domain", domain, "ns", zone.NameServers)
		metrics.Default.CounterInc("cloudflare_attach_total",
			"Auto-attach ke Cloudflare per outcome",
			map[string]string{"result": "ns_push_failed"},
		)
		return
	}

	slog.Info("cloudflare attach: success",
		"domain", domain, "zone_id", zone.ID, "ns", zone.NameServers)
	metrics.Default.CounterInc("cloudflare_attach_total",
		"Auto-attach ke Cloudflare per outcome",
		map[string]string{"result": "success"},
	)
}

// ------------- helpers -------------

func toResp(p *Purchase) purchaseResp {
	out := purchaseResp{
		JobID:      p.RegistrarJobID,
		Domain:     p.Domain,
		Status:     p.Status,
		Kind:       p.Kind,
		Reason:     p.Reason,
		PaymentURL: p.PaymentURL,
	}
	if p.ExpiresAt != nil {
		out.ExpiresAt = p.ExpiresAt.UTC().Format(time.RFC3339)
	}
	if p.SiteID != nil {
		s := p.SiteID.String()
		out.SiteID = &s
	}
	return out
}

func missingProfileFields(u *auth.User) []string {
	var missing []string
	check := func(label, v string) {
		if strings.TrimSpace(v) == "" {
			missing = append(missing, label)
		}
	}
	check("nama", u.Name)
	check("nomor HP", u.PhoneNumber)
	check("alamat", u.Address)
	check("kota", u.City)
	check("kode pos", u.PostalCode)
	return missing
}

// silence unused imports if handler shrinks
var _ = io.Discard
var _ = bytes.NewReader
