package router

import (
	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/auth"
)

// MountUser registers /api/v1/* — auth endpoints (anonymous) and user routes
// (authenticated, but no role check).
//
// Rate limiting strategy:
//   - /auth/login + /auth/register + /auth/refresh: IP-based (no claims yet)
//   - Authenticated mutations: user-based, applied after auth.Required
//   - Uploads: tighter user-based limit (separate bucket)
//   - Reads (GET): no limit — cheap, idempotent
func MountUser(app *fiber.App, deps Deps) {
	v1 := app.Group("/api/v1")

	// --- Anonymous + rate-limited per IP ---
	v1.Post("/auth/register", RateLimitIP(registerPerWindow, registerWindow), deps.Auth.Register)
	v1.Post("/auth/login", RateLimitIP(loginPerWindow, loginWindow), deps.Auth.Login)
	v1.Post("/auth/refresh", RateLimitIP(refreshPerWindow, refreshWindow), deps.Auth.Refresh)
	v1.Post("/auth/logout", deps.Auth.Logout)

	// Password reset + email verification. Both are anonymous endpoints (token
	// in body). IP-limited to throttle bulk-account abuse.
	v1.Post("/auth/password/forgot",
		RateLimitIP(passwordForgotPerWindow, passwordForgotWindow), deps.Auth.ForgotPassword)
	v1.Post("/auth/password/reset",
		RateLimitIP(passwordResetPerWindow, passwordResetWindow), deps.Auth.ResetPassword)
	v1.Post("/auth/email/verify",
		RateLimitIP(emailVerifyPerWindow, emailVerifyWindow), deps.Auth.ConfirmEmailVerification)

	v1.Get("/templates", deps.Templates.List)
	v1.Get("/template-meta", deps.Templates.Meta)
	v1.Get("/templates/:slug", deps.Templates.Get)

	// --- Authenticated (any logged-in user) ---
	authed := v1.Group("/", auth.Required(deps.Issuer))

	authed.Get("/auth/me", deps.Auth.Me)
	authed.Post("/auth/email/resend",
		RateLimitUser(emailResendPerWindow, emailResendWindow), deps.Auth.RequestEmailVerification)

	// Generic mutation budget — applied to all write endpoints below via a
	// sub-group so we don't re-declare per-route. Reads (GET) skip this.
	mutateLimit := RateLimitUser(mutationPerWindow, mutationWindow)

	// Sites
	authed.Get("/sites", deps.Sites.List)
	authed.Post("/sites", mutateLimit, deps.Sites.Create)
	authed.Get("/sites/:id", deps.Sites.Get)
	authed.Patch("/sites/:id", mutateLimit, deps.Sites.Update)
	authed.Delete("/sites/:id", mutateLimit, deps.Sites.Delete)
	authed.Post("/sites/:id/publish", mutateLimit, deps.Sites.Publish)
	authed.Post("/sites/:id/export", mutateLimit, deps.Export.Export)
	authed.Get("/sites/:id/usage", deps.Usage.Current)
	authed.Get("/sites/:id/usage/history", deps.Usage.History)
	authed.Post("/sites/:id/apply-template", mutateLimit, deps.Templates.ApplyToSite)
	authed.Post("/sites/from-template/:slug", mutateLimit, deps.Templates.CreateSiteFromTemplate)

	// Pages
	authed.Get("/sites/:id/pages", deps.Pages.ListBySite)
	authed.Post("/sites/:id/pages", mutateLimit, deps.Pages.CreateForSite)
	authed.Get("/pages/:id", deps.Pages.Get)
	authed.Patch("/pages/:id", mutateLimit, deps.Pages.Update)
	authed.Post("/pages/:id/duplicate", mutateLimit, deps.Pages.Duplicate)
	authed.Get("/pages/:id/versions", deps.Pages.ListVersions)
	authed.Post("/pages/:id/restore/:versionId", mutateLimit, deps.Pages.RestoreVersion)
	authed.Post("/pages/:id/publish", mutateLimit, deps.Pages.Publish)
	authed.Post("/pages/:id/unpublish", mutateLimit, deps.Pages.Unpublish)
	authed.Post("/pages/:id/preview-token", mutateLimit, deps.Pages.PreviewToken)
	authed.Delete("/pages/:id", mutateLimit, deps.Pages.Delete)

	// Assets — separate, tighter limit (uploads are expensive).
	if deps.Assets != nil {
		uploadLimit := RateLimitUser(uploadPerWindow, uploadWindow)
		authed.Get("/sites/:id/assets", deps.Assets.ListBySite)
		authed.Post("/sites/:id/assets", uploadLimit, deps.Assets.Upload)
	}

	// Domains
	authed.Get("/sites/:id/domains", deps.Domains.ListBySite)
	authed.Post("/sites/:id/domains", mutateLimit, deps.Domains.Add)
	authed.Post("/domains/:id/verify", mutateLimit, deps.Domains.Verify)
	authed.Delete("/domains/:id", mutateLimit, deps.Domains.Delete)

	// Products
	authed.Get("/sites/:id/products", deps.Products.ListBySite)
	authed.Post("/sites/:id/products", mutateLimit, deps.Products.Create)
	authed.Get("/products/:id", deps.Products.Get)
	authed.Patch("/products/:id", mutateLimit, deps.Products.Update)
	authed.Delete("/products/:id", mutateLimit, deps.Products.Delete)

	// Blog posts
	authed.Get("/sites/:id/blog-posts", deps.Blog.ListBySite)
	authed.Post("/sites/:id/blog-posts", mutateLimit, deps.Blog.Create)
	authed.Get("/blog-posts/:id", deps.Blog.Get)
	authed.Patch("/blog-posts/:id", mutateLimit, deps.Blog.Update)
	authed.Post("/blog-posts/:id/publish", mutateLimit, deps.Blog.Publish)
	authed.Delete("/blog-posts/:id", mutateLimit, deps.Blog.Delete)
}
