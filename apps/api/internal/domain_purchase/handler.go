package domain_purchase

import (
	"bytes"
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
	"github.com/webbuilder/api/internal/registrar"
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
	Domain string `json:"domain"`
}

type checkResp struct {
	Domain    string      `json:"domain"`
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
	Domain        string `json:"domain"`
	Years         int    `json:"years"`
	PaymentMethod string `json:"payment_method"`
	ReturnURL     string `json:"return_url"`
	PromoCode     string `json:"promo_code,omitempty"` // forwarded ke registrar
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

	// Unified reseller check: availability + price + zone flags dalam 1 call.
	avail, price, err := h.registrar.CheckDomain(c.Context(), req.Domain)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	out := checkResp{Domain: req.Domain, Available: avail.Available, Reason: avail.Reason}
	if price != nil {
		out.Price = &priceBlock{
			Currency: price.Currency,
			Register: float64(price.Register),
			Renew:    float64(price.Renew),
			Transfer: float64(price.Transfer),
		}
	}
	if avail.Zone != nil {
		out.Zone = &zoneBlock{
			Name:            avail.Zone.Name,
			RequireDocument: avail.Zone.RequireDocument,
			AutoApproved:    avail.Zone.AutoApproved,
			NikAutoApproved: avail.Zone.NikAutoApproved,
		}
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
	// NIK wajib untuk domain .id (Kemenkominfo regulation). Kalau user belum
	// isi, arahkan ke halaman profil. Field NIK sudah tersedia sejak migrasi 0012.
	if isIDDomain(req.Domain) && strings.TrimSpace(user.Nik) == "" {
		return httpx.Err(c, fiber.StatusBadRequest, "nik_required_for_id",
			"Domain .id wajib butuh NIK. Isi NIK dulu di /settings/profile lalu coba lagi.")
	}

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
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_retry_failed", err.Error())
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

	// perPage 100 = cukup untuk hampir semua user reseller kecil-menengah.
	// Kalau ada user dengan > 100 domain, tambahkan looping page di future.
	list, err := h.registrar.ListDomains(c.Context(), cl.UserID.String(), 1, 100)
	if err != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", err.Error())
	}
	if list == nil {
		return httpx.OK(c, fiber.Map{"scanned": 0, "updated": 0})
	}

	var updated int
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
		changed, err := h.repo.UpdateStatus(c.Context(), it.JobID, it.Status, "", expires)
		if err != nil {
			slog.Warn("sync: update failed", "job_id", it.JobID, "error", err)
			continue
		}
		if changed {
			updated++
		}
	}
	return httpx.OK(c, fiber.Map{
		"scanned": len(list.Items),
		"updated": updated,
	})
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
		return httpx.Err(c, fiber.StatusServiceUnavailable, "webhook_disabled",
			"REGISTRAR_WEBHOOK_SECRET belum di-set di web builder.")
	}
	body := c.Body()
	if !verifyHMAC(h.webhookSecret, c.Get("X-Registrar-Signature"), body) {
		return httpx.Err(c, fiber.StatusUnauthorized, "invalid_signature", "signature mismatch")
	}
	// Replay protection.
	if ts, _ := strconv.ParseInt(c.Get("X-Registrar-Timestamp"), 10, 64); ts > 0 {
		if time.Since(time.Unix(ts, 0)).Abs() > 5*time.Minute {
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

// isIDDomain deteksi TLD .id (termasuk .co.id, .ac.id, dst.).
// Case-insensitive; strip trailing "." kalau ada FQDN.
func isIDDomain(domain string) bool {
	d := strings.ToLower(strings.TrimRight(strings.TrimSpace(domain), "."))
	return strings.HasSuffix(d, ".id")
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
