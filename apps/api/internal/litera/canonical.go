package litera

import (
	"strings"
)

// CanonicalArticleURL — build URL byte-persis sama dengan renderer path artikel.
// Format: https://{host}/{rubric}/{slug}
//
// Doc Litera menegaskan URL harus "kanonis dan byte-persis sama di semua
// langkah" — satu beda slash = tidak cocok. Jadi semua pemanggil wajib
// pakai helper ini (jangan string concat ad-hoc).
//
// host: hostname site (bukan URL dengan scheme). Fungsi strip trailing slash,
// pastikan lowercase, dan skip "www." prefix supaya canonical.
func CanonicalArticleURL(host, rubric, slug string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	host = strings.TrimPrefix(host, "www.")
	host = strings.TrimRight(host, "/")

	rubric = strings.TrimSpace(strings.Trim(rubric, "/"))
	slug = strings.TrimSpace(strings.Trim(slug, "/"))

	return "https://" + host + "/" + rubric + "/" + slug
}
