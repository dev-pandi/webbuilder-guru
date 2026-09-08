package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/mail"
)

// ContactSyncer — hook opsional yang propagate profile update ke registrar
// contact untuk semua domain aktif user. Interface bukan concrete type
// supaya package auth tidak import contactsync (menghindari circular dep).
// Nil = fitur disabled (skip silent).
type ContactSyncer interface {
	SyncUser(userID uuid.UUID)
}

type Handler struct {
	repo   *Repo
	issuer *TokenIssuer

	mailer     mail.Sender
	appBaseURL string

	resetTTL  time.Duration
	verifyTTL time.Duration

	contactSyncer ContactSyncer // nil = no propagation
}

// HandlerOptions lets main wire optional dependencies (mailer, app URL) without
// forcing every caller to construct them.
type HandlerOptions struct {
	Mailer     mail.Sender
	AppBaseURL string
	ResetTTL   time.Duration
	VerifyTTL  time.Duration
}

func NewHandler(repo *Repo, issuer *TokenIssuer, opt HandlerOptions) *Handler {
	if opt.ResetTTL == 0 {
		opt.ResetTTL = 1 * time.Hour
	}
	if opt.VerifyTTL == 0 {
		opt.VerifyTTL = 24 * time.Hour
	}
	return &Handler{
		repo:       repo,
		issuer:     issuer,
		mailer:     opt.Mailer,
		appBaseURL: strings.TrimRight(opt.AppBaseURL, "/"),
		resetTTL:   opt.ResetTTL,
		verifyTTL:  opt.VerifyTTL,
	}
}

// SetContactSyncer inject syncer opsional pasca-construction. Nil = disable.
func (h *Handler) SetContactSyncer(s ContactSyncer) { h.contactSyncer = s }

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type tokenResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
}

type meResp struct {
	ID              string  `json:"id"`
	Email           string  `json:"email"`
	Name            string  `json:"name"`
	Role            string  `json:"role"`
	EmailVerifiedAt *string `json:"email_verified_at,omitempty"`

	// Contact fields — always returned (empty string when unset) so the
	// frontend can render the profile form without checking `undefined`.
	PhoneNumber string `json:"phone_number"`
	Address     string `json:"address"`
	City        string `json:"city"`
	State       string `json:"state"`
	PostalCode  string `json:"postal_code"`
	Nik         string `json:"nik"` // wajib untuk beli domain .id

	// Reseller/agent fields — kosong string / null kalau bukan role terkait.
	// Frontend pakai untuk redirect post-login + tampilkan konteks reseller.
	ParentResellerID    *string `json:"parent_reseller_id,omitempty"`
	ResellerDisplayName string  `json:"reseller_display_name"`
	ResellerStatus      string  `json:"reseller_status"`
	ResellerTier        string  `json:"reseller_tier"`

	// Guru profile — spec §13, §25. Selalu returned (default "" / []) supaya
	// frontend tidak perlu cek undefined.
	SubjectOrField string       `json:"subject_or_field"`
	ProfileImage   string       `json:"profile_image"`
	BioShort       string       `json:"bio_short"`
	BioLong        string       `json:"bio_long"`
	HeroStatement  string       `json:"hero_statement"`
	Quote          string       `json:"quote"`
	SocialLinks    []socialLink `json:"social_links"`
}

func toMeResp(u *User) meResp {
	out := meResp{
		ID:                  u.ID.String(),
		Email:               u.Email,
		Name:                u.Name,
		Role:                u.Role,
		PhoneNumber:         u.PhoneNumber,
		Address:             u.Address,
		City:                u.City,
		State:               u.State,
		PostalCode:          u.PostalCode,
		Nik:                 u.Nik,
		ResellerDisplayName: u.ResellerDisplayName,
		ResellerStatus:      u.ResellerStatus,
		ResellerTier:        u.ResellerTier,
		SubjectOrField:      u.SubjectOrField,
		ProfileImage:        u.ProfileImage,
		BioShort:            u.BioShort,
		BioLong:             u.BioLong,
		HeroStatement:       u.HeroStatement,
		Quote:               u.Quote,
		SocialLinks:         []socialLink{},
	}
	// Deserialize JSONB. Corrupt data → return empty slice, jangan crash.
	if len(u.SocialLinksJSON) > 0 {
		var links []socialLink
		if err := json.Unmarshal(u.SocialLinksJSON, &links); err == nil {
			out.SocialLinks = links
		}
	}
	if u.EmailVerifiedAt != nil {
		s := u.EmailVerifiedAt.UTC().Format(time.RFC3339)
		out.EmailVerifiedAt = &s
	}
	if u.ParentResellerID != nil {
		s := u.ParentResellerID.String()
		out.ParentResellerID = &s
	}
	return out
}

