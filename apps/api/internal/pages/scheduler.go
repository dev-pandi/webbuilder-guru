package pages

import (
	"context"
	"log/slog"
	"time"

	"github.com/webbuilder/api/internal/metrics"
)

// Scheduler = worker background yang publish otomatis halaman yang punya
// scheduled_publish_at <= now. Interval 60 detik dipilih supaya rata-rata
// delay 30 detik dari waktu jadwal — cukup akurat untuk content publishing
// tanpa spam DB.
//
// Failure mode: kalau Publish gagal (mis. row lock atau DB down), row tetap
// punya scheduled_publish_at → akan di-retry iterasi berikutnya. Log +
// metric supaya operator sadar kalau ada backlog macet.
type Scheduler struct {
	repo     *Repo
	interval time.Duration
	max      int // max jadwal di-process per tick supaya worker tidak stuck
	purger   CachePurger // optional — nil = purge no-op
}

func NewScheduler(repo *Repo, interval time.Duration) *Scheduler {
	if interval <= 0 {
		interval = 60 * time.Second
	}
	return &Scheduler{repo: repo, interval: interval, max: 50}
}

// SetPurger inject cachepurge post-construction (sama pattern dengan Handler).
func (s *Scheduler) SetPurger(p CachePurger) { s.purger = p }

// Run blocks until ctx cancelled. Panggil `go scheduler.Run(ctx)` dari main.
// Panggil sekali di startup (setelah repo siap), sync tidak di-fire pertama —
// tunggu 1 tick supaya startup tidak ter-block DB scan.
func (s *Scheduler) Run(ctx context.Context) {
	slog.Info("pages scheduler: started", "interval", s.interval)
	t := time.NewTicker(s.interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("pages scheduler: stopped")
			return
		case <-t.C:
			s.tickOnce(ctx)
		}
	}
}

func (s *Scheduler) tickOnce(ctx context.Context) {
	// Timeout per tick — kalau DB lambat, jangan bloat + block iterasi berikut.
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	ids, err := s.repo.ListDueForPublish(ctx, time.Now(), s.max)
	if err != nil {
		slog.Warn("pages scheduler: list due failed", "err", err)
		return
	}
	if len(ids) == 0 {
		return
	}
	slog.Info("pages scheduler: publishing due pages", "count", len(ids))
	for _, id := range ids {
		p, err := s.repo.Publish(ctx, id)
		if err != nil {
			slog.Error("pages scheduler: publish failed",
				"page_id", id.String(), "err", err)
			metrics.Default.CounterInc("pages_scheduled_published_total",
				"Auto-published pages by scheduler outcome",
				map[string]string{"result": "error"},
			)
			continue
		}
		if s.purger != nil {
			s.purger.PurgePage(ctx, p.SiteID, p.Slug)
		}
		metrics.Default.CounterInc("pages_scheduled_published_total",
			"Auto-published pages by scheduler outcome",
			map[string]string{"result": "success"},
		)
	}
}
