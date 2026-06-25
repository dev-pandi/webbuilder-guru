package snippets

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

type createReq struct {
	Name      string          `json:"name"`
	BlockType string          `json:"block_type"`
	Block     json.RawMessage `json:"block"`
}

type renameReq struct {
	Name string `json:"name"`
}

func (h *Handler) List(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	out, err := h.repo.ListByUser(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	return httpx.OK(c, out)
}

func (h *Handler) Create(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.BlockType = strings.TrimSpace(req.BlockType)
	if req.Name == "" {
		return httpx.BadRequest(c, "name required")
	}
	if req.BlockType == "" {
		return httpx.BadRequest(c, "block_type required")
	}
	// Sanity-check the payload is JSON. We don't enforce schema here — the
	// editor is the source of truth on what a BlockData looks like; storing
	// raw JSON lets us add new fields to BlockData without a schema migration.
	if len(req.Block) == 0 || !json.Valid(req.Block) {
		return httpx.BadRequest(c, "block payload required and must be valid JSON")
	}
	s, err := h.repo.Create(c.Context(), uid, req.Name, req.BlockType, req.Block)
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, s)
}

func (h *Handler) Rename(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req renameReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return httpx.BadRequest(c, "name required")
	}
	s, err := h.repo.Rename(c.Context(), id, uid, req.Name)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "snippet not found")
	}
	if err != nil {
		return httpx.Internal(c, "rename failed")
	}
	return httpx.OK(c, s)
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.Delete(c.Context(), id, uid); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "snippet not found")
		}
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}