func (h *Handler) Register(c *fiber.Ctx) error {
	var req registerReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(req.Email, "@") || len(req.Password) < 8 {
		return httpx.BadRequest(c, "email/password invalid (password min 8 chars)")
	}
	hash, err := HashPassword(req.Password)
	if err != nil {
		return httpx.Internal(c, "hash error")
	}
	u, err := h.repo.CreateUser(c.Context(), req.Email, hash, strings.TrimSpace(req.Name))
	if errors.Is(err, ErrEmailTaken) {
		return httpx.Conflict(c, "email already registered")
	}
	if err != nil {
		return httpx.Internal(c, "create user failed")
	}

	// Fire-and-forget verification email — never block signup on mail server.
	go h.dispatchVerifyEmail(u.ID, u.Email, u.Name)

	return h.issueTokens(c, u, fiber.StatusCreated)
}

// dispatchVerifyEmail builds and sends a verification email to a freshly
// created user. Safe to call after register or via the resend endpoint.
func (h *Handler) dispatchVerifyEmail(userID uuid.UUID, email, name string) {
	if h.mailer == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	raw, hash, err := GenerateOpaqueToken()
	if err != nil {
		slog.Error("verify email: token gen failed", "error", err)
		return
	}
	if err := h.repo.StoreEmailVerificationToken(ctx, userID, hash, h.verifyTTL); err != nil {
		slog.Error("verify email: store failed", "error", err)
		return
	}
	link := h.appBaseURL + "/verify-email?token=" + raw
	body := "Halo " + name + ",\n\n" +
		"Selamat datang di Web Builder! Konfirmasikan email Anda dengan membuka link berikut (berlaku 24 jam):\n\n" +
		link + "\n\n" +
		"Jika Anda tidak membuat akun, abaikan email ini.\n"
	if err := h.mailer.Send(ctx, mail.Message{
		To:      email,
		Subject: "Verifikasi email Web Builder",
		Body:    body,
	}); err != nil {
		slog.Error("verify email: mail send failed", "error", err)
	}
}

func (h *Handler) Login(c *fiber.Ctx) error {
	var req loginReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	u, err := h.repo.GetByEmail(c.Context(), req.Email)
	if errors.Is(err, ErrNotFound) {
		return httpx.Unauthorized(c, "invalid credentials")
	}
	if err != nil {
		return httpx.Internal(c, "lookup failed")
	}
	// Google-only account (never set a password). Steer them to Google login
	// instead of the generic "invalid credentials" so UMKM users understand why.
	if u.PasswordHash == "" {
		return httpx.Unauthorized(c,
			"akun ini dibuat via Google. Silakan login pakai Google, lalu set password dari halaman Lupa Password kalau ingin login pakai email/password.")
	}
	ok, err := VerifyPassword(req.Password, u.PasswordHash)
	if err != nil || !ok {
		return httpx.Unauthorized(c, "invalid credentials")
	}
	// Block login untuk reseller yang belum di-approve (pending) atau di-suspend.
	// Message specific supaya user tahu harus tunggu / contact admin.
	if lockErr := AllowLoginForRole(u); lockErr != nil {
		return httpx.Err(c, fiber.StatusForbidden, "role_locked", lockErr.Error())
	}
	return h.issueTokens(c, u, fiber.StatusOK)
}

func (h *Handler) Refresh(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.BodyParser(&req); err != nil || req.RefreshToken == "" {
		return httpx.BadRequest(c, "refresh_token required")
	}
	oldHash := HashRefreshToken(req.RefreshToken)
	newRaw, newHash, err := GenerateRefreshToken()
	if err != nil {
		return httpx.Internal(c, "token gen failed")
	}
	userID, err := h.repo.RotateRefreshToken(c.Context(), oldHash, newHash, h.issuer.RefreshTTL())
	if err != nil {
		return httpx.Unauthorized(c, "invalid refresh token")
	}
	u, err := h.repo.GetByID(c.Context(), userID)
	if err != nil {
		return httpx.Internal(c, "user lookup failed")
	}
	access, _, err := h.issuer.IssueAccess(u.ID, u.Email, u.Role)
	if err != nil {
		return httpx.Internal(c, "sign failed")
	}
	return httpx.OK(c, tokenResp{AccessToken: access, RefreshToken: newRaw, TokenType: "Bearer"})
}

