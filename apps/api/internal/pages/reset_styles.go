package pages

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/httpx"
)

// ResetBlockStyles — POST /api/v1/sites/:id/reset-block-styles
//
// Bulk clean semua block di semua page site: strip themeOverride + layout.bg
// dari BOTH draft tree_json AND published_tree_json. Kenapa dua-duanya:
//
//   - Editor pakai tree_json → kalau strip cuma di sini, editor keliatan clean
//     tapi renderer masih serve published snapshot lama yang punya override.
//   - Renderer pakai published_tree_json → wajib strip juga supaya visitor
//     lihat theme site yang baru tanpa harus user manual Publish per page.
//
// TIDAK strip padding/margin/align — itu spacing yang biasanya intentional
// per block, bukan warna yang harus konsisten dengan brand.
//
// Return count block yang di-modify + count page yang tersentuh.
func (h *Handler) ResetBlockStyles(c *fiber.Ctx) error {
	uid := auth.UserIDFrom(c)
	siteID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return httpx.BadRequest(c, "invalid site id")
	}
	// Ownership check — HasAccess balik ErrNotFound kalau bukan owner/editor.
	if _, err := h.sites.HasAccess(c.Context(), siteID, uid); err != nil {
		return httpx.NotFound(c, "site not found")
	}

	pagesTouched, blocksStripped, err := h.pages.ResetSiteBlockStyles(c.Context(), siteID)
	if err != nil {
		return httpx.Internal(c, "reset failed: "+err.Error())
	}

	// Purge cache — theme reset = perubahan visual site-wide.
	if h.purger != nil {
		h.purger.PurgeSite(c.Context(), siteID)
	}

	return httpx.OK(c, fiber.Map{
		"ok":              true,
		"pages_touched":   pagesTouched,
		"blocks_stripped": blocksStripped,
	})
}

// ResetSiteBlockStyles — Repo method: walk all pages of a site, strip
// themeOverride + layout.bg dari BOTH tree_json + published_tree_json.
// Atomic per-page: tree update di 1 UPDATE statement (draft + published
// dalam SET yang sama).
//
// Return (pages_touched, blocks_stripped, err).
func (r *Repo) ResetSiteBlockStyles(ctx context.Context, siteID uuid.UUID) (int, int, error) {
	// Fetch semua page: id + kedua tree column.
	rows, err := r.pool.Query(ctx, `
		SELECT id, tree_json, published_tree_json
		FROM pages
		WHERE site_id = $1
	`, siteID)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	type pageRow struct {
		ID        uuid.UUID
		Draft     json.RawMessage
		Published json.RawMessage
	}
	var pageList []pageRow
	for rows.Next() {
		var p pageRow
		var pub *json.RawMessage
		if err := rows.Scan(&p.ID, &p.Draft, &pub); err != nil {
			return 0, 0, err
		}
		if pub != nil {
			p.Published = *pub
		}
		pageList = append(pageList, p)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}

	var totalPages, totalBlocks int
	for _, p := range pageList {
		// Strip dari draft.
		newDraft, draftChanged, err := stripStylesFromTree(p.Draft)
		if err != nil {
			slog.Warn("reset-block-styles: parse draft failed",
				"page_id", p.ID, "error", err)
			continue
		}
		// Strip dari published (kalau ada).
		var newPub json.RawMessage
		var pubChanged int
		hasPub := len(p.Published) > 0
		if hasPub {
			newPub, pubChanged, err = stripStylesFromTree(p.Published)
			if err != nil {
				slog.Warn("reset-block-styles: parse published failed",
					"page_id", p.ID, "error", err)
			}
		}

		totalChange := draftChanged + pubChanged
		if totalChange == 0 {
			continue
		}

		// UPDATE atomic: kedua kolom dalam 1 query.
		// COALESCE pattern — kalau newPub nil (page belum pernah publish),
		// tetap NULL. Kalau ada value, apply.
		var pubArg any
		if hasPub && pubChanged > 0 {
			pubArg = newPub
		} else if hasPub {
			pubArg = p.Published // no change, keep as-is
		} else {
			pubArg = nil
		}

		_, err = r.pool.Exec(ctx, `
			UPDATE pages
			   SET tree_json = $2,
			       published_tree_json = $3,
			       updated_at = now(),
			       version = version + 1
			 WHERE id = $1
		`, p.ID, newDraft, pubArg)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				continue
			}
			slog.Warn("reset-block-styles: page update failed",
				"page_id", p.ID, "error", err)
			continue
		}

		totalPages++
		totalBlocks += totalChange
	}

	return totalPages, totalBlocks, nil
}

// stripStylesFromTree — walk block tree recursively. Untuk setiap block,
// hapus `themeOverride` (semua warna) + `layout.bg` (kalau ada). Return tree
// baru + jumlah block yang berubah.
//
// Tidak strip layout.pt/pr/pb/pl/mt/mb — spacing user-set intentional.
// Tidak strip block.props — value custom (mis. button label) tetap.
func stripStylesFromTree(raw json.RawMessage) (json.RawMessage, int, error) {
	if len(raw) == 0 {
		return raw, 0, nil
	}
	var tree map[string]any
	if err := json.Unmarshal(raw, &tree); err != nil {
		return nil, 0, err
	}
	blocksAny, ok := tree["blocks"]
	if !ok {
		return raw, 0, nil // no blocks, no change
	}
	blocks, ok := blocksAny.([]any)
	if !ok {
		return raw, 0, nil
	}
	count := stripBlocksRecursive(blocks)
	if count == 0 {
		return raw, 0, nil
	}
	tree["blocks"] = blocks
	out, err := json.Marshal(tree)
	if err != nil {
		return nil, 0, err
	}
	return out, count, nil
}

// stripBlocksRecursive — mutate in-place. Return jumlah block yang di-strip.
// Container block dengan `children` di-walk juga (mis. Container, Columns).
func stripBlocksRecursive(blocks []any) int {
	var count int
	for i := range blocks {
		b, ok := blocks[i].(map[string]any)
		if !ok {
			continue
		}
		blockChanged := false

		// Strip themeOverride entirely — user harus explicit set lagi kalau
		// mau override.
		if _, has := b["themeOverride"]; has {
			delete(b, "themeOverride")
			blockChanged = true
		}

		// Strip layout.bg saja (keep spacing).
		if lAny, has := b["layout"]; has {
			if l, ok := lAny.(map[string]any); ok {
				if _, has := l["bg"]; has {
					delete(l, "bg")
					blockChanged = true
				}
				// Kalau layout kosong setelah strip, hapus supaya JSON bersih.
				if len(l) == 0 {
					delete(b, "layout")
				}
			}
		}

		if blockChanged {
			count++
		}

		// Recursive walk children (container blocks).
		if childrenAny, has := b["children"]; has {
			if children, ok := childrenAny.([]any); ok {
				count += stripBlocksRecursive(children)
			}
		}
	}
	return count
}
