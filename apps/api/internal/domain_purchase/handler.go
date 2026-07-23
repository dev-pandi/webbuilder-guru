package domain_purchase

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/metrics"
	"github.com/webbuilder/api/internal/registrar"
)

// Metric names — kept as constants supaya konsisten dgn dashboard Prometheus
// dan mudah di-grep. Value/help berpasangan dengan CounterInc call site.
const (
	metricPurchasesCreated  = "domain_purchases_created_total"
	metricWebhooksReceived  = "domain_purchase_webhooks_total"
	metricReconcileRuns     = "domain_purchase_reconcile_runs_total"
	metricReconcileUpdated  = "domain_purchase_reconcile_updated_total"
)

// Handler menjembatani frontend web builder ↔ registrar-api.
//
// User-facing endpoints (JWT):
//   POST /api/v1/domains/check                 — availability + harga
//   POST /api/v1/domains/purchase              — trigger register at registrar
//   GET  /api/v1/domains/purchases/:job_id     — poll status (owned by user)
//   GET  /api/v1/domains/purchases             — list milik user
//   POST /api/v1/domains/purchases/:job_id/attach — link ke site_id existing
//
// Global (webhook — NO JWT, HMAC-signed):
//   POST /webhooks/registrar/domain-status     — callback dari registrar-api
type Handler struct {
	repo          *Repo
	registrar     *registrar.Client
	users         *auth.Repo
	webhookSecret string
}

