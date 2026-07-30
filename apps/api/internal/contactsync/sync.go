// Package contactsync propagate profile update (self atau by
// reseller/agent) ke registrar contact via reseller-api. Async
// fire-and-forget supaya user tidak nunggu HTTP call ke external service.
//
// Strategi endpoint (per plan.md §14.10):
//   - Kalau `users.registrar_contact_id` sudah pernah di-cache → single
//     PATCH /reseller/contacts/:id. Efisien, tidak butuh domain aktif,
//     tidak butuh domain sama sekali (asumsi contact sudah pernah exist).
//   - Kalau belum di-cache (nil) → fallback iterate PATCH
//     /reseller/domain/:name/contact per domain user (status apapun,
//     bukan cuma active — endpoint handle DB-only path internal kalau
//     contact belum ter-provisioning). Capture `contact_id` dari response
//     pertama → simpan ke users.registrar_contact_id supaya next update
//     pakai direct path.
//
// Nil-safe: kalau `Syncer` == nil (registrar disabled), SyncUser tetap
// bisa dipanggil (nil-receiver method).
package contactsync

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/registrar"
)

type Syncer struct {
	registrar *registrar.Client
	purchases *domain_purchase.Repo
	users     *auth.Repo
}

func New(reg *registrar.Client, purchases *domain_purchase.Repo, users *auth.Repo) *Syncer {
	return &Syncer{registrar: reg, purchases: purchases, users: users}
}

// SyncUser trigger contact update di registrar untuk userID. Fire-and-forget
// di goroutine — return segera. No-op kalau syncer nil atau registrar disabled.
func (s *Syncer) SyncUser(userID uuid.UUID) {
	if s == nil || s.registrar == nil {
		return
	}
	go s.syncUserAsync(userID)
}

func (s *Syncer) syncUserAsync(userID uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	slog.Info("contactsync: start", "user_id", userID)

	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		slog.Warn("contactsync: user lookup failed", "user_id", userID, "err", err)
		return
	}
	payload := buildPayload(user)

	// FAST PATH — kalau contact_id sudah ter-cache, 1 call cukup untuk
	// semua domain user (contact di-share antar-domain per reseller).
	if user.RegistrarContactID != nil && *user.RegistrarContactID > 0 {
		cid := uint64(*user.RegistrarContactID)
		resp, err := s.registrar.UpdateResellerContactByID(ctx, cid, payload)
		if err != nil {
			slog.Warn("contactsync: direct update contact failed",
				"user_id", userID, "contact_id", cid, "err", err)
			return
		}
		slog.Info("contactsync: done via direct endpoint",
			"user_id", userID, "contact_id", cid, "message", resp.Message)
		return
	}

	// FALLBACK — belum tahu contact_id. Iterate domain-scoped, capture id
	// dari respons pertama sukses. Status apapun OK (registrar handle
	// DB-only path internal kalau IsCreated=false).
	purchases, err := s.purchases.ListByUser(ctx, userID, 500)
	if err != nil {
		slog.Warn("contactsync: list purchases failed", "user_id", userID, "err", err)
		return
	}
	if len(purchases) == 0 {
		slog.Info("contactsync: no purchases yet, defer sync sampai user register domain",
			"user_id", userID)
		return
	}

	seen := make(map[string]struct{}, len(purchases))
	synced := 0
	failed := 0
	skipped := 0
	var capturedContactID int64
	for _, p := range purchases {
		domain := strings.ToLower(strings.TrimSpace(p.Domain))
		if domain == "" {
			continue
		}
		if _, dup := seen[domain]; dup {
			continue
		}
		seen[domain] = struct{}{}

		// Domain-scoped PATCH require NIK non-empty untuk zone .id (registrar
		// hard reject 400). Skip explicit dengan warn supaya operator tahu.
		if strings.HasSuffix(domain, ".id") && strings.TrimSpace(user.Nik) == "" {
			slog.Warn("contactsync: skip .id domain karena NIK kosong",
				"user_id", userID, "domain", domain)
			skipped++
			continue
		}

		resp, err := s.registrar.UpdateResellerDomainContact(ctx, domain, payload)
		if err != nil {
			failed++
			slog.Warn("contactsync: update contact failed",
				"user_id", userID, "domain", domain, "err", err)
			continue
		}
		synced++
		// Capture contact_id dari respons pertama sukses — semua domain
		// share contact sama, jadi tidak perlu tunggu semua selesai.
		if capturedContactID == 0 && resp.ContactID > 0 {
			capturedContactID = int64(resp.ContactID)
		}
	}

	// Cache contact_id supaya next sync pakai direct path (1 call, tidak
	// perlu iterate domain, tidak butuh domain aktif).
	if capturedContactID > 0 {
		if err := s.users.SetRegistrarContactID(ctx, userID, capturedContactID); err != nil {
			slog.Warn("contactsync: cache contact_id gagal",
				"user_id", userID, "contact_id", capturedContactID, "err", err)
		} else {
			slog.Info("contactsync: contact_id cached untuk next sync direct",
				"user_id", userID, "contact_id", capturedContactID)
		}
	}

	slog.Info("contactsync: done via fallback iterate",
		"user_id", userID,
		"synced", synced,
		"failed", failed,
		"skipped_nik_empty_id_zone", skipped,
		"total_domains", len(seen),
	)
}

func buildPayload(user *auth.User) registrar.UpdateContactPayload {
	return registrar.UpdateContactPayload{
		Name:        user.Name,
		Email:       user.Email,
		Phone:       user.PhoneNumber,
		Address:     user.Address,
		City:        user.City,
		State:       user.State,
		PostalCode:  user.PostalCode,
		CountryCode: "ID",
		// NIK cuma dipakai domain-scoped path (contact endpoint ignore).
		Nik: user.Nik,
	}
}
