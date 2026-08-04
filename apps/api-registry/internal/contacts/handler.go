// Package contacts — HTTP handler untuk contact CRUD via provider.
package contacts

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/httpx"
	"github.com/webbuilder/api-registry/internal/provider"
)

type Handler struct {
	provider provider.Provider
}

func NewHandler(p provider.Provider) *Handler { return &Handler{provider: p} }

// Get — GET /v1/contacts/:id
func (h *Handler) Get(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return httpx.BadRequest(c, "contact_id harus integer")
	}
	res, err := h.provider.GetContact(c.Context(), id)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

// Update — PATCH /v1/contacts/:id
// Body: full contact payload (registry EPP contact:update replace-all).
func (h *Handler) Update(c *fiber.Ctx) error {
	id, err := strconv.ParseUint(c.Params("id"), 10, 64)
	if err != nil {
		return httpx.BadRequest(c, "contact_id harus integer")
	}
	var req provider.UpdateContactRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Name == "" || req.Email == "" {
		return httpx.BadRequest(c, "name + email wajib")
	}
	res, err := h.provider.UpdateContactByID(c.Context(), id, req)
	if err != nil {
		return mapErr(c, err)
	}
	return httpx.OK(c, res)
}

// UpdateByDomain — PATCH /v1/domains/:name/contact
// Update contact registrant untuk domain tertentu (semua role — registrant/
// admin/tech/billing di-set sama untuk reseller pattern).
func (h *Handler) UpdateByDomain(c *fiber.Ctx) error {
	name := c.Params("name")
	var req provider.UpdateContactRequest
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Name == "" || req.Email == "" {
		return httpx.BadRequest(c, "name + email wajib")
	}
	res, err := h.provider.UpdateDomainContact(c.Context(), name, req)
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
