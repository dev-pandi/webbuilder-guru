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
	g.Patch("/users/:id/role", deps.Admin.UpdateUserRole)
	g.Delete("/users/:id", deps.Admin.DeleteUser)

	g.Get("/sites", deps.Admin.ListSites)
	g.Patch("/sites/:id/quota", deps.Admin.UpdateSiteQuota)
	g.Delete("/sites/:id", deps.Admin.DeleteSite)

	// Reseller management — approve/suspend applications.
	// Handler cek `authRepo == nil` → return 503 kalau feature belum di-wire.
	g.Get("/resellers", deps.Admin.ListResellers)
	g.Get("/resellers/:id", deps.Admin.GetReseller)
	g.Post("/resellers/:id/approve", deps.Admin.ApproveReseller)
	g.Post("/resellers/:id/suspend", deps.Admin.SuspendReseller)

	// Registrar webhook config — reseller-scoped di registrar, tapi dari sisi
	// web builder ini pengaturan operator (bukan per-user). Hanya di-mount
	// kalau DomainPurchase handler aktif (nil-safe = registrar disabled).
	if deps.DomainPurchase != nil {
		g.Get("/registrar/webhook", deps.DomainPurchase.AdminGetWebhookConfig)
		g.Post("/registrar/webhook", deps.DomainPurchase.AdminSetWebhookConfig)
		g.Get("/registrar/purchases", deps.DomainPurchase.AdminListPurchases)
	}

	// Audit log — read-only viewer (Phase 7). Nil-safe.
	if deps.Audit != nil {
		g.Get("/audit-log", deps.Audit.List)
	}

	// Pricing platform (Phase 3.10) — admin CRUD retail + wholesale per TLD.
	if deps.Pricing != nil {
		g.Get("/pricing/platform", deps.Pricing.AdminListPlatform)
		g.Post("/pricing/platform", deps.Pricing.AdminUpsertPlatform)
		g.Delete("/pricing/platform/:id", deps.Pricing.AdminDeletePlatform)
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
