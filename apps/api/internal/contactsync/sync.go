// Package contactsync propagate profile update (self atau by
// reseller/agent) ke registrar contact via
// PATCH /reseller/domain/:name/contact. Async fire-and-forget supaya
// user tidak nunggu N HTTP calls kalau punya banyak domain.
//
// Design rationale:
//   - Repo domain_purchase + auth.Repo di-inject via interface supaya
//     package ini tidak import back ke auth (menghindari import cycle).
//   - Nil-safe: kalau `Syncer` == nil (registrar disabled), caller call
//     `syncer.SyncUser(...)` tetap aman via nil-receiver method.
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

// Syncer — orchestrator. Instansiasi di main.go setelah registrar client
// dibuild (nil kalau disabled) + inject via setter ke auth.Handler +
// reseller.Handler.
type Syncer struct {
	registrar *registrar.Client
	purchases *domain_purchase.Repo
	users     *auth.Repo
}

// New builds a Syncer. `reg` boleh nil — SyncUser jadi no-op.
func New(reg *registrar.Client, purchases *domain_purchase.Repo, users *auth.Repo) *Syncer {
	return &Syncer{registrar: reg, purchases: purchases, users: users}
}

// SyncUser trigger contact update di registrar untuk semua domain aktif
// milik userID. Fire-and-forget di goroutine — return segera. Kalau syncer
// nil (registrar disabled) juga no-op.
//
// Kenapa async: user profile update flow harus responsive. Registrar
// contact:update per domain butuh EPP round-trip (bisa detik). Kalau user
// punya 10 domain, blocking sync = 10-20 detik hang di UI. Error dari
// registrar cuma di-log — tidak surface ke user karena state lokal +
// registrar bisa drift sementara (nanti bisa manual re-sync per domain).
func (s *Syncer) SyncUser(userID uuid.UUID) {
	if s == nil || s.registrar == nil {
		return
	}
	go s.syncUserAsync(userID)
}

func (s *Syncer) syncUserAsync(userID uuid.UUID) {
	// Timeout keseluruhan operasi — cegah goroutine leak kalau registrar
	// hang. 60s cukup untuk sync belasan domain (EPP call ~2-5s each).
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// Ambil profil user terbaru — dipakai sebagai source of truth untuk
	// build contact payload.
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		slog.Warn("contactsync: user lookup failed", "user_id", userID, "err", err)
		return
	}

	// Ambil semua domain purchase milik user. Filter status='active' —
	// domain pending belum di-provisioning ke registry, contact:update
	// akan gagal atau silent-fallback ke "DB only". Update saat aktif
	// via CheckContactAndCreate worker registrar.
	//
	// Limit besar (500) sebagai safety — user jarang punya > 500 domain.
	purchases, err := s.purchases.ListByUser(ctx, userID, 500)
	if err != nil {
		slog.Warn("contactsync: list purchases failed", "user_id", userID, "err", err)
		return
	}

	seen := make(map[string]struct{}, len(purchases))
	synced := 0
	failed := 0
	for _, p := range purchases {
		if p.Status != domain_purchase.StatusActive {
			continue
		}
		// Dedupe per domain — kalau ada 2 row (register + renew) untuk
		// domain sama, hanya sync sekali. Registrar side EPP idempoten
		// tapi tetap hemat call.
		domain := strings.ToLower(strings.TrimSpace(p.Domain))
		if domain == "" {
			continue
		}
		if _, dup := seen[domain]; dup {
			continue
		}
		seen[domain] = struct{}{}

		payload := registrar.UpdateContactPayload{
			Name:        user.Name,
			Email:       user.Email,
			Phone:       user.PhoneNumber,
			Address:     user.Address,
			City:        user.City,
			State:       user.State,
			PostalCode:  user.PostalCode,
			CountryCode: "ID",
			Nik:         user.Nik,
		}
		// Skip zone .id kalau NIK kosong — registrar reject 400. Log warn
		// supaya operator tahu ada domain yang tertunggak update.
		if strings.HasSuffix(domain, ".id") && strings.TrimSpace(user.Nik) == "" {
			slog.Warn("contactsync: skip .id domain karena NIK kosong",
				"user_id", userID, "domain", domain)
			continue
		}
		if _, err := s.registrar.UpdateResellerDomainContact(ctx, domain, payload); err != nil {
			failed++
			slog.Warn("contactsync: update contact failed",
				"user_id", userID, "domain", domain, "err", err)
			continue
		}
		synced++
	}

	if synced > 0 || failed > 0 {
		slog.Info("contactsync: user profile propagated",
			"user_id", userID, "synced", synced, "failed", failed,
			"total_active", len(seen))
	}
}
