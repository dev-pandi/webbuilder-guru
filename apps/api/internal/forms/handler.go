package forms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/mail"
	"github.com/webbuilder/api/internal/sites"
)

// Handler menjembatani user CRUD form + submissions listing. Public submit
// endpoint terpisah (Handler.Submit) — no JWT + rate-limited di router.
type Handler struct {
	repo   *Repo
	sites  *sites.Repo
	mailer mail.Sender // nil OK — kalau nil, notification email di-skip
}

func NewHandler(repo *Repo, s *sites.Repo, mailer mail.Sender) *Handler {
	return &Handler{repo: repo, sites: s, mailer: mailer}
}

// -------- User-facing (JWT + ownership) --------

// ListBySite — GET /api/v1/sites/:id/forms
func (h *Handler) ListBySite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	// Ownership check via sites repo — sama pattern dengan pages/products.
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		if errors.Is(err, sites.ErrNotFound) {
			return httpx.NotFound(c, "site not found")
		}
		return httpx.Internal(c, "site lookup failed")
	}
	items, err := h.repo.ListBySite(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	if items == nil {
		items = []Form{}
	}
	return httpx.OK(c, items)
}

type createReq struct {
	Name        string      `json:"name"`
	Kind        string      `json:"kind,omitempty"`
	Fields      []FormField `json:"fields"`
	NotifyEmail string      `json:"notify_email,omitempty"`
}

func (h *Handler) CreateForSite(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	if _, err := h.sites.GetOwned(c.Context(), siteID, uid); err != nil {
		if errors.Is(err, sites.ErrNotFound) {
			return httpx.NotFound(c, "site not found")
		}
		return httpx.Internal(c, "site lookup failed")
	}
	var req createReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	req.Name = strings.TrimSpace(req.Name)
	req.NotifyEmail = strings.TrimSpace(req.NotifyEmail)
	if req.Name == "" {
		return httpx.BadRequest(c, "name wajib")
	}
	if len(req.Fields) == 0 {
		// Auto-default berdasarkan kind — sensible starter.
		req.Fields = defaultFieldsFor(req.Kind)
	}
	f := &Form{
		SiteID:      siteID,
		Name:        req.Name,
		Kind:        req.Kind,
		Fields:      req.Fields,
		NotifyEmail: req.NotifyEmail,
	}
	if err := h.repo.Create(c.Context(), f); err != nil {
		return httpx.Internal(c, "create failed: "+err.Error())
	}
	return httpx.Created(c, f)
}

type updateReq struct {
	Name        *string      `json:"name,omitempty"`
	NotifyEmail *string      `json:"notify_email,omitempty"`
	Fields      *[]FormField `json:"fields,omitempty"`
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
	trim := func(p *string) *string {
		if p == nil {
			return nil
		}
		v := strings.TrimSpace(*p)
		return &v
	}
	f, err := h.repo.Update(c.Context(), id, uid, trim(req.Name), trim(req.NotifyEmail), req.Fields)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "form not found")
	}
	if err != nil {
		return httpx.Internal(c, "update failed")
	}
	return httpx.OK(c, f)
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid id")
	}
	if err := h.repo.Delete(c.Context(), id, uid); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "form not found")
		}
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// ListSubmissions — GET /api/v1/forms/:id/submissions?page=&page_size=
func (h *Handler) ListSubmissions(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	formID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid form id")
	}
	if _, err := h.repo.GetOwned(c.Context(), formID, uid); err != nil {
		if errors.Is(err, ErrNotFound) {
			return httpx.NotFound(c, "form not found")
		}
		return httpx.Internal(c, "form lookup failed")
	}
	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", "50"))
	if page < 1 {
		page = 1
	}
	offset := (page - 1) * pageSize
	items, total, err := h.repo.ListSubmissions(c.Context(), formID, pageSize, offset)
	if err != nil {
		return httpx.Internal(c, "list failed")
	}
	if items == nil {
		items = []Submission{}
	}
	return httpx.OK(c, fiber.Map{
		"items": items,
		"total": total,
		"page":  page,
	})
}

func (h *Handler) DeleteSubmission(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	subID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid submission id")
	}
	// Ambil form_id dari submission → cek ownership form via GetOwned.
	formID, err := h.repo.FormIDBySubmission(c.Context(), subID)
	if err != nil {
		return httpx.NotFound(c, "submission not found")
	}
	if _, err := h.repo.GetOwned(c.Context(), formID, uid); err != nil {
		return httpx.NotFound(c, "submission not found")
	}
	if err := h.repo.DeleteSubmission(c.Context(), subID); err != nil {
		return httpx.Internal(c, "delete failed")
	}
	return httpx.OK(c, fiber.Map{"ok": true})
}

