package exports

import (
	"embed"
	"mime"
	"path"
	"strings"
)

// Aset template bawaan di-embed ke binary, bukan diunduh dari renderer. Kalau
// lewat HTTP, hasil export jadi bergantung pada renderer hidup + URL-nya
// terkonfigurasi benar — padahal file-nya sudah kita miliki sejak build.
//
//go:embed static/templates
var builtinAssets embed.FS

// builtinAsset melayani src root-relative seperti /templates/<slug>/foto.png.
func builtinAsset(src string) ([]byte, string, bool) {
	if !strings.HasPrefix(src, "/templates/") || strings.Contains(src, "..") {
		return nil, "", false
	}
	clean := path.Clean(strings.SplitN(src, "?", 2)[0])
	body, err := builtinAssets.ReadFile("static" + clean)
	if err != nil {
		return nil, "", false
	}
	return body, mime.TypeByExtension(path.Ext(clean)), true
}
