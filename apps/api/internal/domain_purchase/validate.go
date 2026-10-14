package domain_purchase

import (
	"fmt"
	"strings"
)

// SLD length policy untuk zone .id:
//   - Direct SLD (1 label sebelum .id, mis. "nike.id"): min 5 karakter
//   - Second-level (2+ label sebelum .id, mis. "ab.co.id"): SLD min 3 karakter
//
// Alasan: nama pendek seperti "abc.id" / "ab.co.id" biasanya **domain premium**
// yang punya harga khusus di registry PANDI (jauh di atas harga standard).
// Platform catalog hanya support satu tier harga per TLD, jadi kalau user
// bisa beli domain premium dengan harga biasa, kita rugi margin / bentrok
// dengan registry billing. Blokir di sini sebagai safeguard business.
//
// Rule hanya berlaku untuk .id (regulasi PANDI punya definisi premium
// terjelas). TLD lain tidak di-restrict di sini.
const (
	minSLDDirectID  = 5 // "nike" boleh di "nike.id"? → 4 char, BLOCK
	minSLDSecondLvl = 3 // "ab" di "ab.co.id"? → 2 char, BLOCK
)

// validateDomainLength — enforce SLD length policy untuk .id zones. Return
// error user-facing kalau SLD terlalu pendek. Dipakai di:
//   - Purchase (handler.go) — gate sebelum invoice + payment
//   - checkDomain (handler.go) — skip EPP call + mark unavailable di grid
//
// Input: FQDN lowercase, misal "nike.id", "abc.co.id", "nike.my.id".
// Return nil kalau lolos (TLD non-id juga dianggap lolos di sini).
func validateDomainLength(fqdn string) error {
	parts := strings.Split(strings.ToLower(fqdn), ".")
	if len(parts) < 2 {
		return nil // bentuk invalid lain — handled oleh validator FQDN upstream
	}
	// Enforce hanya untuk .id (regulasi PANDI).
	if parts[len(parts)-1] != "id" {
		return nil
	}
	sld := parts[0]
	if len(parts) == 2 {
		// Direct SLD: "sld.id"
		if len(sld) < minSLDDirectID {
			return fmt.Errorf(
				"domain .id langsung minimal %d karakter — '%s.id' adalah domain premium yang belum didukung platform",
				minSLDDirectID, sld,
			)
		}
		return nil
	}
	// Second-level: "sld.co.id", "sld.ac.id", "sld.sch.id", "sld.my.id", dsb.
	if len(sld) < minSLDSecondLvl {
		suffix := strings.Join(parts[1:], ".")
		return fmt.Errorf(
			"domain %s minimal %d karakter — '%s.%s' adalah domain premium yang belum didukung platform",
			suffix, minSLDSecondLvl, sld, suffix,
		)
	}
	return nil
}
