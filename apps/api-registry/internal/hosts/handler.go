// Package hosts — nameserver / host management HTTP handlers.
package hosts

import (
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/httpx"
	"github.com/webbuilder/api-registry/internal/provider"
)

type Handler struct {
	provider provider.Provider
}

func NewHandler(p provider.Provider) *Handler { return &Handler{provider: p} }

// Get — GET /v1/domains/:name/nameservers
func (h *Handler) Get(c *fiber.Ctx) error {
	name := c.Params("name")
	res, err := h.provider.GetNameservers(c.Context(), name)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

// Update — POST /v1/domains/:name/nameservers
// Body: { nameservers: ["ns1.example.com", ...] } (min 2, max 13)
func (h *Handler) Update(c *fiber.Ctx) error {
	name := c.Params("name")
	var req struct {
		Nameservers []string `json:"nameservers"`
	}
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if len(req.Nameservers) < 2 {
		return httpx.BadRequest(c, "min 2 nameserver")
	}
	if len(req.Nameservers) > 13 {
		return httpx.BadRequest(c, "max 13 nameserver")
	}
	res, err := h.provider.UpdateNameservers(c.Context(), name, req.Nameservers)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

func mapErr(c *fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, provider.ErrNotFound):
		return httpx.NotFound(c, err.Error())
	case errors.Is(err, provider.ErrValidation):
		return httpx.BadRequest(c, err.Error())
	case errors.Is(err, provider.ErrCapabilityMissing):
		return httpx.NotImplemented(c, "capability_missing", err.Error())
	default:
		return httpx.BadGateway(c, err.Error())
	}
}
