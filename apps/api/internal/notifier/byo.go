package notifier

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/dnsprovider"
	"github.com/webbuilder/api/internal/mail"
	"github.com/webbuilder/api/internal/metrics"
	"github.com/webbuilder/api/internal/site_byo_domains"
	"github.com/webbuilder/api/internal/sites"
)

// stickyChoiceFromRow mirrors site_byo_domains.stickyChoice (unexported) —
// reconciler lives in a sibling package so duplicates the tiny helper here
// rather than exposing a Public API just for one caller.
func stickyChoiceFromRow(r *site_byo_domains.DBRow) dnsprovider.Choice {
	if r.DNSProviderConfigID != nil {
		return dnsprovider.Choice{StickyConfigID: r.DNSProviderConfigID.String()}
	}
	return dnsprovider.Choice{Explicit: dnsprovider.Kind(r.DNSProvider)}
}

// BYOConfig tunes the three sub-scans + grace windows. Zero values resolve to
// sensible production defaults.
type BYOConfig struct {
	Interval         time.Duration           // outer tick, default 24h
	HealthInterval   time.Duration           // skip row if health-checked within this, default 24h
	WhoisInterval    time.Duration           // skip row if whois-checked within this, default 24h
	HealthBatchSize  int                     // default 200
	WhoisBatchSize   int                     // default 200
	CleanupBatchSize int                     // default 50
	MachineConfig    site_byo_domains.Config // grace windows (drift 7d, disconnect 30d, cleanup 90d)
	AppBaseURL       string                  // deep-link to /sites/.../domains in emails
}

func (c *BYOConfig) applyDefaults() {
	if c.Interval <= 0 {
		c.Interval = 24 * time.Hour
	}
	if c.HealthInterval <= 0 {
		c.HealthInterval = 24 * time.Hour
	}
	if c.WhoisInterval <= 0 {
		c.WhoisInterval = 24 * time.Hour
	}
	if c.HealthBatchSize <= 0 {
		c.HealthBatchSize = 200
	}
	if c.WhoisBatchSize <= 0 {
		c.WhoisBatchSize = 200
	}
	if c.CleanupBatchSize <= 0 {
		c.CleanupBatchSize = 50
	}
	if c.MachineConfig == (site_byo_domains.Config{}) {
		c.MachineConfig = site_byo_domains.DefaultConfig()
	}
}

// BYOReconciler scans site_byo_domains rows and advances them through the
// lifecycle state machine. Three sub-scans per tick:
//
//  1. Health: NS lookup for pending/verified/drifting/suspended rows.
//  2. WHOIS: expiry refresh for verified/drifting/suspended/expired rows.
//  3. Cleanup: hard-delete expired rows past the 90d grace.
//
// Everything is best-effort — a single failing row is logged and the batch
// continues. Context cancellation stops after the current row completes.
type BYOReconciler struct {
	repo         *site_byo_domains.Repo
	sites        *sites.Repo
	auth         *auth.Repo
	whois        site_byo_domains.WhoisClient
	providerFact site_byo_domains.ProviderFactory
	nsLookup     site_byo_domains.NSLookup
	mailer       mail.Sender
	appBaseURL   string
	cfg          BYOConfig
}

type BYOReconcilerDeps struct {
	Repo            *site_byo_domains.Repo
	Sites           *sites.Repo
	Auth            *auth.Repo
	Whois           site_byo_domains.WhoisClient
	ProviderFactory site_byo_domains.ProviderFactory
	NSLookup        site_byo_domains.NSLookup // nil = site_byo_domains.DefaultNSLookup
	Mailer          mail.Sender
	Config          BYOConfig
}

func NewBYOReconciler(d BYOReconcilerDeps) *BYOReconciler {
	d.Config.applyDefaults()
	nsFn := d.NSLookup
	if nsFn == nil {
		nsFn = site_byo_domains.DefaultNSLookup
	}
	return &BYOReconciler{
		repo:         d.Repo,
		sites:        d.Sites,
		auth:         d.Auth,
		whois:        d.Whois,
		providerFact: d.ProviderFactory,
		nsLookup:     nsFn,
		mailer:       d.Mailer,
		appBaseURL:   d.Config.AppBaseURL,
		cfg:          d.Config,
	}
}

