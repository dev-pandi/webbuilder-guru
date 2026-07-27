package assets

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/metrics"
)

// SiteCleaner — hapus semua file storage (S3/local) milik site tertentu.
// DB row `assets` sudah cascade lewat FK `assets.site_id REFERENCES sites`,
// tapi file bytes di object storage butuh cleanup terpisah — kalau tidak,
// akumulasi orphan bertumbuh terus & biaya storage naik tanpa alasan.
//
// Kontrak: implementasi `sites.AssetCleaner` interface. Fire-and-forget
// goroutine — caller (sites.Delete) tidak block response. Kalau storage
// call gagal, log warn + metric; retry manual via admin tool nanti.
type SiteCleaner struct {
	repo    *Repo
	storage Storage
}

func NewSiteCleaner(repo *Repo, storage Storage) *SiteCleaner {
	return &SiteCleaner{repo: repo, storage: storage}
}

// CleanupSite fetch semua asset URL untuk site, lalu hapus files di storage.
// Dipanggil SEBELUM DB cascade delete supaya row assets masih ada untuk
// di-lookup. Detach dari request ctx (background) supaya HTTP response
// tidak nunggu network call ke S3.
func (c *SiteCleaner) CleanupSite(_ context.Context, siteID uuid.UUID) {
	if c == nil || c.storage == nil || c.repo == nil {
		return
	}
	// Snapshot URL list dengan short ctx supaya cascade delete tidak
	// keburu jalan sebelum kita baca. 5 detik cukup untuk ratusan asset.
	snapCtx, snapCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer snapCancel()
	items, err := c.repo.ListBySite(snapCtx, siteID)
	if err != nil {
		slog.Warn("site asset cleanup: list failed",
			"site_id", siteID.String(), "err", err)
		metrics.Default.CounterInc("site_asset_cleanup_total",
			"Asset file cleanup on site delete outcome",
			map[string]string{"result": "list_failed"},
		)
		return
	}
	if len(items) == 0 {
		metrics.Default.CounterInc("site_asset_cleanup_total",
			"Asset file cleanup on site delete outcome",
			map[string]string{"result": "no_assets"},
		)
		return
	}
	// Snapshot URLs jadi slice ringan supaya goroutine tidak pegang Asset
	// struct lengkap. Sekali cascade delete jalan, DB rows hilang tapi
	// kita sudah punya URL semua.
	urls := make([]string, 0, len(items))
	for _, a := range items {
		urls = append(urls, a.URL)
	}
	go doCleanup(c.storage, siteID, urls)
}

// doCleanup — worker actual di background. Iterasi urls, extract key, call
// storage.Delete. Timeout longgar (60s untuk hundreds of files, S3 typically
// 100ms per call).
func doCleanup(storage Storage, siteID uuid.UUID, urls []string) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	var ok, failed int
	for _, u := range urls {
		key := storageKeyFromURL(u)
		if key == "" {
			continue
		}
		if err := storage.Delete(ctx, key); err != nil {
			slog.Warn("site asset cleanup: file delete failed",
				"site_id", siteID.String(), "key", key, "err", err)
			failed++
			continue
		}
		ok++
	}
	slog.Info("site asset cleanup: done",
		"site_id", siteID.String(), "deleted", ok, "failed", failed)
	metrics.Default.CounterInc("site_asset_cleanup_total",
		"Asset file cleanup on site delete outcome",
		map[string]string{"result": "success"},
	)
	if failed > 0 {
		metrics.Default.CounterInc("site_asset_cleanup_files_failed_total",
			"Individual asset file delete failures",
			nil,
		)
	}
}