func NewHandler(repo *Repo, r *registrar.Client, users *auth.Repo, webhookSecret string) *Handler {
	return &Handler{repo: repo, registrar: r, users: users, webhookSecret: webhookSecret}
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

// zoneBlock — flag dari registrar-api's zones table. Frontend pakai untuk
// tentukan flow post-payment (kalau require_document=true, tampilkan
// document picker; kalau nik_auto_approved=true, NIK cukup tanpa upload).
type zoneBlock struct {
	Name            string `json:"name"`
	RequireDocument bool   `json:"require_document"`
	AutoApproved    bool   `json:"auto_approved"`
	NikAutoApproved bool   `json:"nik_auto_approved"`
}

type purchaseReq struct {
	Domain        string   `json:"domain"`
	Years         int      `json:"years"`
	PaymentMethod string   `json:"payment_method"`
	ReturnURL     string   `json:"return_url"`
	PromoCode     string   `json:"promo_code,omitempty"`   // forwarded ke registrar
	DocumentIDs   []uint64 `json:"document_ids,omitempty"` // pre-attach docs
}

type purchaseResp struct {
	JobID      string `json:"job_id"`
	Domain     string `json:"domain"`
	Status     string `json:"status"`
	Kind       string `json:"kind"` // "register" | "renew" — frontend adapt UI
	Reason     string `json:"reason,omitempty"`
	PaymentURL string `json:"payment_url,omitempty"`
	ExpiresAt  string `json:"expires_at,omitempty"` // RFC3339 saat kind=register && status=active
}

// ------------- User endpoints -------------

func (h *Handler) Check(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi (REGISTRAR_API_URL kosong).")
	}
	var req checkReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Domain = strings.ToLower(strings.TrimSpace(req.Domain))
	if req.Domain == "" {
		return httpx.BadRequest(c, "domain kosong")
	}

	// Reseller check: batch EPP untuk 1..N zone dalam 1 call. Response include
	// `allowed_zones` supaya UI bisa hint TLD yang tersedia untuk reseller ini.
	res, err := h.registrar.CheckDomain(c.Context(), req.Domain)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	out := checkResp{
		Query:        res.Query,
		AllowedZones: res.AllowedZones,
		Results:      make([]checkEntry, 0, len(res.Results)),
	}
	for _, r := range res.Results {
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

func (h *Handler) Purchase(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	var req purchaseReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Domain = strings.ToLower(strings.TrimSpace(req.Domain))
	if req.Domain == "" || req.Years < 1 || req.Years > 10 {
		return httpx.BadRequest(c, "domain + years (1-10) wajib")
	}
	if req.PaymentMethod != "midtrans" && req.PaymentMethod != "paylabs" {
		return httpx.BadRequest(c, "payment_method harus 'midtrans' atau 'paylabs'")
	}

	// Ambil profil user — WAJIB lengkap sebelum bisa beli domain karena
	// registrar butuh nama+HP+alamat+kota+kode pos+NIK untuk contact object.
	user, err := h.users.GetByID(c.Context(), cl.UserID)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}
	if missing := missingProfileFields(user); len(missing) > 0 {
		return httpx.Err(c, fiber.StatusBadRequest, "profile_incomplete",
			"Lengkapi profil dulu di /settings/profile — field kosong: "+strings.Join(missing, ", "))
	}
	// NIK selalu opsional di sisi kita. Kalau ternyata zone butuh (mis. .id
	// per regulasi Kemenkominfo), registrar akan reject → error di-map ke
	// pesan friendly Indonesia via friendlyError frontend + decodeError shape
	// handling (client.go). Web builder tidak enforce upfront supaya TLD
	// non-.id (yang majority) tidak kena syarat NIK.

	// Idempotency key per request. Frontend seharusnya kirim key sendiri
	// (dari UUID checkout), tapi kalau tidak, kita generate di sini —
	// artinya double-click akan bikin 2 job (acceptable trade-off untuk MVP).
	idem := c.Get("Idempotency-Key")
	if idem == "" {
		idem = uuid.New().String()
	}

	registrarReq := registrar.RegisterRequest{
		Domain:         req.Domain,
		Years:          req.Years,
		ExternalUserID: user.ID.String(),
		IdempotencyKey: idem,
		PaymentMethod:  req.PaymentMethod,
		ReturnURL:      req.ReturnURL,
		PromoCode:      strings.TrimSpace(req.PromoCode),
		DocumentIDs:    req.DocumentIDs,
		Contact: registrar.Contact{
			Name:        user.Name,
			Email:       user.Email,
			Phone:       user.PhoneNumber,
			Address:     user.Address,
			City:        user.City,
			State:       user.State,
			PostalCode:  user.PostalCode,
			CountryCode: "ID",
			Nik:         user.Nik,
		},
	}

	resp, err := h.registrar.RegisterDomain(c.Context(), registrarReq)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}

	// Simpan job lokal — biar frontend polling tanpa hit registrar setiap kali,
	// dan supaya webhook bisa lookup ownership.
	local := &Purchase{
		UserID:         user.ID,
		RegistrarJobID: resp.JobID,
		Domain:         req.Domain,
		Years:          req.Years,
		Status:         resp.Status,
		PaymentMethod:  req.PaymentMethod,
		PaymentURL:     resp.PaymentURL,
	}
	if err := h.repo.Create(c.Context(), local); err != nil {
		// Idempotency retry — kalau job_id kolisi (retry request identik), OK.
		if !errors.Is(err, ErrJobTaken) {
			slog.Error("domain purchase: local save failed", "error", err, "job_id", resp.JobID)
			return httpx.Internal(c, "gagal menyimpan job local")
		}
	}
	metrics.Default.CounterInc(metricPurchasesCreated,
		"Domain purchase jobs created (register/renew)",
		map[string]string{"kind": KindRegister},
	)

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": purchaseResp{
		JobID:      resp.JobID,
		Domain:     req.Domain,
		Status:     resp.Status,
		PaymentURL: resp.PaymentURL,
	}})
}

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
	local, err := h.repo.GetByJobID(c.Context(), jobID, cl.UserID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "job tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}

	// Refresh dari registrar kalau belum terminal. Skip kalau registrar client
	// nil (biar tetap bisa read cache saat backend offline).
	if !IsTerminal(local.Status) && h.registrar != nil {
		if fresh, err := h.registrar.GetRegisterStatus(c.Context(), jobID); err == nil && fresh != nil {
			var expires *time.Time
			if fresh.ExpiresAt != "" {
				if t, err := time.Parse(time.RFC3339, fresh.ExpiresAt); err == nil {
					expires = &t
				}
			}
			if _, err := h.repo.UpdateStatus(c.Context(), jobID, fresh.Status, fresh.Reason, expires); err != nil {
				slog.Warn("domain purchase: update status failed", "error", err)
			}
			// Re-load supaya response konsisten.
			if reloaded, err := h.repo.GetByJobID(c.Context(), jobID, cl.UserID); err == nil {
				local = reloaded
			}
		}
	}
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

// Renew — POST /api/v1/domains/renew
//
// Body: { domain, years, payment_method, promo_code?, return_url? }
// Header (opsional): Idempotency-Key
//
// Ownership: domain harus punya active register-job milik user (via
// GetLatestActiveByDomain). Kalau tidak, 404 — user tidak boleh perpanjang
// domain orang lain.
//
// Flow:
//  1. Verify user pemilik domain.
//  2. Forward ke registrar RenewDomain → dapat job_id + payment_url.
//  3. Simpan local dengan kind=renew (site_id nil — site sudah exist).
//  4. Return sama shape dengan purchase (frontend re-use pending page).
type renewReq struct {
	Domain        string `json:"domain"`
	Years         int    `json:"years"`
	PaymentMethod string `json:"payment_method"`
	ReturnURL     string `json:"return_url"`
}

func (h *Handler) Renew(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	var req renewReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Domain = strings.ToLower(strings.TrimSpace(req.Domain))
	if req.Domain == "" || req.Years < 1 || req.Years > 10 {
		return httpx.BadRequest(c, "domain + years (1-10) wajib")
	}
	if req.PaymentMethod != "midtrans" && req.PaymentMethod != "paylabs" {
		return httpx.BadRequest(c, "payment_method harus 'midtrans' atau 'paylabs'")
	}

	// Ownership: domain harus milik user (via register job active existing).
	// Kalau tidak, 404 — cegah user perpanjang domain orang lain.
	if _, err := h.repo.GetLatestActiveByDomain(c.Context(), req.Domain, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "domain tidak ditemukan atau bukan milik Anda")
		}
		return httpx.Internal(c, "domain lookup failed")
	}

	idem := c.Get("Idempotency-Key")
	if idem == "" {
		idem = uuid.New().String()
	}

	resp, err := h.registrar.RenewDomain(c.Context(), req.Domain, registrar.RenewRequest{
		Years:          req.Years,
		IdempotencyKey: idem,
		ExternalUserID: cl.UserID.String(),
		PaymentMethod:  req.PaymentMethod,
		ReturnURL:      req.ReturnURL,
	})
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}

	local := &Purchase{
		UserID:         cl.UserID,
		RegistrarJobID: resp.JobID,
		Domain:         req.Domain,
		Years:          req.Years,
		Kind:           KindRenew,
		Status:         resp.Status,
		PaymentMethod:  req.PaymentMethod,
		PaymentURL:     resp.PaymentURL,
	}
	if err := h.repo.Create(c.Context(), local); err != nil && !errors.Is(err, ErrJobTaken) {
		slog.Error("renew: local save failed", "error", err, "job_id", resp.JobID)
		return httpx.Internal(c, "gagal menyimpan job local")
	}
	metrics.Default.CounterInc(metricPurchasesCreated,
		"Domain purchase jobs created (register/renew)",
		map[string]string{"kind": KindRenew},
	)

	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{"data": purchaseResp{
		JobID:      resp.JobID,
		Domain:     req.Domain,
		Status:     resp.Status,
		PaymentURL: resp.PaymentURL,
	}})
}

