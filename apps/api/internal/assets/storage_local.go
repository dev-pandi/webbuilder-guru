package assets

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// localStorage writes uploaded files to disk. The API exposes these files via
// a static route mounted at LocalPublicURL's path. Suitable for single-server
// deployments or local dev.
type localStorage struct {
	dir       string
	publicURL string
	baseAbs   string // resolved absolute base for traversal guard
}

func newLocalStorage(cfg Config) (*localStorage, error) {
	dir := cfg.LocalDir
	if dir == "" {
		dir = "./uploads"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create local dir: %w", err)
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	public := cfg.LocalPublicURL
	if public == "" {
		public = "http://localhost:8080/uploads"
	}
	return &localStorage{
		dir:       dir,
		publicURL: strings.TrimRight(public, "/"),
		baseAbs:   abs,
	}, nil
}

func (l *localStorage) Driver() string { return string(DriverLocal) }

// LocalDir returns the on-disk directory — used by the API to mount a static route.
func (l *localStorage) LocalDir() string { return l.baseAbs }

// LocalRoute returns the path prefix to mount (derived from publicURL).
// Falls back to "/uploads" if the public URL has no path.
func (l *localStorage) LocalRoute() string {
	// Find the path portion of the public URL, e.g. "http://api.localhost/uploads" -> "/uploads".
	idx := strings.Index(l.publicURL, "://")
	rest := l.publicURL
	if idx >= 0 {
		rest = l.publicURL[idx+3:]
	}
	if slash := strings.Index(rest, "/"); slash >= 0 {
		path := rest[slash:]
		if path == "" {
			return "/uploads"
		}
		return path
	}
	return "/uploads"
}

// resolveKey menerjemahkan storage key → absolute path, dengan traversal guard
// yang sama dipakai Put. Return error kalau key coba escape baseAbs.
func (l *localStorage) resolveKey(key string) (string, error) {
	full := filepath.Join(l.baseAbs, filepath.FromSlash(key))
	cleaned, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(cleaned, l.baseAbs+string(os.PathSeparator)) && cleaned != l.baseAbs {
		return "", fmt.Errorf("invalid key (path traversal)")
	}
	return cleaned, nil
}

func (l *localStorage) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	_ = ctx
	cleaned, err := l.resolveKey(key)
	if err != nil {
		return nil, err
	}
	return os.Open(cleaned)
}

func (l *localStorage) Delete(ctx context.Context, key string) error {
	_ = ctx
	cleaned, err := l.resolveKey(key)
	if err != nil {
		return err
	}
	// os.Remove errors kalau file tidak ada; idempotent: swallow ErrNotExist.
	if err := os.Remove(cleaned); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (l *localStorage) Put(ctx context.Context, key string, r io.Reader, size int64, contentType string) (string, error) {
	_ = ctx
	_ = size
	_ = contentType
	full := filepath.Join(l.baseAbs, filepath.FromSlash(key))
	// path traversal guard: resolved path must remain inside baseAbs.
	cleaned, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(cleaned, l.baseAbs+string(os.PathSeparator)) && cleaned != l.baseAbs {
		return "", fmt.Errorf("invalid key (path traversal)")
	}
	if err := os.MkdirAll(filepath.Dir(cleaned), 0o755); err != nil {
		return "", err
	}
	f, err := os.Create(cleaned)
	if err != nil {
		return "", err
	}
	defer f.Close()
	if _, err := io.Copy(f, r); err != nil {
		return "", err
	}
	return l.publicURL + "/" + key, nil
}
