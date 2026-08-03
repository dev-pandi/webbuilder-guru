// self_sufficient_guard.go — helper untuk wallet legacy handlers.
// Kalau operator jalan di self-sufficient mode (REGISTRAR_API_URL=""),
// semua endpoint di package ini akan gagal karena registrar-api tidak
// dial-able. Guard convert ke 503 dengan hint alternatif V2.

package wallet

import (
	"github.com/gofiber/fiber/v2"

	"github.com/webbuilder/api/internal/httpx"
)

// requireLegacyBackend — return true kalau registrar-api tersedia. False
// + write 503 kalau tidak.
func (h *Handler) requireLegacyBackend(c *fiber.Ctx) bool {
	if h.registrar == nil {
		_ = httpx.Err(c, fiber.StatusServiceUnavailable, "registrar_disabled",
			"Registrar API belum dikonfigurasi.")
		return false
	}
	if !h.registrar.HasLegacyBackend() {
		_ = httpx.Err(c, fiber.StatusServiceUnavailable, "self_sufficient_mode",
			"Wallet legacy tidak tersedia di mode self-sufficient. Gunakan endpoint /api/v1/wallet/v2 (balance + ledger) — top-up flow belum di-migrate.")
		return false
	}
	return true
}
