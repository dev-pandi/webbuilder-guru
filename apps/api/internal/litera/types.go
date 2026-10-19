// Package litera — client + config repo untuk integrasi Literaa NFT publishing.
//
// Flow produksi:
//  1. Admin isi credentials + smart contract defaults di /admin/settings/litera.
//  2. Guru enable toggle "Jadikan Koleksi Digital Litera" di form artikel,
//     opsional isi unlockable + quiz.
//  3. Saat publish, backend hook panggil Register (async) → store intent_id.
//  4. Renderer embed widget JS Litera di detail page artikel.
//  5. Admin verifikasi + mint di dashboard Literaa (/creator).
//
// Semua config live di DB (table litera_config singleton) supaya admin bisa
// rotate API key tanpa restart.

package litera

import (
	"errors"
	"time"
)

// Config — isi 1 baris singleton di tabel litera_config. Snapshot in-memory
// buat caching (TTL 60s).
type Config struct {
	APIKey                      string    `json:"api_key"`
	BaseURL                     string    `json:"base_url"`
	CollectionName              string    `json:"collection_name"`
	DefaultPrice                int64     `json:"default_price"`
	DefaultFeeEnabled           bool      `json:"default_fee_enabled"`
	DefaultMaxMinted            int       `json:"default_max_minted"`
	DefaultUserReward           int64     `json:"default_user_reward"`
	DefaultCreatorMintReward    int64     `json:"default_creator_mint_reward"`
	DefaultCreatorApproveReward int64     `json:"default_creator_approve_reward"`
	Enabled                     bool      `json:"enabled"`
	UpdatedAt                   time.Time `json:"updated_at"`
}

// IsReady — client bisa dipakai kalau enabled + API key non-empty.
func (c Config) IsReady() bool {
	return c.Enabled && c.APIKey != "" && c.BaseURL != ""
}

// QuizQuestion — 1 pertanyaan pilihan ganda dengan 4 opsi + 1 correct.
type QuizQuestion struct {
	Question      string   `json:"question"`
	Options       []string `json:"options"`       // exactly 4 (A/B/C/D)
	CorrectOption string   `json:"correctOption"` // "A" | "B" | "C" | "D"
}

// QuizPayload — passing score + list pertanyaan (1-3).
type QuizPayload struct {
	PassingScore int            `json:"passingScore"`
	Questions    []QuizQuestion `json:"questions"`
}

// IsEmpty — true kalau quiz kosong (tidak ada pertanyaan).
func (q QuizPayload) IsEmpty() bool {
	return len(q.Questions) == 0
}

// RegisterRequest — payload lengkap untuk POST /cms/articles/register.
// Field marked `omitempty` di-skip saat Marshal kalau zero value.
type RegisterRequest struct {
	ArticleURL            string `json:"articleUrl"`
	Title                 string `json:"title"`
	Author                string `json:"author"`
	Description           string `json:"description"`
	CoverImageURL         string `json:"coverImageUrl"`
	UnlockableURL         string `json:"unlockableUrl,omitempty"`
	UnlockableDescription string `json:"unlockableDescription,omitempty"`
	// Price                   int64        `json:"price"`
	// FeeEnabled              bool         `json:"feeEnabled"`
	// MaxMinted               int          `json:"maxMinted"`
	// UserReward              int64        `json:"userReward"`
	// CreatorMintReward       int64        `json:"creatorMintReward"`
	// CreatorApproveReward    int64        `json:"creatorApproveReward"`
	CollectionName string       `json:"collectionName"`
	Quiz           *QuizPayload `json:"quiz,omitempty"`
}

// DomainRegisterRequest — payload POST /cms/domains/register.
type DomainRegisterRequest struct {
	Domains []string `json:"domains"`
}

// DomainRegisterResponse — envelope sukses pendaftaran domain.
type DomainRegisterResponse struct {
	Success bool `json:"success"`
	Data    struct {
		AutoApproved bool     `json:"autoApproved"`
		Added        []string `json:"added"`
	} `json:"data"`
	Meta struct {
		CorrelationID string `json:"correlationId"`
	} `json:"meta"`
}

// RegisterResponse — envelope sukses dari Litera.
type RegisterResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Created bool `json:"created"`
		Intent  struct {
			ID         string `json:"id"`
			ArticleURL string `json:"articleUrl"`
			Title      string `json:"title"`
			Status     string `json:"status"`
		} `json:"intent"`
		EmbedCode string `json:"embedCode"`
	} `json:"data"`
	Meta struct {
		Version       string `json:"version"`
		CorrelationID string `json:"correlationId"`
	} `json:"meta"`
}

// Sentinel errors — pattern-match pakai errors.Is di handler.
var (
	// ErrDisabled — config.Enabled=false atau API key kosong. Bukan error
	// user; feature-gated.
	ErrDisabled = errors.New("litera: integration disabled or not configured")
	// ErrUnauthorized — 401. API key invalid/revoked.
	ErrUnauthorized = errors.New("litera: unauthorized (invalid API key)")
	// ErrDomainNotAllowed — 403. Domain artikel belum di CORS allowlist.
	// JANGAN retry membabi buta: doc menyebut >=5 pelanggaran dalam 10 menit
	// memicu AUTO_MINT_SUSPENDED yang hanya pulih lewat wallet signature.
	// Penanganan benar = daftarkan domain via RegisterDomain lalu coba sekali.
	ErrDomainNotAllowed = errors.New("litera: domain not in CORS whitelist")
	// ErrDomainOutOfScope — 400 saat daftar domain. API key di-scope ke root
	// domain lain, jadi hostname ini tidak akan pernah bisa didaftarkan.
	ErrDomainOutOfScope = errors.New("litera: hostname di luar scope root domain API key")
	// ErrRateLimit — 429. Backoff retry.
	ErrRateLimit = errors.New("litera: rate limit exceeded")
	// ErrNotFound — 404. Khusus endpoint Resolve: artikel belum di-mint.
	// Bukan error di konteks register.
	ErrNotFound = errors.New("litera: not found")
)

// APIError — detail error dari respons Litera (non-sentinel).
type APIError struct {
	StatusCode    int
	CorrelationID string
	Body          string
}

func (e *APIError) Error() string {
	return "litera api error: status=" + httpStatusText(e.StatusCode) + " correlation=" + e.CorrelationID + " body=" + e.Body
}

func httpStatusText(code int) string {
	// Minimal mapping — satisfy Error() tanpa import net/http (sedikit paranoid
	// karena types.go sebaiknya tidak depend ke runtime stdlib non-essential).
	switch code {
	case 400:
		return "400 Bad Request"
	case 401:
		return "401 Unauthorized"
	case 403:
		return "403 Forbidden"
	case 404:
		return "404 Not Found"
	case 429:
		return "429 Too Many Requests"
	case 500:
		return "500 Internal Server Error"
	}
	return itoa(code)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := make([]byte, 0, 12)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