// Run starts the background loop. Blocks until ctx cancel.
func (r *BYOReconciler) Run(ctx context.Context) {
	slog.Info("byo reconciler started", "interval", r.cfg.Interval)
	if err := r.RunOnce(ctx); err != nil {
		slog.Warn("byo reconciler: initial scan failed", "error", err)
	}
	t := time.NewTicker(r.cfg.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("byo reconciler stopped")
			return
		case <-t.C:
			if err := r.RunOnce(ctx); err != nil {
				slog.Warn("byo reconciler: scan failed (retry next tick)", "error", err)
			}
		}
	}
}

// RunOnce executes all three sub-scans in sequence. Returns the first error
// encountered at the batch-query layer (per-row errors are logged, not
// propagated).
func (r *BYOReconciler) RunOnce(ctx context.Context) error {
	if err := r.scanHealth(ctx); err != nil {
		return fmt.Errorf("health scan: %w", err)
	}
	if err := r.scanWhois(ctx); err != nil {
		return fmt.Errorf("whois scan: %w", err)
	}
	if err := r.scanCleanup(ctx); err != nil {
		return fmt.Errorf("cleanup scan: %w", err)
	}
	return nil
}

// scanHealth looks up NS and advances rows through the state machine via
// EventHealthOK / EventHealthFail, then evaluates EventTick for grace
// progression on drifting/suspended rows.
func (r *BYOReconciler) scanHealth(ctx context.Context) error {
	rows, err := r.repo.ListDueForHealthCheck(ctx, r.cfg.HealthInterval, r.cfg.HealthBatchSize)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	slog.Info("byo reconciler: health scan", "count", len(rows))
	for i := range rows {
		row := &rows[i]
		if ctx.Err() != nil {
			return ctx.Err()
		}
		r.healthOneRow(ctx, row)
	}
	return nil
}

func (r *BYOReconciler) healthOneRow(ctx context.Context, row *site_byo_domains.DBRow) {
	// Pending rows wait for user-triggered Verify — just update last_health_at
	// to deprioritise re-scan without changing status.
	if row.Status == site_byo_domains.StatePending {
		_ = r.repo.MarkHealthResult(ctx, row.ID, site_byo_domains.StatePending, nil)
		return
	}

	resolved, lookupErr := r.nsLookup(ctx, row.Hostname)
	event := site_byo_domains.EventHealthFail
	if lookupErr == nil && site_byo_domains.NSOverlap(resolved, row.AssignedNS) {
		event = site_byo_domains.EventHealthOK
	}

	isPrimary := r.isPrimary(ctx, row)
	machine := row.ToMachineRow(isPrimary)
	d := site_byo_domains.Decide(machine, event, time.Now(), r.cfg.MachineConfig)
	if d.Err != nil {
		// Illegal in current state — log and skip. Row status didn't change.
		slog.Debug("byo reconciler: illegal health event",
			"host", row.Hostname, "state", row.Status, "event", event, "error", d.Err)
	} else if d.Next != row.Status || len(d.Effects) > 0 {
		r.applyDecision(ctx, row, d, isPrimary)
	}

	// Second pass: EventTick for grace progression. Re-fetch row to see
	// updated state after the health event — grace timers depend on
	// drift_detected_at which may have just been set.
	fresh, err := r.repo.GetByID(ctx, row.ID)
	if err != nil {
		return
	}
	isPrimary2 := r.isPrimary(ctx, fresh)
	tickD := site_byo_domains.Decide(fresh.ToMachineRow(isPrimary2), site_byo_domains.EventTick, time.Now(), r.cfg.MachineConfig)
	if tickD.Err == nil && len(tickD.Effects) > 0 {
		r.applyDecision(ctx, fresh, tickD, isPrimary2)
	}
}

