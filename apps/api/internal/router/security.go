package router

import "github.com/gofiber/fiber/v2"

// SecurityHeaders returns a middleware that injects a baseline set of security
// headers on every response. Cheap (just header writes) and defense-in-depth
// against common browser-side attacks.
//
// Headers chosen for our threat model:
//   - X-Content-Type-Options: nosniff      — prevent MIME sniffing (e.g. text/plain → JS).
//   - X-Frame-Options: DENY                — block iframe embedding (clickjacking).
//   - Referrer-Policy: ...                 — don't leak full URL to third parties.
//   - Permissions-Policy: ...              — disable browser APIs we don't use.
//   - Strict-Transport-Security (prod)     — force HTTPS for 1 year.
//
// Content-Security-Policy is intentionally NOT set here yet: a strict CSP
// requires allowlisting Google Fonts, MinIO/S3 origins, embed iframes
// (YouTube/Maps), etc. Add as a follow-up after auditing third-party origins.
func SecurityHeaders(production bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy",
			"camera=(), microphone=(), geolocation=(), interest-cohort=()")
		c.Set("X-XSS-Protection", "0") // explicitly disable legacy XSS filter

		if production {
			// Tell browsers to use HTTPS for 1 year. Caddy handles the actual
			// redirect; this header makes the policy sticky on the client side.
			c.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		return c.Next()
	}
}
