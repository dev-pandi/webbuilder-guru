package router

import (
	"github.com/gofiber/fiber/v2"
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
}
