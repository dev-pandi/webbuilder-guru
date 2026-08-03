// Package paymentwh — HTTP receiver untuk webhook payment gateway.
//
// Flow:
//  1. Provider (Midtrans/Paylabs) POST ke `/webhooks/payment/:code`.
//  2. Registry.Get(code) → Gateway instance dengan config latest.
//  3. Gateway.HandleWebhook verify signature + parse event.
//  4. Lookup invoice by event.OrderID (invoice.id UUID string).
//  5. Kalau event.Status=success → invoices.MarkPaid (idempotent).
//  6. Return 200 OK — provider retry loop selesai.
//
// Idempotency: MarkPaid sudah idempotent di repo. Kalau webhook di-retry
// (network glitch, provider retry policy), tidak double-process.
//
// Auth: TIDAK pakai JWT. Signature verify di Gateway impl per-code (HMAC/
// public key, dsb.). Rate limit per source IP di router layer.
package paymentwh

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/httpx"
	"github.com/webbuilder/api/internal/invoices"
	"github.com/webbuilder/api/internal/metrics"
	"github.com/webbuilder/api/internal/paymentgw"
)

const metricWebhooksReceived = "payment_webhooks_total"

// Callback — dipanggil setelah invoice mark-paid supaya downstream (mis.
// domain_purchase) bisa trigger EPP execute. Optional (nil = skip).
//
// Signature: (ctx, invoice) — invoice sudah dalam status paid. Caller
// yang decide apa yang di-trigger (biasanya lookup metadata.job_id lalu
// enqueue registration job).
type Callback func(ctx context.Context, inv *invoices.Invoice) error

// Handler — webhook dispatcher.
type Handler struct {
	registry    *paymentgw.Registry
	invoicesSvc *invoices.Service
	invoicesRepo *invoices.Repo
	onPaid      Callback // nil-safe
}

func NewHandler(reg *paymentgw.Registry, svc *invoices.Service, repo *invoices.Repo) *Handler {
	return &Handler{registry: reg, invoicesSvc: svc, invoicesRepo: repo}
}

// SetPaidCallback — inject downstream trigger (mis. domain_purchase).
func (h *Handler) SetPaidCallback(fn Callback) { h.onPaid = fn }

