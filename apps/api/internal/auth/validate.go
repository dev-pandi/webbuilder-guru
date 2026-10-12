package auth

// Validation helpers untuk field yang akan diteruskan ke EPP contact
// (RFC 5733). Registry PANDI reject bentuk non-standard dengan 2004/2005
// syntax error — kita jaga di sini biar user dapat pesan jelas sebelum
// uang terdebit / webhook mem-provisioning.

import (
	"regexp"
	"strings"
)

// emailRe — pragmatic RFC 5322 subset. Reject spasi, kutip, komentar.
// Cukup untuk gate input user "foo@" / "foo bar@baz" / "foo@@@" tanpa
// masuk permissive-permissive full RFC yang 90% software tidak dukung.
var emailRe = regexp.MustCompile(
	`^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$`,
)

// ValidEmail — true kalau syntax dasar lolos. Panjang total ≤ 254 per RFC.
func ValidEmail(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || len(s) > 254 {
		return false
	}
	return emailRe.MatchString(s)
}

// IsASCIIPrintable — hanya karakter printable ASCII (0x20-0x7E).
// EPP contact:create pakai PostalInfoInternational per RFC 5733 §2.6 →
// field wajib ASCII. Kalau user input "José" / "Ñoño" / emoji, EPP
// return 2001.
func IsASCIIPrintable(s string) bool {
	for _, r := range s {
		if r < 0x20 || r > 0x7E {
			return false
		}
	}
	return true
}

// ValidPhone — minimal 7 digit setelah strip non-digit (international min
// per ITU E.164). Normalisasi real-nya di api-registry/normalizePhoneE164;
// di sini cukup gate "garbage input" supaya tidak masuk DB.
func ValidPhone(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	digits := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits++
		}
	}
	return digits >= 7 && digits <= 15
}

// ValidPostalCode — numeric 4-10 digit. Lentur supaya tetap support format
// non-ID (US ZIP 5+4 = 9 digit dengan dash → stripped jadi 9 digit).
func ValidPostalCode(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" {
		return false
	}
	digits := 0
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits++
			continue
		}
		if r == '-' || r == ' ' {
			continue
		}
		return false
	}
	return digits >= 4 && digits <= 10
}