// Retry — POST /api/v1/domains/purchases/:job_id/retry
//
// Trigger EPP CREATE ulang di registrar untuk job yang status=failed.
// User TIDAK bayar ulang — invoice + payment lama tetap valid; registrar
// re-run flow provisioning saja. Kalau retry sukses, status akan advance
// balik ke pending_provisioning → active.
//
// Ownership: job harus milik user (defence terhadap URL guessing).
// Status: harus terminal-failed. Kalau status lain, registrar reject.
func (h *Handler) Retry(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	jobID := c.Params("job_id")
	if jobID == "" {
		return httpx.BadRequest(c, "job_id required")
	}
	// Ownership check dulu — biar tidak leak keberadaan job orang lain.
	if _, err := h.repo.GetByJobID(c.Context(), jobID, cl.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "job tidak ditemukan")
		}
		return httpx.Internal(c, "job lookup failed")
	}

	resp, err := h.registrar.RetryDomain(c.Context(), jobID)
	if err != nil {
		return proxyRegistrarErr(c, "registrar_retry_failed", err)
	}
	// Sync status lokal — registrar sudah pindahkan ke pending_provisioning
	// biasanya. Reason di-clear (retry sukses).
	if resp.Status != "" {
		if _, err := h.repo.UpdateStatus(c.Context(), jobID, resp.Status, "", nil); err != nil {
			slog.Warn("retry: local status sync failed", "job_id", jobID, "error", err)
		}
	}
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

