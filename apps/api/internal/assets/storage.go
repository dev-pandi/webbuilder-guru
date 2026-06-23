package assets

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type Storage struct {
	client    *minio.Client
	bucket    string
	publicURL string // base URL prepended to object keys (no trailing slash)
}

type StorageConfig struct {
	Endpoint   string // host:port for SDK (e.g. "minio:9000")
	AccessKey  string
	SecretKey  string
	UseSSL     bool
	Bucket     string
	PublicURL  string // browser-visible base URL (e.g. "http://localhost:9000/assets")
}

func NewStorage(ctx context.Context, cfg StorageConfig) (*Storage, error) {
	cli, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("minio client: %w", err)
	}

	exists, err := cli.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("bucket exists check: %w", err)
	}
	if !exists {
		if err := cli.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("make bucket: %w", err)
		}
	}

	// Public-read policy so generated URLs work without signing.
	policy := fmt.Sprintf(`{
	  "Version":"2012-10-17",
	  "Statement":[{
	    "Effect":"Allow",
	    "Principal":{"AWS":["*"]},
	    "Action":["s3:GetObject"],
	    "Resource":["arn:aws:s3:::%s/*"]
	  }]
	}`, cfg.Bucket)
	_ = cli.SetBucketPolicy(ctx, cfg.Bucket, policy)

	return &Storage{
		client:    cli,
		bucket:    cfg.Bucket,
		publicURL: strings.TrimRight(cfg.PublicURL, "/"),
	}, nil
}

// Put uploads an object and returns a browser-accessible URL.
// `key` must already be URL-safe (we generate them, no user-provided characters).
func (s *Storage) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error) {
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}
	return s.publicURL + "/" + key, nil
}

var _ = url.PathEscape // keep import while we may add signed-URL support
