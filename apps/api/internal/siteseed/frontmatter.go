package siteseed

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// wib anchors date-only values to a sensible local hour so "2026-10-01" is
// shown as 1 Oktober everywhere, not 30 September in UTC renderers.
var wib = time.FixedZone("WIB", 7*3600)

// frontMatter is a deliberately tiny "key: value" header — no YAML dependency,
// and nothing a teacher editing the file could get subtly wrong (no quoting,
// no indentation). Lists are comma-separated.
type frontMatter map[string]string

func readMarkdown(path string) (frontMatter, string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	fm, body, err := splitFrontMatter(string(raw))
	if err != nil {
		return nil, "", fileErr(path, err)
	}
	return fm, body, nil
}

func splitFrontMatter(src string) (frontMatter, string, error) {
	src = strings.TrimPrefix(src, "\xEF\xBB\xBF")
	src = strings.ReplaceAll(src, "\r\n", "\n")
	if !strings.HasPrefix(src, "---\n") {
		return nil, "", errors.New("file harus diawali front matter '---'")
	}
	rest := src[len("---\n"):]
	end := strings.Index(rest, "\n---\n")
	if end < 0 {
		if strings.HasSuffix(rest, "\n---") {
			end = len(rest) - len("\n---")
		} else {
			return nil, "", errors.New("penutup front matter '---' tidak ditemukan")
		}
	}
	header := rest[:end]
	body := ""
	if end+len("\n---\n") <= len(rest) {
		body = rest[end+len("\n---\n"):]
	}

	fm := frontMatter{}
	sc := bufio.NewScanner(strings.NewReader(header))
	line := 0
	for sc.Scan() {
		line++
		text := strings.TrimSpace(sc.Text())
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		key, val, ok := strings.Cut(text, ":")
		if !ok {
			return nil, "", fmt.Errorf("front matter baris %d: format harus 'kunci: nilai'", line)
		}
		key = strings.TrimSpace(key)
		if _, dup := fm[key]; dup {
			return nil, "", fmt.Errorf("front matter: kunci %q dobel", key)
		}
		fm[key] = strings.TrimSpace(val)
	}
	return fm, strings.TrimSpace(body) + "\n", nil
}

func (fm frontMatter) str(key string) string { return fm[key] }

func (fm frontMatter) strOr(key, def string) string {
	if v := fm[key]; v != "" {
		return v
	}
	return def
}

func (fm frontMatter) list(key string) []string {
	out := []string{}
	for _, part := range strings.Split(fm[key], ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func (fm frontMatter) boolOr(key string, def bool) (bool, error) {
	switch strings.ToLower(fm[key]) {
	case "":
		return def, nil
	case "true", "ya", "yes":
		return true, nil
	case "false", "tidak", "no":
		return false, nil
	}
	return false, fmt.Errorf("%s harus true/false, dapat %q", key, fm[key])
}

func (fm frontMatter) intOr(key string, def int) (int, error) {
	if fm[key] == "" {
		return def, nil
	}
	return parseInt(key, fm[key])
}

func (fm frontMatter) date(key string) (*time.Time, error) {
	v := fm[key]
	if v == "" {
		return nil, nil
	}
	for _, layout := range []string{"2006-01-02 15:04", "2006-01-02"} {
		if t, err := time.ParseInLocation(layout, v, wib); err == nil {
			if layout == "2006-01-02" {
				t = t.Add(8 * time.Hour)
			}
			return &t, nil
		}
	}
	return nil, fmt.Errorf("%s harus format YYYY-MM-DD atau 'YYYY-MM-DD HH:MM', dapat %q", key, v)
}

// unknown rejects typos like "titel:" that would otherwise be silently ignored.
func (fm frontMatter) unknown(allowed ...string) error {
	ok := map[string]bool{}
	for _, k := range allowed {
		ok[k] = true
	}
	var bad []string
	for k := range fm {
		if !ok[k] {
			bad = append(bad, k)
		}
	}
	if len(bad) == 0 {
		return nil
	}
	sort.Strings(bad)
	return fmt.Errorf("kunci front matter tidak dikenal: %s (yang boleh: %s)",
		strings.Join(bad, ", "), strings.Join(allowed, ", "))
}