// scanWhois refreshes expiry data via api-registry WHOIS. Also fires
// EventWhoisExpired / EventWhoisRenewed as expiry crosses the current time.
func (r *BYOReconciler) scanWhois(ctx context.Context) error {
	rows, err := r.repo.ListDueForWhoisCheck(ctx, r.cfg.WhoisInterval, r.cfg.WhoisBatchSize)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	slog.Info("byo reconciler: whois scan", "count", len(rows))
	for i := range rows {
		row := &rows[i]
		if ctx.Err() != nil {
			return ctx.Err()
		}
		r.whoisOneRow(ctx, row)
	}
	return nil
}

func (r *BYOReconciler) whoisOneRow(ctx context.Context, row *site_byo_domains.DBRow) {
	w, err := r.whois.Whois(ctx, row.Hostname)
	if err != nil {
		metrics.Default.CounterInc("byo_whois_check_total",
			"BYO WHOIS probes by result",
			map[string]string{"result": "error"})
		slog.Warn("byo reconciler: whois failed", "host", row.Hostname, "error", err)
		return
	}
	if w == nil {
		// Domain gone from PANDI — treat as expired.
		metrics.Default.CounterInc("byo_whois_check_total",
			"BYO WHOIS probes by result",
			map[string]string{"result": "not_found"})
		if row.Status != site_byo_domains.StateExpired {
			_ = r.repo.MarkExpired(ctx, row.ID)
		}
		return
	}
	metrics.Default.CounterInc("byo_whois_check_total",
		"BYO WHOIS probes by result",
		map[string]string{"result": "ok"})

	parsed, _ := time.Parse(time.RFC3339, w.ExpiresAt)
	var expPtr *time.Time
	if !parsed.IsZero() {
		expPtr = &parsed
	}
	_ = r.repo.UpdateWhois(ctx, row.ID, expPtr)

	// Fire renewed event if row was expired and expiry moved into future.
	now := time.Now()
	isPrimary := r.isPrimary(ctx, row)
	if row.Status == site_byo_domains.StateExpired && expPtr != nil && now.Before(*expPtr) {
		fresh := *row
		fresh.ExpiresAt = expPtr
		d := site_byo_domains.Decide(fresh.ToMachineRow(isPrimary), site_byo_domains.EventWhoisRenewed, now, r.cfg.MachineConfig)
		if d.Err == nil {
			r.applyDecision(ctx, &fresh, d, isPrimary)
		}
		return
	}

	// Fire expired event if expiry just passed.
	if expPtr != nil && now.After(*expPtr) && row.Status != site_byo_domains.StateExpired {
		fresh := *row
		fresh.ExpiresAt = expPtr
		d := site_byo_domains.Decide(fresh.ToMachineRow(isPrimary), site_byo_domains.EventWhoisExpired, now, r.cfg.MachineConfig)
		if d.Err == nil {
			r.applyDecision(ctx, &fresh, d, isPrimary)
		}
		return
	}

	// Still active + verified — fire tick for expiry warning cadence.
	if row.Status == site_byo_domains.StateVerified {
		fresh := *row
		fresh.ExpiresAt = expPtr
		d := site_byo_domains.Decide(fresh.ToMachineRow(isPrimary), site_byo_domains.EventTick, now, r.cfg.MachineConfig)
		if d.Err == nil && hasEffect(d.Effects, site_byo_domains.EffectSendExpiryEmail) {
			// Dedup: skip if we've emailed within ResendAfter (reuse expiry
			// notice column, 7 days default).
			if row.ExpiryNoticeSentAt != nil && now.Sub(*row.ExpiryNoticeSentAt) < 7*24*time.Hour {
				return
			}
			r.applyDecision(ctx, &fresh, d, isPrimary)
		}
	}
}

// scanCleanup hard-deletes expired rows past the 90d grace. Also deletes the
// Cloudflare zone (best-effort).
func (r *BYOReconciler) scanCleanup(ctx context.Context) error {
	rows, err := r.repo.ListExpiredCleanupCandidates(ctx, r.cfg.MachineConfig.ExpiredCleanup, r.cfg.CleanupBatchSize)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}
	slog.Info("byo reconciler: cleanup scan", "count", len(rows))
	for i := range rows {
		row := &rows[i]
		if ctx.Err() != nil {
			return ctx.Err()
		}
		r.cleanupOneRow(ctx, row)
	}
	return nil
}