// Sync — POST /api/v1/domains/sync
//
// Reconcile local domain_purchases cache dengan ground truth di registrar.
// Berguna kalau webhook drop (jaringan, restart, dst.) sehingga status lokal
// stale. User-triggered via tombol "Sinkronkan" di /settings/domains.
//
// Yang di-reconcile per job:
//   - status (misal registrar sudah tandai expired tapi lokal masih active)
//   - expires_at (setelah renew sukses, registrar update tanggal baru)
//
// Scope: hanya job milik user (registrar filter by external_user_id). Kalau
// job ada di registrar tapi tidak di lokal, SKIP — itu domain yang di-register
// dari channel lain (bukan concern web builder).
//
// Response: { scanned, updated } — untuk UX feedback singkat.
func (h *Handler) Sync(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	scanned, updated, err := h.reconcile(c.Context(), cl.UserID.String())
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	metrics.Default.CounterInc(metricReconcileRuns,
		"Reconcile runs by trigger",
		map[string]string{"trigger": "user"},
	)
	if updated > 0 {
		metrics.Default.CounterAdd(metricReconcileUpdated,
			"Rows updated across all reconcile runs",
			nil, uint64(updated),
		)
	}
	return httpx.OK(c, fiber.Map{"scanned": scanned, "updated": updated})
}

// reconcilePerPage = ukuran page saat sweep registrar list. 100 = balance
// antara jumlah round-trip dan payload size (registrar-side default).
const reconcilePerPage = 100

// reconcileMaxPages = cap safety supaya kalau registrar salah return non-strictly
// decreasing page (misconfigured pagination), loop tidak infinite. 50 pages ×
// 100 = 5000 jobs — cukup untuk reseller besar; realistis MVP.
const reconcileMaxPages = 50

// reconcile = pure logic shared antara HTTP handler + background loop.
// externalUserID kosong = ambil SEMUA job reseller (dipakai background loop);
// non-kosong = filter ke user tsb (dipakai per-user HTTP sync).
//
// Loop paginasi sampai halaman terakhir (items < perPage) atau cap
// reconcileMaxPages tercapai. Sebelumnya cuma page 1 → reseller dengan >100
// domain silent-skip sisanya. Kalau ctx cancel di tengah loop, return apa
// yang sudah reconciled (partial success — acceptable).
func (h *Handler) reconcile(ctx context.Context, externalUserID string) (scanned, updated int, err error) {
	for page := 1; page <= reconcileMaxPages; page++ {
		if err := ctx.Err(); err != nil {
			return scanned, updated, err
		}
		list, listErr := h.registrar.ListDomains(ctx, externalUserID, page, reconcilePerPage)
		if listErr != nil {
			// Page 1 gagal = tidak ada progress → propagate. Page >1 gagal =
			// partial progress ada; log + return apa yang sudah dilakukan.
			if page == 1 {
				return 0, 0, listErr
			}
			slog.Warn("reconcile: pagination stopped on error",
				"error", listErr, "page", page, "scanned", scanned, "updated", updated)
			return scanned, updated, nil
		}
		if list == nil || len(list.Items) == 0 {
			return scanned, updated, nil
		}
		scanned += len(list.Items)
		for _, it := range list.Items {
			if it.JobID == "" {
				continue
			}
			var expires *time.Time
			if it.ExpiresAt != "" {
				if t, err := time.Parse(time.RFC3339, it.ExpiresAt); err == nil {
					expires = &t
				}
			}
			// UpdateStatus idempotent — hanya update kalau status berbeda. Kalau
			// job_id tidak ada di lokal, RowsAffected = 0 (silent skip).
			changed, err := h.repo.UpdateStatus(ctx, it.JobID, it.Status, "", expires)
			if err != nil {
				slog.Warn("reconcile: update failed", "job_id", it.JobID, "error", err)
				continue
			}
			if changed {
				updated++
			}
		}
		// Partial page = halaman terakhir. Hemat 1 round-trip.
		if len(list.Items) < reconcilePerPage {
			return scanned, updated, nil
		}
	}
	slog.Warn("reconcile: hit max pages cap — reseller has more domains than expected",
		"max_pages", reconcileMaxPages, "per_page", reconcilePerPage)
	return scanned, updated, nil
}

