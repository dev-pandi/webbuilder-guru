// self_sufficient_guard.go — helper untuk legacy handler yang butuh
// registrar-api backend (BaseURL set). Kalau operator jalan di mode
// self-sufficient (REGISTRAR_API_URL=""), tanpa guard ini call ke registrar
// method akan error "connection refused" — confusing untuk end-user.
//
// Guard convert ke response 503 dengan pesan clear + hint V2 alternative.

package domain_purchase

import (
	"github.com/gofiber/fiber/v2"

	"github.com/webbuilder/api/internal/httpx"
)

// requireLegacyBackend — return true (handler lanjut) kalau registrar-api
// legacy backend configured. Return false + set 503 response kalau tidak.
// Caller yang decide apa yang di-render:
//
//	if !h.requireLegacyBackend(c, "V2 alternative: POST /domains/purchase/v2") {
//	    return nil // response sudah di-write
//	}
func (h *Handler) requireLegacyBackend(c *fiber.Ctx, v2Hint string) bool {
	if h.registrar == nil {
		_ = httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API tidak dikonfigurasi.")
		return false
	}
	if !h.registrar.HasLegacyBackend() {
		msg := "Endpoint ini legacy — tidak tersedia di mode self-sufficient (REGISTRAR_API_URL kosong)."
		if v2Hint != "" {
			msg += " " + v2Hint
		}
		_ = httpx.Err(c, fiber.StatusServiceUnavailable, "self_sufficient_mode", msg)
		return false
	}
	return true
}
