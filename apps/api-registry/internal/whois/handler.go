// Package whois — proxy WHOIS lookup via provider.
package whois

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

// Whois — GET /v1/whois?domain=<name>
func (h *Handler) Whois(c *fiber.Ctx) error {
	name := c.Query("domain")
	if name == "" {
		return httpx.BadRequest(c, "query 'domain' wajib")
	}
	res, err := h.provider.Whois(c.Context(), name)
	if err != nil {
		switch {
		case errors.Is(err, provider.ErrNotFound):
			return httpx.NotFound(c, "domain tidak terdaftar")
		case errors.Is(err, provider.ErrValidation):
			return httpx.BadRequest(c, err.Error())
		default:
			return httpx.BadGateway(c, err.Error())
		}
	}
	return httpx.OK(c, res)
}