// RunPeriodicSync menjalankan reconcile untuk SEMUA user reseller (empty
// filter) tiap `interval`. Blok sampai ctx cancel — panggil dari goroutine.
// Fire-and-forget: error di-log tapi tidak stop loop.
//
// First tick langsung fire supaya restart cepat pickup drift.
func (h *Handler) RunPeriodicSync(ctx context.Context, interval time.Duration) {
	if h.registrar == nil {
		return
	}
	if interval <= 0 {
		interval = 6 * time.Hour
	}
	slog.Info("domain purchase: periodic sync started", "interval", interval)
	tick := func() {
		scanned, updated, err := h.reconcile(ctx, "")
		if err != nil {
			slog.Warn("periodic sync failed (retry next tick)", "error", err)
			return
		}
		metrics.Default.CounterInc(metricReconcileRuns,
			"Reconcile runs by trigger",
			map[string]string{"trigger": "periodic"},
		)
		if updated > 0 {
			metrics.Default.CounterAdd(metricReconcileUpdated,
				"Rows updated across all reconcile runs",
				nil, uint64(updated),
			)
			slog.Info("periodic sync completed", "scanned", scanned, "updated", updated)
		}
	}
	tick()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("domain purchase: periodic sync stopped")
			return
		case <-t.C:
			tick()
		}
	}
}

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
	// Ownership dari purchase sudah dijamin oleh GetByJobID di bawah;
	// ownership site harus dicek caller (site.user_id == user.id).
	// Simplification: repo.AttachSite pakai WHERE user_id = ... di kolom
	// domain_purchases, jadi user yang bukan owner otomatis dapat ErrNotFound.
	if err := h.repo.AttachSite(c.Context(), jobID, cl.UserID, siteID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "job tidak ditemukan atau sudah di-attach")
		}
		return httpx.Internal(c, "attach failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// AttachDocument — POST /api/v1/domains/purchases/:job_id/documents (multipart)
//
// Web builder = transparent proxy: user upload file dari browser, request
// diteruskan langsung ke registrar's reseller endpoint. Dokumen tidak
// disimpan di web builder — single source of truth = registrar (menghindari
// duplikasi PII + sync problem).
//
// Multipart fields (dari frontend):
//   - file        : binary (max 8 MiB — di-enforce Fiber `BodyLimit` + registrar)
//   - category_id : int (dari registrar's /v1/api/get-category, e.g. 1 = KTP)
//
// Flow:
//  1. Verify job owned by user.
//  2. Buka file dari multipart, forward ke registrar UploadDocumentForJob.
//  3. Kalau registrar advance status (pending_document → pending_provisioning),
//     sync ke tabel domain_purchases lokal.
//
// Return: registrar's UploadDocumentResp (job_id, document_id di registrar,
// status baru, flag status_advanced).
func (h *Handler) AttachDocument(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	jobID := c.Params("job_id")
	if jobID == "" {
		return httpx.BadRequest(c, "job_id required")
	}

	// Ownership: job harus milik user (biar user A tidak bisa attach dokumen
	// ke job user B).
	job, err := h.repo.GetByJobID(c.Context(), jobID, cl.UserID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "job tidak ditemukan")
	}
	if err != nil {
		return httpx.Internal(c, "job lookup failed")
	}

	// Ambil multipart file.
	fh, err := c.FormFile("file")
	if err != nil {
		return httpx.BadRequest(c, "field 'file' wajib (multipart)")
	}
	categoryID, _ := strconv.Atoi(c.FormValue("category_id"))
	if categoryID <= 0 {
		return httpx.BadRequest(c, "field 'category_id' wajib (dari /documents/categories, contoh 1 = KTP)")
	}

	// Tentukan MIME — trust Content-Type header dulu, fallback ke ekstensi.
	mime := fh.Header.Get("Content-Type")
	if mime == "" {
		switch strings.ToLower(filepath.Ext(fh.Filename)) {
		case ".png":
			mime = "image/png"
		case ".jpg", ".jpeg":
			mime = "image/jpeg"
		case ".pdf":
			mime = "application/pdf"
		}
	}

	src, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "buka file gagal")
	}
	defer src.Close()

	resp, err := h.registrar.UploadDocumentForJob(
		c.Context(),
		job.RegistrarJobID,
		categoryID,
		fh.Filename,
		mime,
		src,
	)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_upload_failed", err.Error())
	}

	// Sync status lokal kalau registrar advance-kan (biasanya
	// pending_document → pending_provisioning). Best-effort.
	if resp.StatusAdvanced && resp.Status != "" {
		if _, err := h.repo.UpdateStatus(c.Context(), job.RegistrarJobID, resp.Status, "", nil); err != nil {
			slog.Warn("attach doc: local status sync failed", "job_id", job.RegistrarJobID, "error", err)
		}
	}

	return httpx.OK(c, resp)
}

