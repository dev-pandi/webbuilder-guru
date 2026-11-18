package siteseed

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Local files are referenced as "./img/foto.webp", relative to the seed
// folder. Same raster/audio allowlist as the dashboard upload (no SVG: it can
// carry script that runs on the uploads origin).
var (
	fileRefRe = regexp.MustCompile(`(?i)^\./[a-z0-9_\-./]+\.(png|jpe?g|webp|gif|mp3|m4a|ogg|wav)$`)
	mdImageRe = regexp.MustCompile(`\]\((\./[^)\s]+)\)`)
	mimeByExt = map[string]string{
		".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
		".webp": "image/webp", ".gif": "image/gif",
		".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav",
	}
)

const maxFileBytes = 10 * 1024 * 1024 // matches assets.MaxUploadBytes

// Uploader turns a validated local file into a public URL.
type Uploader interface {
	Upload(ctx context.Context, absPath string) (string, error)
}

func isFileRef(s string) bool { return fileRefRe.MatchString(s) }

// localPath resolves a "./..." reference and refuses anything that escapes
// the seed folder, so a seed copied from elsewhere can't read arbitrary files.
func (s *Spec) localPath(ref string) (string, error) {
	clean := filepath.Clean(filepath.Join(s.Dir, filepath.FromSlash(ref)))
	if !strings.HasPrefix(clean, s.Dir+string(filepath.Separator)) {
		return "", fmt.Errorf("%s: path keluar dari folder seed", ref)
	}
	st, err := os.Stat(clean)
	if err != nil {
		return "", fmt.Errorf("%s: file tidak ditemukan", ref)
	}
	if st.Size() > maxFileBytes {
		return "", fmt.Errorf("%s: ukuran %d byte melebihi batas 10 MB", ref, st.Size())
	}
	return clean, nil
}

// resolver uploads each distinct file once per run.
type resolver struct {
	spec  *Spec
	up    Uploader
	cache map[string]string
}

func (r *resolver) url(ctx context.Context, ref string) (string, error) {
	if !isFileRef(ref) {
		// "./x.svg" is a mistake worth stopping for; "./kelas" is just text.
		if strings.HasPrefix(ref, "./") && filepath.Ext(ref) != "" && !strings.ContainsAny(ref, " \n") {
			return "", fmt.Errorf("%s: ekstensi tidak didukung (png, jpg, webp, gif, mp3, m4a, ogg, wav)", ref)
		}
		return ref, nil
	}
	if u, ok := r.cache[ref]; ok {
		return u, nil
	}
	abs, err := r.spec.localPath(ref)
	if err != nil {
		return "", err
	}
	u, err := r.up.Upload(ctx, abs)
	if err != nil {
		return "", fmt.Errorf("upload %s: %w", ref, err)
	}
	r.cache[ref] = u
	return u, nil
}

// resolveFiles rewrites every "./..." reference in the spec to an uploaded URL.
func resolveFiles(ctx context.Context, s *Spec, up Uploader) error {
	r := &resolver{spec: s, up: up, cache: map[string]string{}}
	var err error
	str := func(p *string) {
		if err == nil && *p != "" {
			*p, err = r.url(ctx, *p)
		}
	}
	blocks := func(list []json.RawMessage) {
		for i := range list {
			if err == nil {
				list[i], err = r.rewriteJSON(ctx, list[i])
			}
		}
	}
	body := func(p *string) {
		if err == nil {
			*p, err = r.rewriteMarkdown(ctx, *p)
		}
	}

	blocks(s.Site.Header)
	blocks(s.Site.Footer)
	for i := range s.Pages {
		blocks(s.Pages[i].Blocks)
	}
	for i := range s.Banners {
		str(&s.Banners[i].Image)
	}
	if s.Profile != nil {
		str(&s.Profile.ProfileImage)
	}
	for i := range s.Articles {
		str(&s.Articles[i].Cover)
		body(&s.Articles[i].Body)
	}
	for i := range s.Materials {
		str(&s.Materials[i].Cover)
		body(&s.Materials[i].Body)
	}
	return err
}

func (r *resolver) rewriteJSON(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber() // keep 3 as 3, not 3.0e+00
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	v, err := r.walk(ctx, v)
	if err != nil {
		return nil, err
	}
	return json.Marshal(v)
}

func (r *resolver) walk(ctx context.Context, v any) (any, error) {
	switch t := v.(type) {
	case string:
		return r.url(ctx, t)
	case []any:
		for i := range t {
			nv, err := r.walk(ctx, t[i])
			if err != nil {
				return nil, err
			}
			t[i] = nv
		}
	case map[string]any:
		for k := range t {
			nv, err := r.walk(ctx, t[k])
			if err != nil {
				return nil, err
			}
			t[k] = nv
		}
	}
	return v, nil
}

func (r *resolver) rewriteMarkdown(ctx context.Context, md string) (string, error) {
	var firstErr error
	out := mdImageRe.ReplaceAllStringFunc(md, func(m string) string {
		ref := mdImageRe.FindStringSubmatch(m)[1]
		u, err := r.url(ctx, ref)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			return m
		}
		return "](" + u + ")"
	})
	return out, firstErr
}

// dryRunUploader validates files exist without touching storage.
type dryRunUploader struct{ count int }

func (d *dryRunUploader) Upload(_ context.Context, absPath string) (string, error) {
	if _, ok := mimeByExt[strings.ToLower(filepath.Ext(absPath))]; !ok {
		return "", errors.New("ekstensi tidak didukung")
	}
	d.count++
	return "dry-run://" + filepath.Base(absPath), nil
}
