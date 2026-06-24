package auth

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/mail"
)

type Handler struct {
	repo   *Repo
	issuer *TokenIssuer

	mailer     mail.Sender
	appBaseURL string

	resetTTL  time.Duration
	verifyTTL time.Duration
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
	link := h.appBaseURL + "/auth/verify-email?token=" + raw
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
	ok, err := VerifyPassword(req.Password, u.PasswordHash)
	if err != nil || !ok {
		return httpx.Unauthorized(c, "invalid credentials")
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
	out := meResp{ID: u.ID.String(), Email: u.Email, Name: u.Name, Role: u.Role}
	if u.EmailVerifiedAt != nil {
		s := u.EmailVerifiedAt.UTC().Format(time.RFC3339)
		out.EmailVerifiedAt = &s
	}
	return httpx.OK(c, out)
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
	link := h.appBaseURL + "/auth/reset?token=" + raw
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
	access, _, err := h.issuer.IssueAccess(u.ID, u.Email, u.Role)
	if err != nil {
		return httpx.Internal(c, "sign failed")
	}
	raw, hash, err := GenerateRefreshToken()
	if err != nil {
		return httpx.Internal(c, "token gen failed")
	}
	if err := h.repo.StoreRefreshToken(c.Context(), u.ID, hash, h.issuer.RefreshTTL()); err != nil {
		return httpx.Internal(c, "store refresh failed")
	}
	return c.Status(status).JSON(fiber.Map{"data": tokenResp{
		AccessToken: access, RefreshToken: raw, TokenType: "Bearer",
	}})
}
