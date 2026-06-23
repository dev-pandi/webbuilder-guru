package auth

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/httpx"
)

const ctxClaimsKey = "auth.claims"

// Required produces a middleware enforcing a valid Bearer token.
func Required(issuer *TokenIssuer) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			return httpx.Unauthorized(c, "missing bearer token")
		}
		raw := strings.TrimPrefix(h, "Bearer ")
		claims, err := issuer.Parse(raw)
		if err != nil {
			return httpx.Unauthorized(c, "invalid token")
		}
		c.Locals(ctxClaimsKey, claims)
		return c.Next()
	}
}

func ClaimsFrom(c *fiber.Ctx) *Claims {
	v, _ := c.Locals(ctxClaimsKey).(*Claims)
	return v
}

func UserIDFrom(c *fiber.Ctx) uuid.UUID {
	if cl := ClaimsFrom(c); cl != nil {
		return cl.UserID
	}
	return uuid.Nil
}

// RequireAdmin must follow Required(). It 403s if the JWT role isn't "admin".
func RequireAdmin() fiber.Handler {
	return func(c *fiber.Ctx) error {
		cl := ClaimsFrom(c)
		if cl == nil {
			return httpx.Unauthorized(c, "missing claims")
		}
		if cl.Role != "admin" {
			return httpx.Forbidden(c, "admin only")
		}
		return c.Next()
	}
}
