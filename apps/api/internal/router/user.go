package router

import (
	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/auth"
)

// MountUser registers /api/v1/* — auth endpoints (anonymous) and user routes
// (authenticated, but no role check).
func MountUser(app *fiber.App, deps Deps) {
	v1 := app.Group("/api/v1")

	// Anonymous
	v1.Post("/auth/register", deps.Auth.Register)
	v1.Post("/auth/login", deps.Auth.Login)
	v1.Post("/auth/refresh", deps.Auth.Refresh)
	v1.Post("/auth/logout", deps.Auth.Logout)

	v1.Get("/templates", deps.Templates.List)
	v1.Get("/template-meta", deps.Templates.Meta)
	v1.Get("/templates/:slug", deps.Templates.Get)

	// Authenticated (any logged-in user)
	authed := v1.Group("/", auth.Required(deps.Issuer))

	authed.Get("/auth/me", deps.Auth.Me)

	// Sites
	authed.Get("/sites", deps.Sites.List)
	authed.Post("/sites", deps.Sites.Create)
	authed.Get("/sites/:id", deps.Sites.Get)
	authed.Patch("/sites/:id", deps.Sites.Update)
	authed.Delete("/sites/:id", deps.Sites.Delete)
	authed.Post("/sites/:id/publish", deps.Sites.Publish)
	authed.Post("/sites/:id/export", deps.Export.Export)
	authed.Get("/sites/:id/usage", deps.Usage.Current)
	authed.Get("/sites/:id/usage/history", deps.Usage.History)
	authed.Post("/sites/:id/apply-template", deps.Templates.ApplyToSite)
	authed.Post("/sites/from-template/:slug", deps.Templates.CreateSiteFromTemplate)

	// Pages
	authed.Get("/sites/:id/pages", deps.Pages.ListBySite)
	authed.Post("/sites/:id/pages", deps.Pages.CreateForSite)
	authed.Get("/pages/:id", deps.Pages.Get)
	authed.Patch("/pages/:id", deps.Pages.Update)
	authed.Post("/pages/:id/duplicate", deps.Pages.Duplicate)
	authed.Get("/pages/:id/versions", deps.Pages.ListVersions)
	authed.Post("/pages/:id/restore/:versionId", deps.Pages.RestoreVersion)
	authed.Delete("/pages/:id", deps.Pages.Delete)

	// Assets (only if storage initialised)
	if deps.Assets != nil {
		authed.Get("/sites/:id/assets", deps.Assets.ListBySite)
		authed.Post("/sites/:id/assets", deps.Assets.Upload)
	}

	// Domains
	authed.Get("/sites/:id/domains", deps.Domains.ListBySite)
	authed.Post("/sites/:id/domains", deps.Domains.Add)
	authed.Post("/domains/:id/verify", deps.Domains.Verify)
	authed.Delete("/domains/:id", deps.Domains.Delete)

	// Products
	authed.Get("/sites/:id/products", deps.Products.ListBySite)
	authed.Post("/sites/:id/products", deps.Products.Create)
	authed.Get("/products/:id", deps.Products.Get)
	authed.Patch("/products/:id", deps.Products.Update)
	authed.Delete("/products/:id", deps.Products.Delete)

	// Blog posts
	authed.Get("/sites/:id/blog-posts", deps.Blog.ListBySite)
	authed.Post("/sites/:id/blog-posts", deps.Blog.Create)
	authed.Get("/blog-posts/:id", deps.Blog.Get)
	authed.Patch("/blog-posts/:id", deps.Blog.Update)
	authed.Post("/blog-posts/:id/publish", deps.Blog.Publish)
	authed.Delete("/blog-posts/:id", deps.Blog.Delete)
}