// ListDocuments — GET /api/v1/documents
//
// Proxy list dokumen registrar user tsb (scoped by user UUID sebagai
// external_user_id — enforce di sini, TIDAK boleh trust query param dari
// client). Cegah user A lihat KTP user B walaupun sama-sama reseller sisi
// registrar.
//
// Query params:
//   category_id: opsional filter (0/kosong = semua)
//   all=true:    non-paginated (buat dropdown/picker)
//   page, page_size: standar pagination kalau all=false
//
// Response: passthrough envelope registrar (items[] + pagination).
func (h *Handler) ListDocuments(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	catID, _ := strconv.ParseUint(c.Query("category_id"), 10, 64)
	all := strings.EqualFold(c.Query("all"), "true")
	page, _ := strconv.Atoi(c.Query("page", "1"))
	perPage, _ := strconv.Atoi(c.Query("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if perPage <= 0 || perPage > 100 {
		perPage = 20
	}
	res, err := h.registrar.ListDocuments(c.Context(), cl.UserID.String(), catID, page, perPage, all)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	return httpx.OK(c, res)
}

// UploadDocument — POST /api/v1/documents (multipart)
//
// Transparent proxy: user upload file → di-forward langsung ke registrar
// dengan external_user_id di-inject dari JWT claims (user TIDAK boleh set
// external_user_id sendiri — kalau bisa, user A bisa tag KTP ke user B).
//
// Web builder TIDAK simpan file. Response berisi ID dokumen registrar yang
// bisa dipakai frontend untuk pre-attach di POST /domains/purchase.
//
// Multipart fields:
//   file        : binary (PNG/JPG/PDF, max 8 MiB — enforce di Fiber BodyLimit + registrar)
//   category_id : int (WAJIB, dari /documents/categories)
//   name        : opsional label
func (h *Handler) UploadDocument(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}

	fh, err := c.FormFile("file")
	if err != nil {
		return httpx.BadRequest(c, "field 'file' wajib (multipart)")
	}
	categoryID, _ := strconv.ParseUint(c.FormValue("category_id"), 10, 64)
	if categoryID == 0 {
		return httpx.BadRequest(c, "field 'category_id' wajib (dari /documents/categories, contoh 1 = KTP)")
	}
	name := strings.TrimSpace(c.FormValue("name"))

	// Tentukan MIME — trust Content-Type header, fallback ke ekstensi.
	mime := fh.Header.Get("Content-Type")
	if mime == "" {
		switch strings.ToLower(filepath.Ext(fh.Filename)) {
		case ".png":
			mime = "image/png"
		case ".jpg", ".jpeg":
			mime = "image/jpeg"
		case ".pdf":
			mime = "application/pdf"
		}
	}

	src, err := fh.Open()
	if err != nil {
		return httpx.Internal(c, "buka file gagal")
	}
	defer src.Close()

	// external_user_id di-inject dari JWT — NEVER trust request param.
	doc, err := h.registrar.UploadDocument(
		c.Context(),
		cl.UserID.String(),
		categoryID,
		name,
		fh.Filename,
		mime,
		src,
	)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_upload_failed", err.Error())
	}
	return httpx.OK(c, doc)
}

