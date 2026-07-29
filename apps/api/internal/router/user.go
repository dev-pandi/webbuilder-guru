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

	// Reseller signup — anonymous. Rate-limit sama dengan register (cegah
	// bulk-account abuse). Admin approve nanti sebelum bisa login.
	v1.Post("/auth/reseller/apply",
		RateLimitIP(registerPerWindow, registerWindow), deps.Auth.ResellerApply)

	// Invitation accept — anonymous (auth via token). Dipakai agent/client
	// terima invite dari reseller/agent → set password → auto-login.
	v1.Get("/invitations/:token", deps.Auth.GetInvitation)
	v1.Post("/invitations/:token/accept",
		RateLimitIP(registerPerWindow, registerWindow), deps.Auth.AcceptInvitation)

	// Google OAuth — GET (browser redirect). Rate-limit /authorize per IP so a
	// bot can't spam state cookies. Callback is naturally rate-limited by
	// Google itself (needs a valid code round-trip).
	if deps.AuthGoogle != nil {
		v1.Get("/auth/google/authorize",
			RateLimitIP(loginPerWindow, loginWindow), deps.AuthGoogle.Authorize)
		v1.Get("/auth/google/callback", deps.AuthGoogle.Callback)
	}

	v1.Get("/templates", deps.Templates.List)
	v1.Get("/template-meta", deps.Templates.Meta)
	v1.Get("/templates/:slug", deps.Templates.Get)

	// --- Authenticated (any logged-in user) ---
	authed := v1.Group("/", auth.Required(deps.Issuer))

	authed.Get("/auth/me", deps.Auth.Me)
	authed.Patch("/auth/me", RateLimitUser(mutationPerWindow, mutationWindow), deps.Auth.UpdateMe)
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

	// Site members (Phase 4 collab). Read: siapapun yang punya akses; write:
	// owner-only (add/remove) atau self (leave). Endpoint add belum expose
	// via wizard di Phase 4 — reseller auto-add lewat purchase flow.
	authed.Get("/sites/:id/members", deps.Sites.ListMembers)
	authed.Delete("/sites/:id/members/:user_id", mutateLimit, deps.Sites.RemoveMember)
	authed.Post("/sites/:id/leave", mutateLimit, deps.Sites.LeaveSite)
	// Phase 5 — aggregate list untuk halaman /settings/collaborators.
	authed.Get("/collaborators", deps.Sites.ListMyCollaborators)
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
	authed.Post("/pages/:id/schedule", mutateLimit, deps.Pages.Schedule)
	authed.Post("/pages/:id/unschedule", mutateLimit, deps.Pages.Unschedule)
	authed.Post("/pages/:id/preview-token", mutateLimit, deps.Pages.PreviewToken)
	authed.Delete("/pages/:id", mutateLimit, deps.Pages.Delete)

	// Assets — separate, tighter limit (uploads are expensive).
	if deps.Assets != nil {
		uploadLimit := RateLimitUser(uploadPerWindow, uploadWindow)
		authed.Get("/sites/:id/assets", deps.Assets.ListBySite)
		authed.Post("/sites/:id/assets", uploadLimit, deps.Assets.Upload)
		// Delete di path top-level (bukan nested site) supaya URL predictable
		// tanpa harus fetch asset dulu untuk tau site_id-nya.
		authed.Delete("/assets/:id", mutateLimit, deps.Assets.Delete)
	}

	// Domains
	authed.Get("/sites/:id/domains", deps.Domains.ListBySite)
	authed.Post("/sites/:id/domains", mutateLimit, deps.Domains.Add)
	authed.Post("/domains/:id/verify", mutateLimit, deps.Domains.Verify)
	authed.Delete("/domains/:id", mutateLimit, deps.Domains.Delete)

	// Domain purchase (proxy ke registrar-api). Nil-safe kalau feature disabled.
	if deps.DomainPurchase != nil {
		authed.Post("/domains/check", mutateLimit, deps.DomainPurchase.Check)
		// Purchase + renew guarded dengan limit lebih ketat (money-moving ops).
		purchaseLimit := RateLimitUser(purchasePerWindow, purchaseWindow)
		authed.Post("/domains/purchase", purchaseLimit, deps.DomainPurchase.Purchase)
		// Renew existing domain — bikin job baru dengan kind=renew di job tracker
		// lokal + di registrar. Response shape sama dengan purchase supaya
		// frontend re-use pending page.
		authed.Post("/domains/renew", purchaseLimit, deps.DomainPurchase.Renew)
		// Domain management (nameservers + whois) — semua verify ownership.
		authed.Get("/domains/:name/nameservers", deps.DomainPurchase.GetNameservers)
		authed.Post("/domains/:name/nameservers", mutateLimit, deps.DomainPurchase.UpdateNameservers)
		authed.Get("/domains/:name/whois", deps.DomainPurchase.Whois)
		// DNS editor — proxy ke Cloudflare, scoped domain ownership. Fitur
		// disable-graceful kalau CF config absent (503 dari handler).
		authed.Get("/domains/:name/dns", deps.DomainPurchase.ListDNSRecords)
		authed.Post("/domains/:name/dns", mutateLimit, deps.DomainPurchase.CreateDNSRecord)
		authed.Patch("/domains/:name/dns/:record_id", mutateLimit, deps.DomainPurchase.UpdateDNSRecord)
		authed.Delete("/domains/:name/dns/:record_id", mutateLimit, deps.DomainPurchase.DeleteDNSRecord)
		authed.Get("/domains/purchases", deps.DomainPurchase.List)
		// Sinkronkan status semua job user dari registrar ground truth. User-triggered
		// via tombol di /settings/domains — fix drift kalau webhook drop.
		authed.Post("/domains/sync", mutateLimit, deps.DomainPurchase.Sync)
		authed.Get("/domains/purchases/:job_id", deps.DomainPurchase.Status)
		authed.Post("/domains/purchases/:job_id/attach", mutateLimit, deps.DomainPurchase.Attach)
		// Retry EPP CREATE untuk job yang status=failed (tidak bayar ulang).
		authed.Post("/domains/purchases/:job_id/retry", mutateLimit, deps.DomainPurchase.Retry)
		// AttachDocument = multipart passthrough ke registrar. Web builder
		// TIDAK simpan file — dokumen sensitif (KTP/NPWP) langsung di-forward.
		// Pakai uploadLimit karena user-initiated file upload (bukan mutation).
		uploadLimit := RateLimitUser(uploadPerWindow, uploadWindow)
		authed.Post("/domains/purchases/:job_id/documents", uploadLimit, deps.DomainPurchase.AttachDocument)
		// Categories dropdown untuk form upload. Read-only, no limit.
		authed.Get("/documents/categories", deps.DomainPurchase.ListCategories)
		// Reseller document library (pre-attach flow) — user upload dokumen
		// SEBELUM checkout, dapat ID, kirim di POST /purchase document_ids[].
		// Scoped by user UUID (external_user_id inject dari JWT, bukan trust
		// client). Semua passthrough — web builder tidak simpan file.
		authed.Get("/documents", deps.DomainPurchase.ListDocuments)
		authed.Post("/documents", uploadLimit, deps.DomainPurchase.UploadDocument)
		// Preview 1 dokumen (base64 data URI, ownership + external_user_id
		// enforced di registrar + web builder proxy). Dipakai tombol "Lihat"
		// di /settings/documents.
		authed.Get("/documents/:id", deps.DomainPurchase.ShowDocument)
		// Invoice list — proxy ke registrar dengan external_user_id inject
		// dari JWT (isolation). Read-only, no rate limit.
		authed.Get("/invoices", deps.DomainPurchase.ListInvoices)
	}

	// Products
	authed.Get("/sites/:id/products", deps.Products.ListBySite)
	authed.Post("/sites/:id/products", mutateLimit, deps.Products.Create)
	authed.Get("/products/:id", deps.Products.Get)
	authed.Patch("/products/:id", mutateLimit, deps.Products.Update)
	authed.Delete("/products/:id", mutateLimit, deps.Products.Delete)

	// Block snippets — per-user reusable block library
	authed.Get("/snippets", deps.Snippets.List)
	authed.Post("/snippets", mutateLimit, deps.Snippets.Create)
	authed.Patch("/snippets/:id", mutateLimit, deps.Snippets.Rename)
	authed.Delete("/snippets/:id", mutateLimit, deps.Snippets.Delete)

	// Blog posts
	authed.Get("/sites/:id/blog-posts", deps.Blog.ListBySite)
	authed.Post("/sites/:id/blog-posts", mutateLimit, deps.Blog.Create)
	authed.Get("/blog-posts/:id", deps.Blog.Get)
	authed.Patch("/blog-posts/:id", mutateLimit, deps.Blog.Update)
	authed.Post("/blog-posts/:id/publish", mutateLimit, deps.Blog.Publish)
	authed.Delete("/blog-posts/:id", mutateLimit, deps.Blog.Delete)

	// Analytics summary — read-only, no rate limit. Public beacon di global.go.
	if deps.Analytics != nil {
		authed.Get("/sites/:id/analytics", deps.Analytics.GetSummary)
	}

	// Forms — CRUD form definitions + submissions inbox. Public submit endpoint
	// terpisah di /public/forms/:id/submit (di router/global.go).
	if deps.Forms != nil {
		authed.Get("/sites/:id/forms", deps.Forms.ListBySite)
		authed.Post("/sites/:id/forms", mutateLimit, deps.Forms.CreateForSite)
		authed.Patch("/forms/:id", mutateLimit, deps.Forms.Update)
		authed.Delete("/forms/:id", mutateLimit, deps.Forms.Delete)
		authed.Get("/forms/:id/submissions", deps.Forms.ListSubmissions)
		authed.Delete("/form-submissions/:id", mutateLimit, deps.Forms.DeleteSubmission)
	}

	// Reseller portal endpoints — Phase 2.
	// Nil-safe kalau handler belum di-wire di main.
	if deps.Reseller != nil {
		// Reseller-only (invite agent + list agent)
		resellerG := v1.Group("/reseller", auth.Required(deps.Issuer), auth.RequireReseller())
		resellerG.Post("/agents/invite", mutateLimit, deps.Reseller.InviteAgent)
		resellerG.Get("/agents", deps.Reseller.ListAgents)
		// Phase 6 — stats aggregate dashboard reseller.
		resellerG.Get("/stats", deps.Reseller.GetStats)

		// Reseller ATAU agent boleh (invite client + list clients).
		roaG := v1.Group("/", auth.Required(deps.Issuer), auth.RequireResellerOrAgent())
		roaG.Post("/reseller/clients", mutateLimit, deps.Reseller.CreateClient)
		roaG.Get("/reseller/clients", deps.Reseller.ListClients)
		roaG.Get("/reseller/clients/:client_id", deps.Reseller.GetClient)

		// Agent-only mirror endpoint (list assigned clients dari agent's POV).
		agentG := v1.Group("/agent", auth.Required(deps.Issuer), auth.RequireAgent())
		agentG.Get("/clients", deps.Reseller.ListClients)
		agentG.Get("/clients/:client_id", deps.Reseller.GetClient)
		agentG.Get("/stats", deps.Reseller.GetStats)

		// Phase 3 — list domain purchase yang di-trigger on-behalf-of client.
		// Enrich dengan client info supaya frontend tinggal render tabel.
		if deps.DomainPurchase != nil {
			roaG.Get("/reseller/purchases", deps.DomainPurchase.ListOnBehalfOf)
			roaG.Get("/reseller/purchases.csv", deps.DomainPurchase.ExportOnBehalfOfCSV)
			agentG.Get("/purchases", deps.DomainPurchase.ListOnBehalfOf)
		}

		// Phase 3.5 — reseller wallet proxy. Read-only endpoint dibuka untuk
		// reseller/agent kedua-duanya (view balance induk); write endpoint
		// (top-up, upload proof) reseller-only — di-enforce di handler.
		if deps.Wallet != nil {
			walletUploadLimit := RateLimitUser(uploadPerWindow, uploadWindow)
			topupLimit := RateLimitUser(walletTopupPerWindow, walletTopupWindow)
			// Reads (reseller + agent boleh)
			roaG.Get("/reseller/wallet", deps.Wallet.GetWallet)
			roaG.Get("/reseller/wallet/ledger", deps.Wallet.GetLedger)
			roaG.Get("/reseller/wallet/topup", deps.Wallet.ListMyTopups)
			roaG.Get("/reseller/wallet/topup/banks", deps.Wallet.ListBanks)
			roaG.Get("/reseller/wallet/topup/:topup_id/status", deps.Wallet.GetTopupStatus)
			// Writes (reseller-only enforce di handler; middleware tetap
			// RequireResellerOrAgent supaya JWT valid untuk error message).
			roaG.Post("/reseller/wallet/topup", topupLimit, deps.Wallet.InitTopup)
			roaG.Post("/reseller/wallet/topup/:topup_id/proof", walletUploadLimit, deps.Wallet.UploadProof)
			// Mirror endpoints untuk agent (biar frontend agent portal
			// consistent path shape).
			agentG.Get("/wallet", deps.Wallet.GetWallet)
			agentG.Get("/wallet/ledger", deps.Wallet.GetLedger)
			agentG.Get("/wallet/topup", deps.Wallet.ListMyTopups)
		}

		// Pricing (Phase 3.11-3.12):
		//   - Reseller CRUD price list per-TLD (write reseller-only, di-enforce di handler)
		//   - Agent view-only (share endpoint, handler filter response)
		if deps.Pricing != nil {
			roaG.Get("/reseller/pricing", deps.Pricing.ResellerList)
			resellerG.Post("/pricing", mutateLimit, deps.Pricing.ResellerUpsert)
			resellerG.Delete("/pricing/:id", mutateLimit, deps.Pricing.ResellerDelete)
			agentG.Get("/pricing", deps.Pricing.ResellerList)
		}
	}

	// Public resolve endpoint (Phase 3.14) — dipakai wizard untuk display
	// harga + transparency box (wholesale untuk reseller/agent, retail untuk
	// client). Response redacted per role di handler.
	if deps.Pricing != nil {
		authed.Get("/pricing/resolve/:tld", deps.Pricing.Resolve)
	}
}
