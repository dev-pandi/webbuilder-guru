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

	// pprof exposes detailed runtime data (heap profile can leak secrets in
	// strings, CPU profile blocks the process). Always behind admin + opt-in
	// via env so it's not on in default prod deployments.
	if deps.Cfg.PprofEnabled {
		g.Use("/debug/pprof", pprof.New(pprof.Config{Prefix: "/api/v1/admin"}))
	}
}
