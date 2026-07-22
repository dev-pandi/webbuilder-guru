package assets

import (
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// s3Storage works for both MinIO (self-hosted) and AWS S3,
// because they share the same protocol.
type s3Storage struct {
	client    *minio.Client
	bucket    string
	publicURL string
}

func newS3Storage(ctx context.Context, cfg Config) (*s3Storage, error) {
	if cfg.S3Endpoint == "" || cfg.S3Bucket == "" || cfg.S3PublicURL == "" {
		return nil, fmt.Errorf("s3 driver requires STORAGE_S3_ENDPOINT, STORAGE_S3_BUCKET, STORAGE_S3_PUBLIC_URL")
	}
	cli, err := minio.New(cfg.S3Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		Secure: cfg.S3UseSSL,
		Region: cfg.S3Region,
	})
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}

	exists, err := cli.BucketExists(ctx, cfg.S3Bucket)
	if err != nil {
		return nil, fmt.Errorf("bucket check: %w", err)
	}
	if !exists {
		if err := cli.MakeBucket(ctx, cfg.S3Bucket, minio.MakeBucketOptions{Region: cfg.S3Region}); err != nil {
			return nil, fmt.Errorf("make bucket: %w", err)
		}
	}

	// Public-read so URLs work without signing. For AWS S3 in production,
	// prefer a CDN (CloudFront) + signed URLs instead.
	policy := fmt.Sprintf(`{
	  "Version":"2012-10-17",
	  "Statement":[{
	    "Effect":"Allow",
	    "Principal":{"AWS":["*"]},
	    "Action":["s3:GetObject"],
	    "Resource":["arn:aws:s3:::%s/*"]
	  }]
	}`, cfg.S3Bucket)
	_ = cli.SetBucketPolicy(ctx, cfg.S3Bucket, policy)

	return &s3Storage{
		client:    cli,
		bucket:    cfg.S3Bucket,
		publicURL: strings.TrimRight(cfg.S3PublicURL, "/"),
	}, nil
}

func (s *s3Storage) Driver() string { return string(DriverS3) }

func (s *s3Storage) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error) {
	_, err := s.client.PutObject(ctx, s.bucket, key, r, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}
	return s.publicURL + "/" + key, nil
}

func (s *s3Storage) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	// GetObject di minio-go returns *Object yang satisfies io.ReadCloser.
	// Object baru error saat pertama kali di-Read; caller yang handle 404.
	return s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
}

func (s *s3Storage) Delete(ctx context.Context, key string) error {
	// RemoveObject idempotent secara semantic — S3 balik 204 kalau key tidak ada.
	return s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
}