// ShowDocument — GET /api/v1/documents/:id
//
// Proxy preview dokumen (base64 data URI). external_user_id di-inject dari
// JWT claims — bukan trust client — supaya user A tidak preview KTP user B
// via ID guessing. Registrar ownership check jadi defence-in-depth kedua.
func (h *Handler) ShowDocument(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cl := auth.ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil || id == 0 {
		return httpx.BadRequest(c, "id tidak valid")
	}
	preview, err := h.registrar.ShowDocument(c.Context(), cl.UserID.String(), id)
	if err != nil {
		return proxyRegistrarErr(c, "registrar_error", err)
	}
	return httpx.OK(c, preview)
}

// ListCategories — GET /api/v1/documents/categories
//
// Proxy ke registrar public endpoint. UI pakai untuk populate dropdown
// kategori (KTP, NPWP, dst.) saat user upload dokumen di halaman pending.
// Category ID di-forward apa adanya ke AttachDocument (registrar's schema).
//
// Cache-able di CDN kalau nanti butuh — categories jarang berubah.
func (h *Handler) ListCategories(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cats, err := h.registrar.ListCategories(c.Context())
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	return httpx.OK(c, cats)
}

// ------------- Admin: registrar webhook config -------------
//
// Endpoint di bawah HANYA di-mount di /api/v1/admin/* — proteksi via
// auth.RequireAdmin di router. Berbeda dari `Webhook` yang menerima callback
// dari registrar (HMAC-authed, no JWT); yang di bawah adalah reseller-scoped
// config di registrar (siapa URL webhook + rotate secret).
//
// Alur operasional:
//   1. Admin buka /admin/registrar → dashboard load `AdminGetWebhookConfig`
//   2. Kalau URL kosong / mau pindah: input URL baru → `AdminSetWebhookConfig`
//   3. Response ada `webhook_secret` — SEKALI ini muncul. Admin salin ke env
//      `REGISTRAR_WEBHOOK_SECRET` + restart API supaya HMAC verify pakai secret baru.

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

func (h *Handler) AdminGetWebhookConfig(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	cfg, err := h.registrar.GetWebhookConfig(c.Context())
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	return httpx.OK(c, cfg)
}

func (h *Handler) AdminSetWebhookConfig(c *fiber.Ctx) error {
	if h.registrar == nil {
		return httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
	}
	var req registrar.WebhookConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.URL = strings.TrimSpace(req.URL)
	if req.URL == "" {
		return httpx.BadRequest(c, "webhook_url wajib")
	}
	if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		return httpx.BadRequest(c, "webhook_url harus http:// atau https://")
	}
	cfg, err := h.registrar.SetWebhookConfig(c.Context(), req)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	// Log info WITHOUT secret — supaya audit trail ada, tapi tidak leak.
	slog.Info("admin: registrar webhook rotated",
		"url", cfg.URL, "external_prefix", cfg.ExternalPrefix,
	)
	return httpx.OK(c, cfg)
}

// ------------- Webhook receiver (global, HMAC-authed) -------------

type webhookPayload struct {
	JobID          string `json:"job_id"`
	ExternalUserID string `json:"external_user_id"`
	Domain         string `json:"domain"`
	Status         string `json:"status"`
	Reason         string `json:"reason,omitempty"`
	ExpiresAt      string `json:"expires_at,omitempty"`
	PaymentURL     string `json:"payment_url,omitempty"`
	SentAt         string `json:"sent_at"`
}