// -------- Public submit (no JWT, rate-limited di router) --------

// Submit — POST /public/forms/:id/submit
//
// Body: JSON arbitrary (client kirim {field_name: value, ...}). Backend
// validate required fields per form schema, simpan raw JSON di data_json,
// trigger email notify kalau notify_email di-set.
//
// Rate limit: aplikasikan di router (per IP) untuk cegah spam.
// Anti-spam basic: honeypot field "_hp" — kalau non-empty, silent success
// (bot fill semua field include hidden ones).
func (h *Handler) Submit(c *fiber.Ctx) error {
	formID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid form id")
	}
	form, err := h.repo.GetByID(c.Context(), formID)
	if errors.Is(err, ErrNotFound) {
		return httpx.NotFound(c, "form not found")
	}
	if err != nil {
		return httpx.Internal(c, "form lookup failed")
	}

	var payload map[string]any
	if err := c.BodyParser(&payload); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}

	// Honeypot: bot mengisi semua input; user asli tidak lihat "_hp" field
	// (di-hide di renderer via CSS). Return 200 silent supaya bot tidak
	// tahu bahwa mereka di-block.
	if hp, ok := payload["_hp"].(string); ok && strings.TrimSpace(hp) != "" {
		slog.Info("form submit: honeypot triggered", "form_id", formID, "ip", c.IP())
		return httpx.OK(c, fiber.Map{"ok": true})
	}
	delete(payload, "_hp")

	// Validate required fields — schema-driven.
	for _, field := range form.Fields {
		if !field.Required {
			continue
		}
		val, ok := payload[field.Name]
		if !ok {
			return httpx.BadRequest(c, "field '"+field.Label+"' wajib")
		}
		if s, ok := val.(string); ok && strings.TrimSpace(s) == "" {
			return httpx.BadRequest(c, "field '"+field.Label+"' tidak boleh kosong")
		}
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return httpx.BadRequest(c, "gagal serialize payload")
	}
	sub := &Submission{
		FormID:    formID,
		Data:      data,
		SourceIP:  c.IP(),
		UserAgent: c.Get("User-Agent"),
	}
	if err := h.repo.CreateSubmission(c.Context(), sub); err != nil {
		return httpx.Internal(c, "save failed: "+err.Error())
	}

	// Best-effort email notify — jangan block response kalau mail fail.
	if form.NotifyEmail != "" && h.mailer != nil {
		go func(f Form, s Submission) {
			body := renderNotifyEmail(f, s)
			msg := mail.Message{
				To:      f.NotifyEmail,
				Subject: fmt.Sprintf("Submission baru dari form: %s", f.Name),
				Body:    body,
			}
			// Detach dari request ctx (goroutine survive setelah request return).
			// Timeout 15s cukup untuk SMTP.
			ctx, cancel := context.WithTimeout(context.Background(), 15_000_000_000)
			defer cancel()
			if err := h.mailer.Send(ctx, msg); err != nil {
				slog.Warn("form notify: send failed", "error", err, "form_id", f.ID)
			}
		}(*form, *sub)
	}

	return httpx.OK(c, fiber.Map{"ok": true})
}

// -------- Helpers --------

func defaultFieldsFor(kind string) []FormField {
	switch kind {
	case KindNewsletter:
		return []FormField{
			{Name: "email", Label: "Email", Type: "email", Required: true, Placeholder: "you@example.com"},
		}
	case KindCustom:
		return []FormField{}
	default: // contact
		return []FormField{
			{Name: "name", Label: "Nama", Type: "text", Required: true},
			{Name: "email", Label: "Email", Type: "email", Required: true},
			{Name: "message", Label: "Pesan", Type: "textarea", Required: true},
		}
	}
}

func renderNotifyEmail(f Form, s Submission) string {
	// Format submission data sebagai plain text.
	var parsed map[string]any
	_ = json.Unmarshal(s.Data, &parsed)

	var b strings.Builder
	fmt.Fprintf(&b, "Submission baru dari form: %s\n\n", f.Name)
	fmt.Fprintf(&b, "Waktu: %s\n", s.SubmittedAt.Format("2006-01-02 15:04:05 MST"))
	if s.SourceIP != "" {
		fmt.Fprintf(&b, "IP: %s\n", s.SourceIP)
	}
	fmt.Fprintln(&b, "\n--- Data ---")
	for _, field := range f.Fields {
		val := ""
		if v, ok := parsed[field.Name]; ok {
			val = fmt.Sprint(v)
		}
		fmt.Fprintf(&b, "%s: %s\n", field.Label, val)
	}
	fmt.Fprintln(&b, "\n— Web Builder")
	return b.String()
}