// POST /webhooks/payment/:code — main entry.
//
// Return 200 untuk semua "sudah handle" case (verified + processed,
// verified + duplicate ignore, verified + status non-success).
// Return 4xx untuk hard invalid: bad signature, missing code, unknown code.
// Return 5xx untuk internal errors — provider retry akan re-hit.
func (h *Handler) Receive(c *fiber.Ctx) error {
	code := c.Params("code")
	if code == "" {
		return httpx.BadRequest(c, "code kosong")
	}

	gw, err := h.registry.Get(c.Context(), code)
	if err != nil {
		if errors.Is(err, paymentgw.ErrGatewayNotFound) || errors.Is(err, paymentgw.ErrGatewayDisabled) {
			// 404 supaya provider dashboard tampil error jelas.
			metrics.Default.CounterInc(metricWebhooksReceived,
				"Payment webhook hits by outcome",
				map[string]string{"code": code, "result": "unknown_gateway"},
			)
			return httpx.NotFound(c, fmt.Sprintf("gateway %q tidak dikenal atau disabled", code))
		}
		metrics.Default.CounterInc(metricWebhooksReceived,
			"Payment webhook hits by outcome",
			map[string]string{"code": code, "result": "config_error"},
		)
		return httpx.Internal(c, err.Error())
	}

	// Collect headers → gateway impl decide mana yang di-read (Midtrans
	// pakai body signature, tidak header; Paylabs pakai header signature).
	headers := map[string]string{}
	c.Request().Header.VisitAll(func(k, v []byte) {
		headers[string(k)] = string(v)
	})

	event, err := gw.HandleWebhook(c.Context(), headers, c.Body())
	if err != nil {
		if errors.Is(err, paymentgw.ErrInvalidSignature) {
			metrics.Default.CounterInc(metricWebhooksReceived,
				"Payment webhook hits by outcome",
				map[string]string{"code": code, "result": "invalid_signature"},
			)
			return httpx.Unauthorized(c, "signature tidak valid")
		}
		if errors.Is(err, paymentgw.ErrUnsupported) {
			// Manual gateway (bank transfer) tidak punya webhook — provider
			// callback ke sini seharusnya tidak terjadi. Log + return 404.
			slog.Warn("payment webhook: unsupported gateway",
				"code", code, "path", c.Path())
			metrics.Default.CounterInc(metricWebhooksReceived,
				"Payment webhook hits by outcome",
				map[string]string{"code": code, "result": "unsupported"},
			)
			return httpx.NotFound(c, "gateway tidak dukung webhook")
		}
		slog.Error("payment webhook: parse error",
			"code", code, "error", err)
		metrics.Default.CounterInc(metricWebhooksReceived,
			"Payment webhook hits by outcome",
			map[string]string{"code": code, "result": "parse_error"},
		)
		return httpx.Internal(c, err.Error())
	}

	slog.Info("payment webhook received",
		"code", code, "order_id", event.OrderID,
		"status", event.Status, "amount", event.Amount,
		"provider_ref", event.ProviderRefID,
	)

	// Non-success events (pending/failed/expired) — log + 200. Kita tidak
	// mark invoice pending (sudah unpaid), tidak mark failed karena user
	// bisa retry payment. Kalau expire, scheduler yang handle (bukan webhook).
	if event.Status != paymentgw.StatusSuccess {
		metrics.Default.CounterInc(metricWebhooksReceived,
			"Payment webhook hits by outcome",
			map[string]string{"code": code, "result": string(event.Status)},
		)
		return c.SendStatus(fiber.StatusOK)
	}

	// Success — parse OrderID (invoice UUID) + MarkPaid.
	invID, err := uuid.Parse(event.OrderID)
	if err != nil {
		// Order ID tidak valid UUID — mungkin provider punya beda schema.
		// Log tapi return 200 supaya provider tidak retry-loop.
		slog.Error("payment webhook: order_id bukan UUID",
			"code", code, "order_id", event.OrderID, "error", err)
		metrics.Default.CounterInc(metricWebhooksReceived,
			"Payment webhook hits by outcome",
			map[string]string{"code": code, "result": "invalid_order_id"},
		)
		return c.SendStatus(fiber.StatusOK)
	}

	paidAt := event.PaidAt
	if paidAt.IsZero() {
		paidAt = time.Now()
	}
	if err := h.invoicesSvc.MarkPaid(c.Context(), invID, paidAt, event.ProviderRefID); err != nil {
		if errors.Is(err, invoices.ErrNotFound) {
			// Race: webhook tiba sebelum SavePaymentRef selesai (unlikely
			// karena SavePaymentRef sync di request path, tapi safety).
			slog.Warn("payment webhook: invoice tidak ada",
				"code", code, "invoice_id", invID, "order_id", event.OrderID)
			metrics.Default.CounterInc(metricWebhooksReceived,
				"Payment webhook hits by outcome",
				map[string]string{"code": code, "result": "invoice_missing"},
			)
			// Return 200 — kalau invoice memang tidak ada, retry tidak akan
			// menemukan. Provider dashboard show success (data konsisten dari
			// sisi mereka).
			return c.SendStatus(fiber.StatusOK)
		}
		slog.Error("payment webhook: mark-paid gagal",
			"code", code, "invoice_id", invID, "error", err)
		metrics.Default.CounterInc(metricWebhooksReceived,
			"Payment webhook hits by outcome",
			map[string]string{"code": code, "result": "mark_paid_error"},
		)
		return httpx.Internal(c, err.Error())
	}

	// Trigger callback ke downstream (domain_purchase). Best-effort — kalau
	// callback error, invoice tetap sudah paid. Downstream ownership untuk
	// retry (mis. via reconciliation job).
	if h.onPaid != nil {
		inv, err := h.invoicesRepo.GetWithLines(c.Context(), invID)
		if err == nil {
			if cbErr := h.onPaid(c.Context(), inv); cbErr != nil {
				slog.Error("payment webhook: paid callback gagal",
					"code", code, "invoice_id", invID, "error", cbErr)
				// Return 200 tetap — invoice paid statusnya sukses,
				// downstream trigger di-track terpisah.
			}
		}
	}

	metrics.Default.CounterInc(metricWebhooksReceived,
		"Payment webhook hits by outcome",
		map[string]string{"code": code, "result": "processed"},
	)
	return c.SendStatus(fiber.StatusOK)
}