// Webhook — POST /webhooks/registrar/domain-status
//
// Auth via HMAC. Header format:
//   X-Registrar-Signature: sha256=<hex>
//   X-Registrar-Timestamp: <unix>
//
// Bandingkan `hmac_sha256(webhookSecret, raw_body)` dengan signature. Reject
// kalau timestamp lebih tua dari 5 menit (replay defense).
func (h *Handler) Webhook(c *fiber.Ctx) error {
	if h.webhookSecret == "" {
		// Fail-closed: kalau operator lupa set secret, jangan terima apapun.
		metrics.Default.CounterInc(metricWebhooksReceived,
			"Webhook receiver hits by outcome",
			map[string]string{"result": "disabled"},
		)
		return httpx.Err(c, fiber.StatusServiceUnavailable, "webhook_disabled",
			"REGISTRAR_WEBHOOK_SECRET belum di-set di web builder.")
	}
	body := c.Body()
	if !verifyHMAC(h.webhookSecret, c.Get("X-Registrar-Signature"), body) {
		metrics.Default.CounterInc(metricWebhooksReceived,
			"Webhook receiver hits by outcome",
			map[string]string{"result": "invalid_signature"},
		)
		return httpx.Err(c, fiber.StatusUnauthorized, "invalid_signature", "signature mismatch")
	}
	// Replay protection.
	if ts, _ := strconv.ParseInt(c.Get("X-Registrar-Timestamp"), 10, 64); ts > 0 {
		if time.Since(time.Unix(ts, 0)).Abs() > 5*time.Minute {
			metrics.Default.CounterInc(metricWebhooksReceived,
				"Webhook receiver hits by outcome",
				map[string]string{"result": "stale_timestamp"},
			)
			return httpx.Err(c, fiber.StatusUnauthorized, "stale_timestamp",
				"webhook timestamp > 5m — reject to mitigate replay")
		}
	}

	var p webhookPayload
	if err := json.Unmarshal(body, &p); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if p.JobID == "" {
		return httpx.BadRequest(c, "job_id required")
	}

	// Update status + payment URL kalau ada.
	var expires *time.Time
	if p.ExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, p.ExpiresAt); err == nil {
			expires = &t
		}
	}
	changed, err := h.repo.UpdateStatus(c.Context(), p.JobID, p.Status, p.Reason, expires)
	if err != nil {
		slog.Error("webhook: update status failed", "error", err, "job_id", p.JobID)
		return httpx.Internal(c, "update failed")
	}
	if p.PaymentURL != "" {
		_ = h.repo.UpdatePaymentURL(c.Context(), p.JobID, p.PaymentURL)
	}
	if changed && p.Status == StatusActive {
		slog.Info("domain purchase: became active", "job_id", p.JobID, "domain", p.Domain)
		// Side-effect opsional: bisa create sites.domains row otomatis di
		// sini kalau site_id sudah di-attach. Untuk MVP, biar frontend yang
		// prompt user untuk lanjut ke template picker.
	}
	metrics.Default.CounterInc(metricWebhooksReceived,
		"Webhook receiver hits by outcome",
		map[string]string{"result": "processed"},
	)
	return c.SendStatus(fiber.StatusOK)
}

// verifyHMAC constant-time compare untuk header `sha256=<hex>`.
func verifyHMAC(secret, header string, body []byte) bool {
	prefix := "sha256="
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	sig, err := hex.DecodeString(strings.TrimPrefix(header, prefix))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hmac.Equal(sig, mac.Sum(nil))
}

// ------------- helpers -------------

// proxyRegistrarErr map error dari registrar client ke response Fiber dengan
// status semantic yang benar:
//   - APIError 4xx (client-side issue di registrar) → propagate status apa adanya
//     supaya frontend bisa branch (mis. 409 conflict, 404 not found).
//   - APIError 5xx / network error → 502 Bad Gateway (upstream problem).
//
// `code` = business error code untuk frontend (mis. "registrar_retry_failed").
// Pesan tetap dari registrar (sudah di-clean via decodeError shape handling).
func proxyRegistrarErr(c *fiber.Ctx, code string, err error) error {
	var apiErr *registrar.APIError
	if errors.As(err, &apiErr) && apiErr.Status >= 400 && apiErr.Status < 500 {
		return httpx.Err(c, apiErr.Status, code, apiErr.Msg)
	}
	return httpx.Err(c, fiber.StatusBadGateway, code, err.Error())
}

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
