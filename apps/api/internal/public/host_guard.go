package public

// HostSiteGuard — defensive middleware yang cegah cross-tenant leak dengan
// verify site.id di URL match dengan Host header dari renderer.
//
// Skenario yang di-cover:
//   Renderer bug / bocor cache / typo → pass site.id dari domain A saat
//   render request untuk domain B. Sebelum guard ini: API happy return
//   data domain A (karena trust site.id URL param). Setelah guard: API
//   verify Host header renderer, kalau tidak match → 404 + log warning.
//
// Renderer wajib forward header `X-Renderer-Host` (dari `headers().get("host")`
// di Next.js server component). Kalau header tidak ada, guard PERMISIF —
// skip verification (backward compat + tools/curl yang manual test API tetap
// jalan). Guard hanya reject saat header PRESENT tapi MISMATCH.

import (
	"log/slog"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/sites"
)

const rendererHostHeader = "X-Renderer-Host"

// HostSiteGuard returns a Fiber middleware yang verify:
//   - `:id` URL param adalah UUID valid
//   - `X-Renderer-Host` header (kalau ada) resolve ke site.id yang sama
//     via sites.GetByHost
//
// Kalau site.id URL param tidak sama dengan hasil resolve dari Host header,
// return 404 (konsisten dengan "site not found" behavior — tidak leak info
// bahwa site.id valid tapi di domain lain).
func HostSiteGuard(repo *sites.Repo) fiber.Handler {
	return func(c *fiber.Ctx) error {
		idParam := c.Params("id")
		if idParam == "" {
			return c.Next() // route tanpa :id, guard tidak apply
		}
		siteID, err := uuid.Parse(idParam)
		if err != nil {
			return httpx.BadRequest(c, "invalid site id")
		}
		host := strings.ToLower(strings.TrimSpace(c.Get(rendererHostHeader)))
		if host == "" {
			// Header tidak ada — permisif (backward compat). Log info kalau
			// production seharusnya selalu ada header dari renderer.
			return c.Next()
		}
		// Strip port + case-normalize (host header bisa "domain.com:443").
		host = strings.SplitN(host, ":", 2)[0]
		resolved, err := repo.GetByHost(c.Context(), host)
		if err != nil {
			// Host tidak resolve → 404 (bisa jadi renderer resolve site via
			// path lain, tapi paling aman reject).
			slog.Warn("public host guard: host does not resolve to any site",
				"host", host, "requested_site_id", siteID.String())
			return httpx.NotFound(c, "site not found")
		}
		if resolved.ID != siteID {
			slog.Warn("public host guard: site_id mismatch — POTENTIAL CROSS-TENANT LEAK BLOCKED",
				"host", host,
				"host_resolves_to", resolved.ID.String(),
				"url_site_id", siteID.String(),
				"path", c.Path())
			return httpx.NotFound(c, "site not found")
		}
		return c.Next()
	}
}
