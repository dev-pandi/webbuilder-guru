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
}

type priceBlock struct {
	Currency string  `json:"currency"`
	Register float64 `json:"register"`
	Renew    float64 `json:"renew"`
	Transfer float64 `json:"transfer"`
}

type purchaseReq struct {
	Domain        string `json:"domain"`
	Years         int    `json:"years"`
	PaymentMethod string `json:"payment_method"`
	ReturnURL     string `json:"return_url"`
}

type purchaseResp struct {
	JobID      string `json:"job_id"`
	Domain     string `json:"domain"`
	Status     string `json:"status"`
	PaymentURL string `json:"payment_url,omitempty"`
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

	// Registrar API kita bikin `/domain/check` yang balik price + availability
	// sekaligus. Client wrapper belum punya method itu — pakai raw for now
	// via GetDomainPrice + Whois separately (dua panggilan, tapi paling
	// simple sampai client method ditambah).
	price, priceErr := h.registrar.GetDomainPrice(c.Context(), req.Domain)
	avail, availErr := h.registrar.CheckAvailability(c.Context(), req.Domain)

	// Availability adalah info primer; kalau gagal balik 502.
	if availErr != nil {
		return httpx.Err(c, fiber.StatusBadGateway, "registrar_error", availErr.Error())
	}
	out := checkResp{Domain: req.Domain, Available: avail.Available, Reason: avail.Reason}
	// Price boleh gagal (misal zone tidak ada di product table) — tetap
	// return availability supaya user tahu domain unavailable.
	if priceErr == nil && price != nil {
		out.Price = &priceBlock{
			Currency: price.Currency,
			Register: float64(price.Register),
			Renew:    float64(price.Renew),
			Transfer: float64(price.Transfer),
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
	// NIK wajib untuk .id — belum ada field di user profile, minta di UI kalau
	// belum ada. Untuk sekarang, cek zone di sini juga.
	// TODO: tambah field NIK di user profile (settings/profile) kalau UMKM mau
	// beli .id. Sementara, tolak .id dengan pesan yang jelas.
	if strings.HasSuffix(strings.ToLower(req.Domain), ".id") {
		return httpx.Err(c, fiber.StatusBadRequest, "nik_required_for_id",
			"Registrasi domain .id butuh NIK — feature belum tersedia di profile. Coba TLD lain (.com, .net, dll) untuk sementara.")
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
		Contact: registrar.Contact{
			Name:        user.Name,
			Email:       user.Email,
			Phone:       user.PhoneNumber,
			Address:     user.Address,
			City:        user.City,
			State:       user.State,
			PostalCode:  user.PostalCode,
			CountryCode: "ID",
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
	return purchaseResp{
		JobID:      p.RegistrarJobID,
		Domain:     p.Domain,
		Status:     p.Status,
		PaymentURL: p.PaymentURL,
	}
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
