package router

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/pprof"
	"github.com/webbuilder/api/internal/auth"
)

// MountAdmin registers /api/v1/admin/* — requires JWT + role=admin.
func MountAdmin(app *fiber.App, deps Deps) {
	g := app.Group(
		"/api/v1/admin",
		auth.Required(deps.Issuer),
		auth.RequireAdmin(),
	)

	g.Get("/stats", deps.Admin.Stats)

	g.Get("/users", deps.Admin.ListUsers)
	g.Get("/users/:id", deps.Admin.GetUser)
	g.Get("/users/:id/sites", deps.Admin.ListUserSites)
	g.Patch("/users/:id/role", deps.Admin.UpdateUserRole)
	g.Delete("/users/:id", deps.Admin.DeleteUser)

	g.Get("/sites", deps.Admin.ListSites)
	g.Patch("/sites/:id/quota", deps.Admin.UpdateSiteQuota)
	g.Delete("/sites/:id", deps.Admin.DeleteSite)

	// Reseller management — approve/suspend applications + tabbed detail view.
	// Handler cek `authRepo == nil` → return 503 kalau feature belum di-wire.
	g.Get("/resellers", deps.Admin.ListResellers)
	g.Get("/resellers/:id", deps.Admin.GetReseller)
	g.Get("/resellers/:id/clients", deps.Admin.ListResellerClients)
	g.Get("/resellers/:id/agents", deps.Admin.ListResellerAgents)
	g.Get("/resellers/:id/domains", deps.Admin.ListResellerDomains)
	g.Post("/resellers/:id/approve", deps.Admin.ApproveReseller)
	g.Post("/resellers/:id/suspend", deps.Admin.SuspendReseller)

	// Admin observability untuk domain purchases (read-only cross-user).
	if deps.DomainPurchase != nil {
		g.Get("/registrar/purchases", deps.DomainPurchase.AdminListPurchases)
	}

	// Audit log — read-only viewer (Phase 7). Nil-safe.
	if deps.Audit != nil {
		g.Get("/audit-log", deps.Audit.List)
	}

	// Email log — debugging delivery. Nil-safe.
	if deps.EmailLog != nil {
		g.Get("/email-log", deps.EmailLog.List)
	}

	// Templates CRUD — Phase 1 admin template management (plan-admin-templates.md).
	// Nil-safe via handler.templates check (SetTemplates di main.go).
	g.Get("/templates", deps.Admin.ListTemplates)
	g.Get("/templates/:id", deps.Admin.GetTemplate)
	g.Post("/templates", deps.Admin.CreateTemplate)
	g.Patch("/templates/:id", deps.Admin.UpdateTemplate)
	g.Post("/templates/:id/publish", deps.Admin.PublishTemplate)
	g.Post("/templates/:id/archive", deps.Admin.ArchiveTemplate)
	g.Post("/templates/:id/duplicate", deps.Admin.DuplicateTemplate)
	g.Delete("/templates/:id", deps.Admin.DeleteTemplate)
	// Thumbnail upload — flat namespace, tidak butuh template_id (upload bisa
	// sebelum template dibuat). Handler nil-safe (503 kalau storage disabled).
	g.Post("/templates/thumbnail", deps.Admin.UploadTemplateThumbnail)

	// Pricing platform (Phase 3.10) — admin CRUD retail + wholesale per TLD.
	if deps.Pricing != nil {
		g.Get("/pricing/platform", deps.Pricing.AdminListPlatform)
		g.Post("/pricing/platform", deps.Pricing.AdminUpsertPlatform)
		g.Delete("/pricing/platform/:id", deps.Pricing.AdminDeletePlatform)
	}

	// Promos — admin CRUD kupon diskon.
	if deps.Promos != nil {
		g.Get("/promos", deps.Promos.AdminList)
		g.Post("/promos", deps.Promos.AdminCreate)
		g.Get("/promos/:id", deps.Promos.AdminGet)
		g.Patch("/promos/:id", deps.Promos.AdminUpdate)
		g.Delete("/promos/:id", deps.Promos.AdminDelete)
	}

	// Zones catalog (Phase 1 self-sufficient) — TLD supported + verification rules.
	if deps.Zones != nil {
		g.Get("/zones", deps.Zones.ListAdmin)
		g.Post("/zones", deps.Zones.Create)
		g.Patch("/zones/:id", deps.Zones.Update)
		g.Delete("/zones/:id", deps.Zones.Delete)
	}

	// System settings (Phase 1 self-sufficient) — key-value config store
	// (PPN rate, brand name, support contact). Semua admin-only.
	if deps.Settings != nil {
		g.Get("/settings", deps.Settings.List)
		g.Get("/settings/:key", deps.Settings.Get)
		g.Patch("/settings/:key", deps.Settings.Update)
	}

	// Payment methods (Phase 1 self-sufficient) — CRUD + toggle enable +
	// config credentials. Include semua config (unmasked) untuk admin.
	if deps.Payments != nil {
		g.Get("/payment-methods", deps.Payments.ListAdmin)
		g.Post("/payment-methods", deps.Payments.Create)
		g.Patch("/payment-methods/:id", deps.Payments.Update)
		g.Delete("/payment-methods/:id", deps.Payments.Delete)
	}

	// Invoices (Phase 1 self-sufficient) — list all + detail + PDF + manual
	// verify (mark-paid for manual_bank) + cancel.
	if deps.Invoices != nil {
		g.Get("/invoices", deps.Invoices.ListAdmin)
		g.Get("/invoices/:id", deps.Invoices.GetAdmin)
		g.Get("/invoices/:id/pdf", deps.Invoices.GetPDFAdmin)
		g.Post("/invoices/:id/mark-paid", deps.Invoices.MarkPaidAdmin)
		g.Post("/invoices/:id/cancel", deps.Invoices.CancelAdmin)
	}

	// Wallet local admin — manual adjustment (refund, credit promo, koreksi
	// bug). Full audit trail via ledger.
	if deps.WalletLocal != nil {
		g.Post("/wallet/adjust", deps.WalletLocal.AdminAdjust)
	}

	// Cloudflare configs — CRUD untuk auto-attach domain baru ke akun CF
	// (create zone → push NS ke registrar). Nil-safe kalau handler tidak dibuild.
	if deps.Cloudflare != nil {
		cf := g.Group("/cloudflare")
		cf.Get("/", deps.Cloudflare.List)
		cf.Post("/", deps.Cloudflare.Create)
		cf.Patch("/:id", deps.Cloudflare.Update)
		cf.Delete("/:id", deps.Cloudflare.Delete)
		cf.Post("/:id/default", deps.Cloudflare.SetDefault)
		cf.Post("/:id/verify", deps.Cloudflare.VerifyStored)
	}

	// pprof exposes detailed runtime data (heap profile can leak secrets in
	// strings, CPU profile blocks the process). Always behind admin + opt-in
	// via env so it's not on in default prod deployments.
	if deps.Cfg.PprofEnabled {
		g.Use("/debug/pprof", pprof.New(pprof.Config{Prefix: "/api/v1/admin"}))
	}
}
