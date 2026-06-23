package sites

import (
	"encoding/json"
	"errors"
	"regexp"
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

var slugRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$`)

type createReq struct {
	Slug       string          `json:"slug"`
	Name       string          `json:"name"`
	TemplateID *uuid.UUID      `json:"template_id"`
	Theme      json.RawMessage `json:"theme"`
}

type updateReq struct {
	Name   *string         `json:"name"`
	Theme  json.RawMessage `json:"theme"`
	Status *string         `json:"status"`
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
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.Name = strings.TrimSpace(req.Name)
	if !slugRe.MatchString(req.Slug) {
		return httpx.BadRequest(c, "slug must be lowercase a-z, 0-9, hyphen (2-40 chars)")
	}
	if req.Name == "" {
		return httpx.BadRequest(c, "name required")
	}
	s, err := h.repo.Create(c.Context(), uid, req.Slug, req.Name, req.TemplateID, req.Theme)
	if errors.Is(err, ErrSlugTaken) {
		return httpx.Conflict(c, "slug already taken")
	}
	if errors.Is(err, ErrLimitReached) {
		return httpx.Forbidden(c, "site limit reached")
	}
	if err != nil {
		return httpx.Internal(c, "create failed")
	}
	return httpx.Created(c, s)
}

func (h *Handler) Get(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	s, err := h.repo.GetOwned(c.Context(), id, uid)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	}
	if err != nil {
		return httpx.Internal(c, "load failed")
	}
	return httpx.OK(c, s)
}

func (h *Handler) Update(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	var req updateReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	if req.Status != nil {
		switch *req.Status {
		case "draft", "published", "archived":
		default:
			return httpx.BadRequest(c, "invalid status")
		}
	}
	s, err := h.repo.Update(c.Context(), id, uid, req.Name, req.Theme, req.Status)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, s)
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.Delete(c.Context(), id, uid); errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	} else if err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

func (h *Handler) Publish(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	st := "published"
	s, err := h.repo.Update(c.Context(), id, uid, nil, nil, &st)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "site not found")
	}
	if err != nil {
		return httpx.Internal(c, "publish failed")
	}
	return httpx.OK(c, s)
}
