package wallet_local

import (
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// Handler — user-facing wallet endpoints.
//
// Scope MVP:
//   - GET  /wallet/v2         — balance current
//   - GET  /wallet/v2/ledger  — history paginated
//
// Topup flow (POST /wallet/v2/topup) DEFERRED — butuh invoice + payment
// gateway integration (pattern sama dengan PurchaseV2). Untuk MVP, admin
// bisa credit manual via SQL atau via admin endpoint (belum di-implement).
type Handler struct {
	repo *Repo
}

func NewHandler(r *Repo) *Handler { return &Handler{repo: r} }

// --- GET /api/v1/wallet/v2 ---
func (h *Handler) GetBalance(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	b, err := h.repo.GetBalance(c.Context(), uid)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, b)
}

// --- GET /api/v1/wallet/v2/ledger?page=&limit= ---
func (h *Handler) ListLedger(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	if uid == uuid.Nil {
		return httpx.Unauthorized(c, "unauthenticated")
	}
	limit, _ := strconv.Atoi(c.Query("limit"))
	page, _ := strconv.Atoi(c.Query("page"))
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 50
	}
	offset := (page - 1) * limit
	items, err := h.repo.ListLedger(c.Context(), uid, limit, offset)
	if err != nil {
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, fiber.Map{"items": items, "page": page, "limit": limit})
}

// --- Admin endpoint: POST /api/v1/admin/wallet/v2/adjust ---
//
// Manual balance adjustment (audit trail via ledger). Butuh admin role
// (di-guard di router level). Untuk operator support case: refund manual,
// credit promo, koreksi bug.
type adjustReq struct {
	UserID string `json:"user_id"`
	Delta  int64  `json:"delta"`  // +credit atau -debit
	Reason string `json:"reason"` // required
	Note   string `json:"note,omitempty"`
}

// AdminAdjust — admin-only. Bebas + atau − asalkan hasil balance tidak
// negative (repo Debit enforce).
func (h *Handler) AdminAdjust(c *fiber.Ctx) error {
	var req adjustReq
	if err := c.BodyParser(&req); err != nil {
		return httpx.BadRequest(c, "invalid json")
	}
	uid, err := uuid.Parse(req.UserID)
	if err != nil {
		return httpx.BadRequest(c, "user_id bukan UUID valid")
	}
	if req.Delta == 0 {
		return httpx.BadRequest(c, "delta tidak boleh 0")
	}
	if req.Reason == "" {
		req.Reason = ReasonAdminAdjust
	}

	// Metadata: siapa admin + note.
	adminID := auth.UserIDFrom(c)
	metaJSON := []byte(`{}`)
	if req.Note != "" || adminID != uuid.Nil {
		// Build JSON manually — small object, avoid heavy encoding/json for MVP.
		metaJSON = buildAdminMeta(adminID, req.Note)
	}

	var entry *LedgerEntry
	if req.Delta > 0 {
		entry, err = h.repo.Credit(c.Context(), TopupInput{
			UserID:   uid,
			Amount:   req.Delta,
			Reason:   req.Reason,
			Metadata: metaJSON,
		})
	} else {
		entry, err = h.repo.Debit(c.Context(), DebitInput{
			UserID:   uid,
			Amount:   -req.Delta,
			Reason:   req.Reason,
			Metadata: metaJSON,
		})
	}
	if err != nil {
		if err == ErrInsufficient {
			return httpx.Err(c, fiber.StatusUnprocessableEntity, "insufficient", err.Error())
		}
		return httpx.Internal(c, err.Error())
	}
	return httpx.OK(c, entry)
}

// buildAdminMeta — encode admin_id + note ke JSON tanpa import
// encoding/json (small hand-rolled untuk avoid extra dependency).
// Safe untuk MVP karena input di-sanitize.
func buildAdminMeta(adminID uuid.UUID, note string) []byte {
	// Escape note untuk JSON string safety.
	escaped := escapeJSONString(note)
	if adminID == uuid.Nil {
		return []byte(`{"note":"` + escaped + `"}`)
	}
	return []byte(`{"admin_id":"` + adminID.String() + `","note":"` + escaped + `"}`)
}

func escapeJSONString(s string) string {
	out := make([]byte, 0, len(s))
	for _, c := range []byte(s) {
		switch c {
		case '"', '\\':
			out = append(out, '\\', c)
		case '\n':
			out = append(out, '\\', 'n')
		case '\r':
			out = append(out, '\\', 'r')
		case '\t':
			out = append(out, '\\', 't')
		default:
			if c < 0x20 {
				continue // drop control chars
			}
			out = append(out, c)
		}
	}
	return string(out)
}
