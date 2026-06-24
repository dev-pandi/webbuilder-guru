package caddy

import (
	"crypto/subtle"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/domains"
)

type Handler struct {
	repo                *domains.Repo
	rendererDefaultHost string
	appHost             string
	apiHost             string
	askSecret           string // required when non-empty
}

func NewHandler(repo *domains.Repo, rendererDefault, appHost, apiHost, askSecret string) *Handler {
	return &Handler{
		repo:                repo,
		rendererDefaultHost: rendererDefault,
		appHost:             appHost,
		apiHost:             apiHost,
		askSecret:           askSecret,
	}
}

// Ask implements Caddy on_demand_tls.ask.
// Caddy must include the shared secret in the URL query (?secret=...).
// Returns 200 to allow cert issuance, 403 to deny.
//
// Security: without secret check, anyone reaching this endpoint could induce
// Caddy to issue/renew certs for arbitrary hostnames they don't control.
func (h *Handler) Ask(c *fiber.Ctx) error {
	// Validate shared secret first — fail closed.
	if h.askSecret != "" {
		got := c.Query("secret")
		if subtle.ConstantTimeCompare([]byte(got), []byte(h.askSecret)) != 1 {
			return c.SendStatus(fiber.StatusForbidden)
		}
	}

	host := strings.ToLower(strings.TrimSpace(c.Query("domain")))
	if host == "" {
		return c.SendStatus(fiber.StatusBadRequest)
	}
	if host == h.rendererDefaultHost || host == h.appHost || host == h.apiHost {
		return c.SendStatus(fiber.StatusOK)
	}
	// Subdomain of renderer default host (e.g. "<slug>.example.id") is allowed.
	if h.rendererDefaultHost != "" && strings.HasSuffix(host, "."+h.rendererDefaultHost) {
		return c.SendStatus(fiber.StatusOK)
	}
	ok, err := h.repo.IsAllowed(c.Context(), host)
	if err != nil {
		return c.SendStatus(fiber.StatusInternalServerError)
	}
	if !ok {
		return c.SendStatus(fiber.StatusForbidden)
	}
	return c.SendStatus(fiber.StatusOK)
}