func (r *BYOReconciler) cleanupOneRow(ctx context.Context, row *site_byo_domains.DBRow) {
	if row.DNSZoneID != "" {
		// Sticky: delete at the exact provider that owns the zone, not the
		// current admin-priority default (which may be a different account).
		if prov, _, err := r.providerFact(ctx, stickyChoiceFromRow(row)); err == nil {
			// Adapter swallows "zone not found" so no errors.Is needed here.
			if dErr := prov.DeleteZone(ctx, row.DNSZoneID); dErr != nil {
				slog.Warn("byo reconciler: provider delete zone failed",
					"host", row.Hostname, "provider", prov.Kind(),
					"zone_id", row.DNSZoneID, "error", dErr)
			}
		}
	}
	if err := r.repo.Delete(ctx, row.ID); err != nil {
		slog.Warn("byo reconciler: delete row failed", "host", row.Hostname, "error", err)
		return
	}
	metrics.Default.CounterInc("byo_expired_cleanup_total",
		"BYO domains hard-deleted after 90d grace",
		nil)
}

// --- effect application ------------------------------------------------------

func (r *BYOReconciler) applyDecision(ctx context.Context, row *site_byo_domains.DBRow, d site_byo_domains.Decision, isPrimary bool) {
	now := time.Now()
	driftedAt := now
	for _, eff := range d.Effects {
		switch eff {
		case site_byo_domains.EffectSetDriftDetected:
			_ = r.repo.MarkHealthResult(ctx, row.ID, site_byo_domains.StateDrifting, &driftedAt)
			r.recordTransition(row.Status, site_byo_domains.StateDrifting)
		case site_byo_domains.EffectClearDrift:
			_ = r.repo.ClearDrift(ctx, row.ID)
			r.recordTransition(row.Status, site_byo_domains.StateVerified)
		case site_byo_domains.EffectSetSuspended:
			_ = r.repo.MarkSuspended(ctx, row.ID)
			r.recordTransition(row.Status, site_byo_domains.StateSuspended)
		case site_byo_domains.EffectSetDisconnected:
			_ = r.repo.MarkDisconnected(ctx, row.ID)
			r.recordTransition(row.Status, site_byo_domains.StateDisconnected)
		case site_byo_domains.EffectDemotePrimary:
			if isPrimary {
				if err := r.sites.SetPrimaryHostname(ctx, row.SiteID, row.UserID, ""); err != nil {
					slog.Warn("byo reconciler: demote primary failed",
						"host", row.Hostname, "site_id", row.SiteID, "error", err)
				}
			}
		case site_byo_domains.EffectSendDriftEmail:
			r.sendEmail(ctx, row, "drift")
		case site_byo_domains.EffectSendRecoveryEmail:
			r.sendEmail(ctx, row, "recovered")
		case site_byo_domains.EffectSendExpiryEmail:
			r.sendEmail(ctx, row, "expiry_warning")
			_ = r.repo.MarkExpiryNoticeSent(ctx, row.ID)
		case site_byo_domains.EffectSendExpiredEmail:
			r.sendEmail(ctx, row, "expired")
		case site_byo_domains.EffectDeleteCFZone:
			// Only emitted by expired cleanup path; cleanupOneRow handles the
			// delete + row removal directly, so this is a noop here. Guard
			// anyway in case another transition path emits it in the future.
			if row.DNSZoneID != "" {
				if prov, _, pErr := r.providerFact(ctx, stickyChoiceFromRow(row)); pErr == nil {
					_ = prov.DeleteZone(ctx, row.DNSZoneID)
				}
			}
		case site_byo_domains.EffectHardDelete:
			_ = r.repo.Delete(ctx, row.ID)
		case site_byo_domains.EffectSetVerifiedAt:
			// Only emitted by Verify handler path, not reconciler events.
		}
	}
}

func (r *BYOReconciler) recordTransition(from, to site_byo_domains.State) {
	metrics.Default.CounterInc("byo_domain_status_transitions_total",
		"BYO status transitions",
		map[string]string{"from": string(from), "to": string(to)})
}

