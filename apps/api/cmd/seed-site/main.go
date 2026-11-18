// Command seed-site applies a content seed folder (see seeds/README.md) to one
// existing site. Usage:
//
//	go run ./cmd/seed-site -dir seeds/mahagurux -site mahagurux.my.id -dry-run
//	go run ./cmd/seed-site -dir seeds/mahagurux -site mahagurux.my.id -prune
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"

	"github.com/webbuilder/api/internal/assets"
	"github.com/webbuilder/api/internal/config"
	"github.com/webbuilder/api/internal/db"
	"github.com/webbuilder/api/internal/siteseed"
)

func main() {
	dir := flag.String("dir", "", "folder seed (berisi seed.json)")
	site := flag.String("site", "", "domain, UUID, atau slug situs tujuan")
	prune := flag.Bool("prune", false, "hapus halaman/tulisan/materi/banner yang tidak ada di seed")
	draft := flag.Bool("draft", false, "simpan halaman sebagai draf saja (versi live tidak berubah)")
	dryRun := flag.Bool("dry-run", false, "tampilkan rencana tanpa menyimpan apa pun")
	flag.Parse()
	if *dir == "" || *site == "" {
		fmt.Fprintln(os.Stderr, "pemakaian: seed-site -dir <folder> -site <domain|uuid|slug> [-dry-run] [-prune] [-draft]")
		os.Exit(2)
	}
	if err := run(*dir, *site, siteseed.Options{Prune: *prune, Draft: *draft, DryRun: *dryRun}); err != nil {
		fmt.Fprintln(os.Stderr, "gagal:", err)
		os.Exit(1)
	}
}

func run(dir, site string, opt siteseed.Options) error {
	_ = godotenv.Load()
	cfg := config.Load()

	spec, err := siteseed.Load(dir)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	pool, err := db.ConnectWith(ctx, cfg.DatabaseURL, db.PoolOptions{MaxConns: 2})
	if err != nil {
		return fmt.Errorf("koneksi database: %w", err)
	}
	defer pool.Close()

	t, err := siteseed.FindSite(ctx, pool, site)
	if err != nil {
		return fmt.Errorf("%s: %w", site, err)
	}
	fmt.Printf("Situs   : %s (%s) — status %s\n", t.Name, t.SiteID, t.Status)
	fmt.Printf("Pemilik : %s\n", t.OwnerEmail)
	fmt.Printf("Seed    : %d halaman, %d tulisan, %d materi, %d banner\n",
		len(spec.Pages), len(spec.Articles), len(spec.Materials), len(spec.Banners))

	var up siteseed.Uploader
	if !opt.DryRun {
		storage, err := assets.NewStorage(ctx, assets.Config{
			Driver:         assets.Driver(cfg.StorageDriver),
			S3Endpoint:     cfg.StorageS3Endpoint,
			S3AccessKey:    cfg.StorageS3AccessKey,
			S3SecretKey:    cfg.StorageS3SecretKey,
			S3Region:       cfg.StorageS3Region,
			S3Bucket:       cfg.StorageS3Bucket,
			S3UseSSL:       cfg.StorageS3UseSSL,
			S3PublicURL:    cfg.StorageS3PublicURL,
			LocalDir:       cfg.StorageLocalDir,
			LocalPublicURL: cfg.StorageLocalPublicURL,
		})
		if err != nil {
			return fmt.Errorf("storage: %w", err)
		}
		if storage == nil {
			return fmt.Errorf("storage belum dikonfigurasi (STORAGE_DRIVER)")
		}
		up = siteseed.NewStorageUploader(pool, storage, t)
	}

	res, err := siteseed.Apply(ctx, pool, up, t, spec, opt)
	if err != nil {
		return err
	}

	mode := "Selesai"
	if opt.DryRun {
		mode = "Dry-run (tidak ada yang disimpan)"
	}
	fmt.Printf("\n%s:\n", mode)
	line := func(what string, c siteseed.Counts) {
		fmt.Printf("  %-8s %d baru, %d diperbarui, %d dihapus\n", what, c.Created, c.Updated, c.Deleted)
	}
	line("halaman", res.Pages)
	line("tulisan", res.Articles)
	line("materi", res.Materials)
	line("banner", res.Banners)
	uploaded := "diunggah"
	if opt.DryRun {
		uploaded = "akan diunggah (yang sudah ada dipakai ulang)"
	}
	fmt.Printf("  %-8s %d %s\n", "file", res.Files, uploaded)
	for _, d := range res.Deleted {
		fmt.Printf("  - hapus %s\n", d)
	}
	for _, w := range res.Warnings {
		fmt.Printf("  ! %s\n", w)
	}
	if !opt.Prune {
		fmt.Println("\nTip: konten lama yang tidak ada di seed tetap ada. Tambah -prune (coba dulu dengan -dry-run) untuk membersihkannya.")
	}
	return nil
}
