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

// RequireReseller enforces role=reseller (status check dilakukan handler
// karena butuh DB lookup). Dipakai /api/v1/reseller/* routes.
func RequireReseller() fiber.Handler {
	return func(c *fiber.Ctx) error {
		cl := ClaimsFrom(c)
		if cl == nil {
			return httpx.Unauthorized(c, "missing claims")
		}
		if cl.Role != RoleReseller {
			return httpx.Forbidden(c, "reseller only")
		}
		return c.Next()
	}
}

// RequireAgent enforces role=agent. Dipakai /api/v1/agent/* routes.
func RequireAgent() fiber.Handler {
	return func(c *fiber.Ctx) error {
		cl := ClaimsFrom(c)
		if cl == nil {
			return httpx.Unauthorized(c, "missing claims")
		}
		if cl.Role != RoleAgent {
			return httpx.Forbidden(c, "agent only")
		}
		return c.Next()
	}
}

// RequireResellerOrAgent — kedua-duanya boleh (dipakai endpoint yang bisa
// di-invoke oleh reseller induk atau agent-nya, mis. create client).
func RequireResellerOrAgent() fiber.Handler {
	return func(c *fiber.Ctx) error {
		cl := ClaimsFrom(c)
		if cl == nil {
			return httpx.Unauthorized(c, "missing claims")
		}
		if cl.Role != RoleReseller && cl.Role != RoleAgent {
			return httpx.Forbidden(c, "reseller/agent only")
		}
		return c.Next()
	}
}