func (h *Handler) Logout(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = c.BodyParser(&req)
	if req.RefreshToken != "" {
		_ = h.repo.RevokeRefreshToken(c.Context(), HashRefreshToken(req.RefreshToken))
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

func (h *Handler) Me(c *fiber.Ctx) error {
	cl := ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	u, err := h.repo.GetByID(c.Context(), cl.UserID)
	if err != nil {
		return httpx.NotFound(c, "user not found")
	}
	return httpx.OK(c, toMeResp(u))
}

// socialLink — 1 entry di array social_links. Platform bebas string
// (mis. "twitter", "instagram", "youtube") supaya renderer bisa pilih icon.
type socialLink struct {
	Platform string `json:"platform"`
	URL      string `json:"url"`
}

// updateMeReq mirrors ProfileUpdate — pointer fields so JSON absence means
// "don't touch", empty string means "clear this column".
type updateMeReq struct {
	Name        *string `json:"name,omitempty"`
	PhoneNumber *string `json:"phone_number,omitempty"`
	Address     *string `json:"address,omitempty"`
	City        *string `json:"city,omitempty"`
	State       *string `json:"state,omitempty"`
	PostalCode  *string `json:"postal_code,omitempty"`
	Nik         *string `json:"nik,omitempty"`
	// Guru profile — spec §13, §25. Semua opsional.
	SubjectOrField *string       `json:"subject_or_field,omitempty"`
	ProfileImage   *string       `json:"profile_image,omitempty"`
	BioShort       *string       `json:"bio_short,omitempty"`
	BioLong        *string       `json:"bio_long,omitempty"`
	HeroStatement  *string       `json:"hero_statement,omitempty"`
	Quote          *string       `json:"quote,omitempty"`
	// SocialLinks — nil = don't touch, [] = clear, [...] = replace.
	// Untuk deteksi "field dikirim atau tidak", pakai pointer.
	SocialLinks *[]socialLink `json:"social_links,omitempty"`
}

// UpdateMe patches the current user's profile. Fields not present in the JSON
// body are left untouched (COALESCE in SQL). Email and password are NOT edited
// here — email change needs re-verification, password has its own reset flow.
func (h *Handler) UpdateMe(c *fiber.Ctx) error {
	cl := ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	var req updateMeReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}

	// Trim whitespace on the fields the user is submitting. Empty string is
	// a valid "clear" value so we don't reject it — only spammy over-long
	// values get rejected below.
	trim := func(p *string) *string {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		return &v
	}
	req.Name = trim(req.Name)
	req.PhoneNumber = trim(req.PhoneNumber)
	req.Address = trim(req.Address)
	req.City = trim(req.City)
	req.State = trim(req.State)
	req.PostalCode = trim(req.PostalCode)
	req.Nik = trim(req.Nik)
	req.SubjectOrField = trim(req.SubjectOrField)
	req.ProfileImage = trim(req.ProfileImage)
	req.BioShort = trim(req.BioShort)
	req.BioLong = trim(req.BioLong)
	req.HeroStatement = trim(req.HeroStatement)
	req.Quote = trim(req.Quote)

	// Basic length caps — DB has TEXT so no hard limit, but reject obvious
	// abuse before writing. Matches the migration comments (255/128/32/16).
	if req.Name != nil && len(*req.Name) > 128 {
		return httpx.BadRequest(c, "name terlalu panjang (max 128)")
	}
	if req.PhoneNumber != nil && len(*req.PhoneNumber) > 32 {
		return httpx.BadRequest(c, "nomor HP terlalu panjang (max 32)")
	}
	if req.Address != nil && len(*req.Address) > 255 {
		return httpx.BadRequest(c, "alamat terlalu panjang (max 255)")
	}
	if req.City != nil && len(*req.City) > 128 {
		return httpx.BadRequest(c, "kota terlalu panjang (max 128)")
	}
	if req.State != nil && len(*req.State) > 128 {
		return httpx.BadRequest(c, "provinsi terlalu panjang (max 128)")
	}
	if req.PostalCode != nil && len(*req.PostalCode) > 16 {
		return httpx.BadRequest(c, "kode pos terlalu panjang (max 16)")
	}
	if req.Nik != nil && *req.Nik != "" {
		// NIK Indonesia = 16 digit numeric. Reject bentuk lain supaya registrar
		// tidak reject dengan pesan cryptic saat contact:create.
		if len(*req.Nik) != 16 {
			return httpx.BadRequest(c, "NIK harus 16 digit")
		}
		for _, r := range *req.Nik {
			if r < '0' || r > '9' {
				return httpx.BadRequest(c, "NIK harus angka saja")
			}
		}
	}

	// Cap length untuk field guru — bio_long relatif panjang, sisanya
	// judul/statement. Reject obvious abuse.
	if req.SubjectOrField != nil && len(*req.SubjectOrField) > 128 {
		return httpx.BadRequest(c, "bidang/mata pelajaran terlalu panjang (max 128)")
	}
	if req.ProfileImage != nil && len(*req.ProfileImage) > 2048 {
		return httpx.BadRequest(c, "URL foto profil terlalu panjang")
	}
	if req.BioShort != nil && len(*req.BioShort) > 280 {
		return httpx.BadRequest(c, "bio singkat terlalu panjang (max 280)")
	}
	if req.BioLong != nil && len(*req.BioLong) > 4000 {
		return httpx.BadRequest(c, "bio panjang terlalu panjang (max 4000)")
	}
	if req.HeroStatement != nil && len(*req.HeroStatement) > 500 {
		return httpx.BadRequest(c, "hero statement terlalu panjang (max 500)")
	}
	if req.Quote != nil && len(*req.Quote) > 500 {
		return httpx.BadRequest(c, "quote terlalu panjang (max 500)")
	}
	// Serialize social_links ke JSONB. Sanitize URL biar renderer tidak
	// tampilkan javascript: / data: (basic XSS guard).
	var socialJSON []byte
	if req.SocialLinks != nil {
		links := *req.SocialLinks
		if len(links) > 10 {
			return httpx.BadRequest(c, "maksimal 10 tautan sosial")
		}
		for i, l := range links {
			p := strings.ToLower(strings.TrimSpace(l.Platform))
			u := strings.TrimSpace(l.URL)
			if p == "" || len(p) > 40 {
				return httpx.BadRequest(c, "platform tautan sosial invalid")
			}
			if u != "" && !strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "http://") {
				return httpx.BadRequest(c, "URL tautan sosial harus http/https")
			}
			if len(u) > 500 {
				return httpx.BadRequest(c, "URL tautan sosial terlalu panjang")
			}
			links[i] = socialLink{Platform: p, URL: u}
		}
		b, err := json.Marshal(links)
		if err != nil {
			return httpx.BadRequest(c, "social_links invalid")
		}
		socialJSON = b
	}

	u, err := h.repo.UpdateProfile(c.Context(), cl.UserID, ProfileUpdate{
		Name:           req.Name,
		PhoneNumber:    req.PhoneNumber,
		Address:        req.Address,
		City:           req.City,
		State:          req.State,
		PostalCode:     req.PostalCode,
		Nik:            req.Nik,
		SubjectOrField: req.SubjectOrField,
		ProfileImage:   req.ProfileImage,
		BioShort:       req.BioShort,
		BioLong:        req.BioLong,
		HeroStatement:  req.HeroStatement,
		Quote:          req.Quote,
		SocialLinks:    socialJSON,
	})
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "user not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	// Propagate ke registrar contact untuk semua domain aktif user. Async
	// fire-and-forget — return response cepat, sync log-only kalau gagal.
	if h.contactSyncer != nil {
		h.contactSyncer.SyncUser(u.ID)
	}
	return httpx.OK(c, toMeResp(u))
}

