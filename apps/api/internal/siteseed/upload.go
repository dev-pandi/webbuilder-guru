package siteseed

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "golang.org/x/image/webp"

	"github.com/webbuilder/api/internal/assets"
)

// StorageUploader stores seed files in the site's asset library (so they
// count toward the storage quota and show up in the dashboard). Keys are
// content-addressed, so re-running a seed reuses files instead of piling up.
type StorageUploader struct {
	pool     *pgxpool.Pool
	storage  assets.Storage
	target   *Target
	uploaded int
}

func NewStorageUploader(pool *pgxpool.Pool, storage assets.Storage, t *Target) *StorageUploader {
	return &StorageUploader{pool: pool, storage: storage, target: t}
}

func (u *StorageUploader) Uploaded() int { return u.uploaded }

func (u *StorageUploader) Upload(ctx context.Context, absPath string) (string, error) {
	ext := strings.ToLower(filepath.Ext(absPath))
	mime, ok := mimeByExt[ext]
	if !ok {
		return "", errors.New("ekstensi tidak didukung")
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	name := "seed-" + hex.EncodeToString(sum[:8]) + ext

	var existing string
	err = u.pool.QueryRow(ctx,
		`SELECT url FROM assets WHERE site_id = $1 AND url LIKE '%/' || $2 LIMIT 1`,
		u.target.SiteID, name).Scan(&existing)
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	var used int64
	if err := u.pool.QueryRow(ctx,
		`SELECT COALESCE(sum(size), 0) FROM assets WHERE site_id = $1`, u.target.SiteID).Scan(&used); err != nil {
		return "", err
	}
	if q := u.target.QuotaStorage; q > 0 && used+int64(len(data)) > q {
		return "", fmt.Errorf("kuota penyimpanan situs penuh (%d dari %d byte)", used, q)
	}

	key := u.target.SiteID.String() + "/" + name
	url, err := u.storage.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mime)
	if err != nil {
		return "", err
	}
	var w, h *int
	if strings.HasPrefix(mime, "image/") {
		if cfg, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil {
			w, h = &cfg.Width, &cfg.Height
		}
	}
	if _, err := u.pool.Exec(ctx,
		`INSERT INTO assets (site_id, kind, url, size, mime, width, height) VALUES ($1, 'image', $2, $3, $4, $5, $6)`,
		u.target.SiteID, url, len(data), mime, w, h); err != nil {
		return "", err
	}
	u.uploaded++
	return url, nil
}
