// Package cachepurge bundles domain lookup + Cloudflare purge dalam satu
// helper supaya publish handler (pages + sites + scheduler) tidak masing-
// masing repeat wiring cloudflare + domain_purchase repo.
//
// Semua call fire-and-forget: purge fail = log warn, cache tetap expire
// natural via TTL edge. Publish tidak boleh block/gagal karena purge issue.
package cachepurge

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/cloudflare"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/metrics"
)

// Purger membungkus dependency yang dibutuhkan. Nil-safe: kalau salah satu
// field kosong, semua method return diam-diam (no-op) — mode "fitur disabled".
type Purger struct {
	cf        *cloudflare.Repo
	purchases *domain_purchase.Repo
}

// New — pool + repo di-inject dari main. Kalau `cf` atau `purchases` nil,
// purger jadi no-op (safe pakai di dev tanpa CF config).
func New(cf *cloudflare.Repo, purchases *domain_purchase.Repo) *Purger {
	return &Purger{cf: cf, purchases: purchases}
}

// PurgeSite invalidate SEMUA cache untuk situs (purge_everything zone).
// Dipanggil saat site publish (draft→published) — banyak URL berubah
// sekaligus, lebih murah 1 call purge_everything daripada list per URL.
func (p *Purger) PurgeSite(ctx context.Context, siteID uuid.UUID) {
	if !p.enabled() {
		return
	}
	// Detach dari request ctx — kalau HTTP request selesai, purge tetap jalan.
	go p.doPurge(context.Background(), siteID, nil)
}

// PurgePage invalidate cache untuk 1 halaman spesifik. `slug` = path relative
// tanpa leading `/`; "" atau "_home" berarti root.
func (p *Purger) PurgePage(ctx context.Context, siteID uuid.UUID, slug string) {
	if !p.enabled() {
		return
	}
	urls := pageURLPaths(slug)
	go p.doPurge(context.Background(), siteID, urls)
}

func (p *Purger) enabled() bool {
	return p != nil && p.cf != nil && p.purchases != nil
}

// pageURLPaths convert slug ke daftar URL yang perlu di-invalidate. Home
// page punya 2 alias (`/` dan `/_home`), keduanya dimasukkan supaya edge
// cache yang salah cache alias juga ke-purge.
func pageURLPaths(slug string) []string {
	if slug == "" || slug == "_home" {
		return []string{"/"}
	}
	return []string{"/" + slug}
}

// doPurge — worker actual. Timeout 15s supaya goroutine tidak leak kalau
// CF slow. Return silent — tidak ada caller yang concern.
func (p *Purger) doPurge(ctx context.Context, siteID uuid.UUID, pathPaths []string) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	domain, err := p.purchases.ActiveDomainForSite(ctx, siteID)
	if err != nil {
		slog.Warn("cachepurge: domain lookup failed", "site_id", siteID.String(), "err", err)
		bumpMetric("lookup_failed")
		return
	}
	if domain == "" {
		// Site belum ada domain aktif — tidak ada yang perlu di-purge.
		bumpMetric("no_domain")
		return
	}

	cfg, err := p.cf.GetDefault(ctx)
	if err != nil {
		// Nil-safe (feature disabled) atau DB error. Silent — CF opsional.
		bumpMetric("no_cf_config")
		return
	}
	client := cloudflare.NewClient(*cfg)
	zone, err := client.GetZoneByDomain(ctx, domain)
	if err != nil {
		slog.Warn("cachepurge: zone lookup failed",
			"domain", domain, "err", err)
		bumpMetric("zone_lookup_failed")
		return
	}

	// Build full URLs kalau ada path spesifik; kalau nil = purge_everything.
	var urls []string
	if len(pathPaths) > 0 {
		urls = make([]string, 0, len(pathPaths)*2)
		for _, p := range pathPaths {
			// Purge http + https + www — semua kombinasi yang edge Cloudflare
			// mungkin cache. Bikin sedikit boros tapi 100% correctness.
			urls = append(urls,
				"https://"+domain+p,
				"https://www."+domain+p,
			)
		}
	}
	if err := client.PurgeCache(ctx, zone.ID, urls); err != nil {
		slog.Warn("cachepurge: purge failed",
			"domain", domain, "urls", urls, "err", err)
		bumpMetric("purge_failed")
		return
	}
	slog.Info("cachepurge: purged",
		"domain", domain, "zone_id", zone.ID, "url_count", len(urls))
	bumpMetric("success")
}

func bumpMetric(result string) {
	metrics.Default.CounterInc("cloudflare_cache_purge_total",
		"Cache purge attempts by outcome",
		map[string]string{"result": result},
	)
}