// --- Password reset ---

type forgotReq struct {
	Email string `json:"email"`
}

// ForgotPassword always returns 200 to avoid revealing which emails are
// registered. If the email exists we send a reset link via the mailer; if not
// we silently no-op.
func (h *Handler) ForgotPassword(c *fiber.Ctx) error {
	var req forgotReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(email, "@") {
		return httpx.BadRequest(c, "email invalid")
	}

	go h.dispatchPasswordReset(email)

	return httpx.OK(c, fiber.Map{
		"ok":      true,
		"message": "Jika email terdaftar, link reset password sudah dikirim.",
	})
}

// dispatchPasswordReset runs in a goroutine so the HTTP response time is
// constant regardless of whether the email exists (timing-attack mitigation).
func (h *Handler) dispatchPasswordReset(email string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	u, err := h.repo.GetByEmail(ctx, email)
	if errors.Is(err, ErrNotFound) {
		return
	}
	if err != nil {
		slog.Error("password reset: user lookup failed", "error", err)
		return
	}

	raw, hash, err := GenerateOpaqueToken()
	if err != nil {
		slog.Error("password reset: token gen failed", "error", err)
		return
	}
	if err := h.repo.StorePasswordResetToken(ctx, u.ID, hash, h.resetTTL); err != nil {
		slog.Error("password reset: store failed", "error", err)
		return
	}
	if h.mailer == nil {
		slog.Warn("password reset: no mailer configured — token discarded")
		return
	}
	link := h.appBaseURL + "/reset?token=" + raw
	body := "Halo " + u.Name + ",\n\n" +
		"Kami menerima permintaan reset password untuk akun Anda.\n" +
		"Klik link berikut untuk mengatur password baru (berlaku 1 jam):\n\n" +
		link + "\n\n" +
		"Jika Anda tidak meminta ini, abaikan email ini — password Anda tidak berubah.\n"
	if err := h.mailer.Send(ctx, mail.Message{
		To:      u.Email,
		Subject: "Reset password Web Builder",
		Body:    body,
	}); err != nil {
		slog.Error("password reset: mail send failed", "error", err)
	}
}

