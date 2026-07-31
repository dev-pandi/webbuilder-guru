package webhooks

import (
	"encoding/json"
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api-registry/internal/httpx"
	"github.com/webbuilder/api-registry/internal/metrics"
)

// Handler — HTTP endpoint untuk terima webhook upstream + forward ke consumer.
type Handler struct {
	relay *Relay
}

func NewHandler(r *Relay) *Handler { return &Handler{relay: r} }

// Receive — POST /webhooks/registrar
//
// Endpoint PUBLIC (bukan di bawah /v1) — upstream registrar tidak pakai
// HMAC api-registry (mereka tidak tau secret kita). Sebagai gantinya:
//   1. Verify signature registrar-api via UpstreamSecret (payload authenticity)
//   2. Forward ke web builder dengan HMAC api-registry sendiri
//
// Response: 202 Accepted kalau semua sukses. 401 kalau signature invalid.
// 502 kalau forward gagal (registrar akan retry).
func (h *Handler) Receive(c *fiber.Ctx) error {
	body := c.Body()

	// Verify upstream signature.
	sig := c.Get("X-Signature") // registrar-api format: sha256=<hex>
	if sig == "" {
		// Alt header — beberapa provider pakai `X-Hub-Signature-256`.
		sig = c.Get("X-Hub-Signature-256")
	}
	ts := c.Get("X-Timestamp")

	if err := h.relay.VerifyUpstream(sig, ts, body); err != nil {
		metrics.Default.CounterInc("api_registry_webhooks_total",
			"Total webhook receipts by result",
			map[string]string{"result": "invalid_signature"})
		slog.Warn("webhook: verify failed", "err", err, "sig_present", sig != "")
		return httpx.Unauthorized(c, "signature invalid: "+err.Error())
	}

	// Parse minimal untuk audit — event_id / job_id / status.
	var meta struct {
		EventID string `json:"event_id"`
		JobID   string `json:"job_id"`
		Status  string `json:"status"`
	}
	_ = json.Unmarshal(body, &meta)
	slog.Info("webhook received",
		"event_id", meta.EventID,
		"job_id", meta.JobID,
		"status", meta.Status,
		"size_bytes", len(body),
	)

	// Kalau relay disabled (web builder URL kosong), cukup audit + 202.
	if !h.relay.Enabled() {
		metrics.Default.CounterInc("api_registry_webhooks_total", "",
			map[string]string{"result": "verified_no_forward"})
		return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
			"data": fiber.Map{"forwarded": false, "reason": "relay disabled"},
		})
	}

	// Forward ke web builder.
	code, respBody, err := h.relay.Forward(c.Context(), body)
	if err != nil {
		metrics.Default.CounterInc("api_registry_webhooks_total", "",
			map[string]string{"result": "forward_error"})
		slog.Error("webhook: forward failed", "err", err, "job_id", meta.JobID)
		return httpx.BadGateway(c, "forward gagal: "+err.Error())
	}
	if code >= 400 {
		metrics.Default.CounterInc("api_registry_webhooks_total", "",
			map[string]string{"result": "forward_reject", "status": itoa(code)})
		slog.Warn("webhook: web builder reject", "status", code, "body", respBody, "job_id", meta.JobID)
		return httpx.Err(c, code, "webbuilder_reject", respBody)
	}
	metrics.Default.CounterInc("api_registry_webhooks_total", "",
		map[string]string{"result": "forwarded"})
	return c.Status(fiber.StatusAccepted).JSON(fiber.Map{
		"data": fiber.Map{
			"forwarded":            true,
			"webbuilder_status":    code,
			"event_id":             meta.EventID,
		},
	})
}

func itoa(n int) string {
	// Kecil helper — hindari import strconv untuk 1 usecase.
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := [10]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
