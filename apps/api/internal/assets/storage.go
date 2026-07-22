package assets

import (
	"context"
	"fmt"
	"io"
)

// Storage abstracts where uploaded files live. Implementations:
//   - s3Storage    (s3 driver — works for MinIO and AWS S3)
//   - localStorage (local driver — writes to disk, served via /uploads)
type Storage interface {
	Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) (publicURL string, err error)

	// Get returns a reader for a previously-stored file. Caller MUST close.
	// Errors if key doesn't exist. Used oleh handler yang perlu re-read file
	// tanpa expose public URL (misal forward dokumen KTP ke registrar
	// via multipart — file tetap privat, tidak lewat public URL).
	Get(ctx context.Context, key string) (io.ReadCloser, error)

	// Delete removes a previously-stored file. Idempotent: no error if key
	// tidak ada (biar caller nggak perlu track "sudah delete atau belum").
	Delete(ctx context.Context, key string) error

	Driver() string
}

// LocalServable is implemented by local-disk storage so the API can
// mount a static route to serve uploaded files.
type LocalServable interface {
	LocalDir() string
	LocalRoute() string // path prefix to mount, e.g. "/uploads"
}

type Driver string

const (
	DriverLocal Driver = "local"
	DriverS3    Driver = "s3"
)

type Config struct {
	Driver Driver

	// S3 / MinIO
	S3Endpoint  string
	S3AccessKey string
	S3SecretKey string
	S3Region    string
	S3Bucket    string
	S3UseSSL    bool
	S3PublicURL string // browser-visible base, no trailing slash

	// Local
	LocalDir       string
	LocalPublicURL string
}

// NewStorage selects the driver based on cfg.Driver.
// Empty driver defaults to "local".
func NewStorage(ctx context.Context, cfg Config) (Storage, error) {
	switch cfg.Driver {
	case "", DriverLocal:
		return newLocalStorage(cfg)
	case DriverS3:
		return newS3Storage(ctx, cfg)
	default:
		return nil, fmt.Errorf("unknown storage driver %q", cfg.Driver)
	}
}