type resetReq struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

func (h *Handler) ResetPassword(c *fiber.Ctx) error {
	var req resetReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Token == "" || len(req.NewPassword) < 8 {
		return httpx.BadRequest(c, "token/password invalid (password min 8 chars)")
	}
	hash, err := HashPassword(req.NewPassword)
	if err != nil {
		return httpx.Internal(c, "hash error")
	}
	if _, err := h.repo.ConsumePasswordResetToken(c.Context(), HashOpaqueToken(req.Token), hash); err != nil {
		return httpx.BadRequest(c, "token tidak valid atau sudah kadaluarsa")
	}
	return httpx.OK(c, fiber.Map{"ok": true, "message": "Password berhasil direset. Silakan login dengan password baru."})
}

// --- Email verification ---

// RequestEmailVerification (re)sends the verification email to the logged-in user.
func (h *Handler) RequestEmailVerification(c *fiber.Ctx) error {
	cl := ClaimsFrom(c)
	if cl == nil {
		return httpx.Unauthorized(c, "no claims")
	}
	u, err := h.repo.GetByID(c.Context(), cl.UserID)
	if err != nil {
		return httpx.NotFound(c, "user not found")
	}
	if u.EmailVerifiedAt != nil {
		return httpx.OK(c, fiber.Map{"ok": true, "already_verified": true})
	}
	if h.mailer == nil {
		return httpx.Internal(c, "mailer not configured")
	}
	go h.dispatchVerifyEmail(u.ID, u.Email, u.Name)
	return httpx.OK(c, fiber.Map{"ok": true})
}

type verifyEmailReq struct {
	Token string `json:"token"`
}

func (h *Handler) ConfirmEmailVerification(c *fiber.Ctx) error {
	var req verifyEmailReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Token == "" {
		return httpx.BadRequest(c, "token required")
	}
	if _, err := h.repo.ConsumeEmailVerificationToken(c.Context(), HashOpaqueToken(req.Token)); err != nil {
		return httpx.BadRequest(c, "token tidak valid atau sudah kadaluarsa")
	}
	return httpx.OK(c, fiber.Map{"ok": true, "message": "Email berhasil diverifikasi."})
}

func (h *Handler) issueTokens(c *fiber.Ctx, u *User, status int) error {
	access, raw, err := h.MintTokensFor(c.Context(), u)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return c.Status(status).JSON(fiber.Map{"data": tokenResp{
		AccessToken: access, RefreshToken: raw, TokenType: "Bearer",
	}})
}

// MintTokensFor issues an access + refresh token pair for the given user and
// persists the refresh token. Exposed so other flows (OAuth callback) can
// reuse the exact same JWT/refresh pipeline without duplicating logic.
func (h *Handler) MintTokensFor(ctx context.Context, u *User) (access, refresh string, err error) {
	access, _, err = h.issuer.IssueAccess(u.ID, u.Email, u.Role)
	if err != nil {
		return "", "", err
	}
	raw, hash, err := GenerateRefreshToken()
	if err != nil {
		return "", "", err
	}
	if err := h.repo.StoreRefreshToken(ctx, u.ID, hash, h.issuer.RefreshTTL()); err != nil {
		return "", "", err
	}
	return access, raw, nil
}
