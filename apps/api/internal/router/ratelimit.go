package router

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// Rate limit budgets — generous enough for legitimate use, tight enough to
// blunt credential stuffing / spam upload / API scraping.
//
// Storage: Fiber's default in-memory map. Fine for single-instance prod.
// For multi-instance, swap with gofiber/storage/redis (the Redis service is
// already in docker-compose).
const (
	// Auth endpoints — per-IP. Prevents brute force.
	loginPerWindow    = 10               // 10 attempts
	loginWindow       = 5 * time.Minute  // per 5 minutes per IP
	registerPerWindow = 5                // 5 signups
	registerWindow    = 60 * time.Minute // per hour per IP
	refreshPerWindow  = 60               // tokens rotate quickly when active
	refreshWindow    = 60 * time.Minute

	// Authenticated mutations — per-user.
	uploadPerWindow   = 60               // 60 uploads
	uploadWindow      = 60 * time.Minute // per hour per user
	mutationPerWindow = 300              // 300 writes
	mutationWindow    = 60 * time.Second // per minute per user (generous burst)
)

// RateLimitIP keys by client IP. Use for unauthenticated endpoints (login,
// register, refresh, password reset, etc.) where there's no user identity yet.
func RateLimitIP(max int, window time.Duration) fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        max,
		Expiration: window,
		KeyGenerator: func(c *fiber.Ctx) string {
			// Prefer X-Forwarded-For first IP if behind trusted proxy (Caddy).
			if xff := c.Get("X-Forwarded-For"); xff != "" {
				return "ip:" + firstIP(xff)
			}
			return "ip:" + c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return httpx.Err(c, fiber.StatusTooManyRequests, "rate_limited",
				"Terlalu banyak request. Coba lagi beberapa menit.")
		},
	})
}

// RateLimitUser keys by authenticated user ID, falling back to IP if claims
// not present (defense in depth — should not happen behind auth.Required).
// Use AFTER auth.Required middleware.
func RateLimitUser(max int, window time.Duration) fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        max,
		Expiration: window,
		KeyGenerator: func(c *fiber.Ctx) string {
			if cl := auth.ClaimsFrom(c); cl != nil {
				return "uid:" + cl.UserID.String()
			}
			return "ip:" + c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return httpx.Err(c, fiber.StatusTooManyRequests, "rate_limited",
				"Terlalu banyak request. Mohon tunggu sebentar.")
		},
	})
}

func firstIP(xff string) string {
	for i := 0; i < len(xff); i++ {
		if xff[i] == ',' {
			return xff[:i]
		}
	}
	return xff
}
