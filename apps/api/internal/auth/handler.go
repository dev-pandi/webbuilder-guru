package auth

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/httpx"
)

type Handler struct {
	repo   *Repo
	issuer *TokenIssuer
}

func NewHandler(repo *Repo, issuer *TokenIssuer) *Handler {
	return &Handler{repo: repo, issuer: issuer}
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
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
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
	return h.issueTokens(c, u, fiber.StatusCreated)
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
	return httpx.OK(c, meResp{ID: u.ID.String(), Email: u.Email, Name: u.Name, Role: u.Role})
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
