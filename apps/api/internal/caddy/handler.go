package caddy

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/domains"
)

type Handler struct {
	repo                *domains.Repo
	rendererDefaultHost string
	appHost             string
	apiHost             string
}

func NewHandler(repo *domains.Repo, rendererDefault, appHost, apiHost string) *Handler {
	return &Handler{
		repo:                repo,
		rendererDefaultHost: rendererDefault,
		appHost:             appHost,
		apiHost:             apiHost,
	}
}

// Ask implements Caddy on_demand_tls.ask.
// Caddy will call this before issuing a cert for a host. Return 200 to allow.
func (h *Handler) Ask(c *fiber.Ctx) error {
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
