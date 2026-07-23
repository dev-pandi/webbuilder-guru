// Package notifier menjalankan background job untuk peringatan lifecycle
// (expire domain, dst.). Terpisah dari handler agar tidak coupling ke request
// lifecycle Fiber.
package notifier

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/mail"
)

// ExpiryConfig mengatur behaviour job peringatan expire.
type ExpiryConfig struct {
	// Interval antar-scan. 24h wajar — email harian max 1x per domain karena
	// dedup ResendAfter.
	Interval time.Duration
	// Within = jendela peringatan (misal 30 * 24h = 30 hari sebelum expire).
	Within time.Duration
	// ResendAfter = minimal jarak antar-email untuk domain yang sama, agar
	// user tidak spam-ed. 7 hari default (weekly reminder).
	ResendAfter time.Duration
	// AppBaseURL = base URL dashboard untuk deep-link tombol "Perpanjang".
	// Contoh: "https://dashboard.example.com". Kosong = tanpa link.
	AppBaseURL string
}

// ExpiryNotifier scan domain_purchases + kirim email peringatan expire.
type ExpiryNotifier struct {
	repo   *domain_purchase.Repo
	mailer mail.Sender
	cfg    ExpiryConfig
}

func NewExpiry(repo *domain_purchase.Repo, mailer mail.Sender, cfg ExpiryConfig) *ExpiryNotifier {
	if cfg.Interval <= 0 {
		cfg.Interval = 24 * time.Hour
	}
	if cfg.Within <= 0 {
		cfg.Within = 30 * 24 * time.Hour
	}
	if cfg.ResendAfter <= 0 {
		cfg.ResendAfter = 7 * 24 * time.Hour
	}
	return &ExpiryNotifier{repo: repo, mailer: mailer, cfg: cfg}
}

// Run mulai background loop. Blok sampai ctx cancel. Panggil di goroutine dari main.
// First scan langsung fire (bukan tunggu tick pertama) supaya restart cepat
// pickup pending notice.
func (n *ExpiryNotifier) Run(ctx context.Context) {
	slog.Info("notifier: expiry job started",
		"interval", n.cfg.Interval,
		"within", n.cfg.Within,
		"resend_after", n.cfg.ResendAfter,
	)
	if err := n.RunOnce(ctx); err != nil {
		slog.Warn("notifier: initial scan failed", "error", err)
	}
	t := time.NewTicker(n.cfg.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("notifier: expiry job stopped")
			return
		case <-t.C:
			if err := n.RunOnce(ctx); err != nil {
				slog.Warn("notifier: scan failed (retry next tick)", "error", err)
			}
		}
	}
}

// RunOnce = satu scan + kirim. Return error kalau query gagal; error per-email
// individual di-log tapi tidak stop batch — 1 email gagal ≠ semua batal.
// Dipisah supaya bisa dipanggil manual (test / admin trigger).
func (n *ExpiryNotifier) RunOnce(ctx context.Context) error {
	due, err := n.repo.ListDueForExpiryNotice(ctx, n.cfg.Within, n.cfg.ResendAfter)
	if err != nil {
		return fmt.Errorf("list due: %w", err)
	}
	if len(due) == 0 {
		return nil
	}
	slog.Info("notifier: sending expiry notices", "count", len(due))
	for i := range due {
		d := &due[i]
		days := int(time.Until(d.ExpiresAt).Hours() / 24)
		if days < 0 {
			days = 0
		}
		msg := mail.Message{
			To:      d.Email,
			Subject: fmt.Sprintf("Domain %s akan expire dalam %d hari", d.Domain, days),
			Body:    renderExpiryBody(d.Name, d.Domain, days, d.ExpiresAt, n.cfg.AppBaseURL),
		}
		if err := n.mailer.Send(ctx, msg); err != nil {
			slog.Warn("notifier: send failed", "to", d.Email, "domain", d.Domain, "error", err)
			continue
		}
		if err := n.repo.MarkExpiryNoticeSent(ctx, d.ID); err != nil {
			// Kirim sudah sukses; kalau mark gagal user akan dapat email lagi
			// besok. Tidak fatal tapi noisy — log warn.
			slog.Warn("notifier: mark sent failed", "id", d.ID, "error", err)
		}
	}
	return nil
}

// renderExpiryBody plain-text email — konsisten dengan mail.Message.Body (bukan HTML).
// Copy Indonesia; menyertakan tanggal absolut + relatif + link Perpanjang.
func renderExpiryBody(name, domain string, days int, expiresAt time.Time, appURL string) string {
	greeting := "Halo"
	if strings.TrimSpace(name) != "" {
		greeting = "Halo " + name
	}
	dateLabel := expiresAt.Format("2 January 2006")
	var link string
	if appURL != "" {
		link = fmt.Sprintf("\n\nPerpanjang sekarang: %s/settings/domains/%s",
			strings.TrimRight(appURL, "/"), domain)
	}
	relative := fmt.Sprintf("%d hari lagi", days)
	if days == 0 {
		relative = "hari ini"
	}
	return fmt.Sprintf(
		"%s,\n\nDomain %s akan expire pada %s (%s). Untuk menghindari situs Anda "+
			"offline, perpanjang domain sebelum tanggal tersebut.%s\n\n"+
			"Kalau sudah diperpanjang, abaikan email ini — sistem akan otomatis "+
			"deteksi status baru.\n\n— Tim Web Builder",
		greeting, domain, dateLabel, relative, link,
	)
}