// isPrimary resolves whether the BYO row is currently the canonical host.
// NULL primary_hostname → anchor fallback → BYO is NOT primary. Returns false
// on lookup error (safer to miss a demote than wrongly demote).
func (r *BYOReconciler) isPrimary(ctx context.Context, row *site_byo_domains.DBRow) bool {
	h, err := r.sites.GetPrimaryHostname(ctx, row.SiteID)
	if err != nil {
		return false
	}
	return h == row.Hostname
}

// --- email ------------------------------------------------------------------

func (r *BYOReconciler) sendEmail(ctx context.Context, row *site_byo_domains.DBRow, kind string) {
	if r.mailer == nil {
		return
	}
	u, err := r.auth.GetByID(ctx, row.UserID)
	if err != nil {
		slog.Warn("byo reconciler: user lookup failed", "user_id", row.UserID, "error", err)
		return
	}
	subj, body := renderBYOBody(kind, u.Name, row, r.appBaseURL)
	if subj == "" {
		return
	}
	if err := r.mailer.Send(ctx, mail.Message{To: u.Email, Subject: subj, Body: body}); err != nil {
		slog.Warn("byo reconciler: send email failed", "kind", kind, "to", u.Email, "host", row.Hostname, "error", err)
		metrics.Default.CounterInc("byo_notice_total",
			"BYO lifecycle notice emails by result",
			map[string]string{"kind": kind, "result": "failed"})
		return
	}
	metrics.Default.CounterInc("byo_notice_total",
		"BYO lifecycle notice emails by result",
		map[string]string{"kind": kind, "result": "sent"})
}

func renderBYOBody(kind, name string, row *site_byo_domains.DBRow, appURL string) (subject, body string) {
	greeting := "Halo"
	if strings.TrimSpace(name) != "" {
		greeting = "Halo " + name
	}
	host := row.Hostname
	deepLink := ""
	if appURL != "" {
		deepLink = fmt.Sprintf("\n\nBuka pengaturan domain: %s/sites/%s/domains",
			strings.TrimRight(appURL, "/"), row.SiteID)
	}

	switch kind {
	case "drift":
		return fmt.Sprintf("Domain %s: nameserver tidak lagi mengarah ke kami", host),
			fmt.Sprintf("%s,\n\nKami deteksi nameserver domain %s tidak lagi menunjuk ke platform. "+
				"Situs Anda masih online, tapi akan nonaktif dalam 7 hari kalau nameserver tidak "+
				"dikembalikan.%s\n\n— Tim Web Builder",
				greeting, host, deepLink)
	case "recovered":
		return fmt.Sprintf("Domain %s kembali aktif", host),
			fmt.Sprintf("%s,\n\nNameserver domain %s sudah kembali menunjuk ke kami. "+
				"Situs Anda aktif kembali.%s\n\n— Tim Web Builder",
				greeting, host, deepLink)
	case "expiry_warning":
		if row.ExpiresAt == nil {
			return "", ""
		}
		days := int(time.Until(*row.ExpiresAt).Hours() / 24)
		if days < 0 {
			days = 0
		}
		return fmt.Sprintf("Domain %s akan expired dalam %d hari", host, days),
			fmt.Sprintf("%s,\n\nDomain %s akan expired pada %s (%d hari lagi). Perpanjang di "+
				"registrar tempat Anda membeli domain tersebut agar situs tetap online.%s\n\n"+
				"— Tim Web Builder",
				greeting, host, row.ExpiresAt.Format("2 January 2006"), days, deepLink)
	case "expired":
		return fmt.Sprintf("Domain %s sudah expired", host),
			fmt.Sprintf("%s,\n\nDomain %s sudah expired. Situs Anda akan diarahkan ke domain "+
				"utama (jika ada). Perpanjang di registrar untuk mengaktifkannya kembali.%s\n\n"+
				"— Tim Web Builder",
				greeting, host, deepLink)
	}
	return "", ""
}

func hasEffect(effects []site_byo_domains.SideEffect, want site_byo_domains.SideEffect) bool {
	for _, e := range effects {
		if e == want {
			return true
		}
	}
	return false
}

// Ensure uuid import stays used even if signatures change.
var _ = uuid.UUID{}
