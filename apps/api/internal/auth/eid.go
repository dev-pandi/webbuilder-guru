package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/webbuilder/api/internal/httpx"
)

// EIDHandler — "Masuk dengan e.id" (https://docs.e.id/en/oauth-sso, API v1.1).
// Satu alur untuk login dan daftar, polanya sama dengan GoogleHandler:
//
//  1. Browser → GET /api/v1/auth/eid/authorize?next=/dashboard
//     → cookie state http-only (nonce + next) → 302 ke e.id /oauth/verify.
//  2. e.id → GET /api/v1/auth/eid/callback?code=…
//     → tukar code (get-token) → baca profil (get-profile) → upsert user →
//     terbitkan JWT kita → 302 ${WebBaseURL}/auth/callback#access_token=…
//
// e.id bukan OIDC: tidak ada state yang dikembalikan, tidak ada id_token, dan
// tidak ada ID pengguna permanen, jadi akun dicocokkan lewat email. Cookie
// state tetap dipakai untuk membawa `next` dan memastikan callback datang
// dari alur yang dimulai browser ini.
type EIDHandler struct {
	repo         *Repo
	authH        *Handler
	clientID     string
	clientSecret string
	apiBase      string
	callbackURL  string
	webBaseURL   string
	http         *http.Client
	enabled      bool
}

func NewEIDHandler(repo *Repo, authH *Handler, clientID, clientSecret, apiBase, callbackURL, webBaseURL string) *EIDHandler {
	return &EIDHandler{
		repo:         repo,
		authH:        authH,
		clientID:     clientID,
		clientSecret: clientSecret,
		apiBase:      strings.TrimRight(apiBase, "/"),
		callbackURL:  callbackURL,
		webBaseURL:   strings.TrimRight(webBaseURL, "/"),
		http:         &http.Client{Timeout: 10 * time.Second},
		enabled:      clientID != "" && clientSecret != "" && apiBase != "",
	}
}

func (h *EIDHandler) Enabled() bool { return h.enabled }

const (
	eidStateCookie    = "wb_eid_oauth_state"
	eidStateCookieTTL = 10 * time.Minute
)

// Authorize — mulai alur. Ini navigasi browser, jadi kegagalan dikembalikan
// sebagai redirect ke /login (bukan JSON) supaya user melihat pesan.
func (h *EIDHandler) Authorize(c *fiber.Ctx) error {
	next := sanitizeNextPath(c.Query("next"))
	if !h.enabled {
		return h.redirectError(c, next, "eid_not_configured")
	}
	nonce, err := randomHex(16)
	if err != nil {
		return h.redirectError(c, next, "eid_failed")
	}
	c.Cookie(&fiber.Cookie{
		Name:     eidStateCookie,
		Value:    nonce + "." + next,
		Path:     "/",
		HTTPOnly: true,
		Secure:   c.Protocol() == "https",
		SameSite: "Lax",
		MaxAge:   int(eidStateCookieTTL.Seconds()),
	})
	q := url.Values{}
	q.Set("client_id", h.clientID)
	q.Set("callback_url", h.callbackURL)
	return c.Redirect(h.apiBase+"/api/v1.1/oauth/verify?"+q.Encode(), fiber.StatusFound)
}

func (h *EIDHandler) Callback(c *fiber.Ctx) error {
	cookieState := c.Cookies(eidStateCookie)
	// Sekali pakai — hapus apa pun hasilnya.
	c.Cookie(&fiber.Cookie{Name: eidStateCookie, Value: "", Path: "/", MaxAge: -1})
	_, next, _ := strings.Cut(cookieState, ".")
	next = sanitizeNextPath(next)

	if !h.enabled {
		return h.redirectError(c, next, "eid_not_configured")
	}
	// Tanpa cookie = callback tidak berasal dari tombol di browser ini (atau
	// sudah lewat 10 menit). Kalau suatu saat e.id mengembalikan state, cocokkan.
	if cookieState == "" {
		return h.redirectError(c, next, "eid_state_mismatch")
	}
	if s := c.Query("state"); s != "" && s != cookieState {
		return h.redirectError(c, next, "eid_state_mismatch")
	}
	code := c.Query("code")
	if c.Query("error") != "" || code == "" {
		return h.redirectError(c, next, "eid_cancelled")
	}

	ctx, cancel := context.WithTimeout(c.Context(), 20*time.Second)
	defer cancel()

	token, err := h.getToken(ctx, code)
	if err != nil {
		slog.Error("eid oauth: token exchange failed", "error", err)
		if strings.Contains(err.Error(), "OAUTH.INVALID_OR_EXPIRED_CODE") {
			return h.redirectError(c, next, "eid_code_expired")
		}
		return h.redirectError(c, next, "eid_exchange_failed")
	}
	raw, err := h.getProfile(ctx, token)
	if err != nil {
		slog.Error("eid oauth: get profile failed", "error", err)
		return h.redirectError(c, next, "eid_profile_failed")
	}
	profile := normalizeEIDProfile(raw)
	if profile.Email == "" {
		return h.redirectError(c, next, "eid_no_email")
	}

	u, err := h.repo.UpsertEIDUser(ctx, profile)
	if err != nil {
		slog.Error("eid oauth: upsert user failed", "error", err)
		return h.redirectError(c, next, "eid_user_failed")
	}
	// Reseller pending/suspended tetap terkunci, sama seperti login password.
	if AllowLoginForRole(u) != nil {
		return h.redirectError(c, next, "eid_role_locked")
	}
	access, refresh, err := h.authH.MintTokensFor(ctx, u)
	if err != nil {
		slog.Error("eid oauth: token mint failed", "error", err)
		return h.redirectError(c, next, "eid_failed")
	}
	fragment := url.Values{}
	fragment.Set("access_token", access)
	fragment.Set("refresh_token", refresh)
	fragment.Set("next", next)
	return c.Redirect(h.webBaseURL+"/auth/callback#"+fragment.Encode(), fiber.StatusFound)
}

func (h *EIDHandler) redirectError(c *fiber.Ctx, next, code string) error {
	q := url.Values{}
	q.Set("error", code)
	if next != "" && next != "/dashboard" {
		q.Set("next", next)
	}
	return c.Redirect(h.webBaseURL+"/login?"+q.Encode(), fiber.StatusFound)
}

// eidEnvelope — semua respons e.id: { status, message, data }. Kode error
// (mis. OAUTH.INVALID_OR_EXPIRED_CODE) ada di message.
type eidEnvelope[T any] struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    *T     `json:"data"`
}

type eidProfileResp struct {
	Email   string `json:"email"`
	Profile struct {
		FullName         string  `json:"fullname"`
		PhoneNumber      string  `json:"phonenumber"`
		CountryPhoneCode string  `json:"countryphonecode"`
		Address          string  `json:"address"`
		Tier             flexInt `json:"tier"`
	} `json:"profile"`
}

func (h *EIDHandler) getToken(ctx context.Context, code string) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"client_id":     h.clientID,
		"client_secret": h.clientSecret,
		"code":          code,
		"redirect_uri":  h.callbackURL,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.apiBase+"/api/v1.1/oauth/get-token", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	var out eidEnvelope[struct {
		Token string `json:"token"`
	}]
	if err := h.do(req, &out); err != nil {
		return "", err
	}
	if out.Data.Token == "" {
		return "", fmt.Errorf("e.id get-token: empty token")
	}
	return out.Data.Token, nil
}

func (h *EIDHandler) getProfile(ctx context.Context, token string) (*eidProfileResp, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		h.apiBase+"/api/v1.1/oauth/get-profile?scope=email:profile", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	var out eidEnvelope[eidProfileResp]
	if err := h.do(req, &out); err != nil {
		return nil, err
	}
	return out.Data, nil
}

// do — kirim request dan decode envelope; status HTTP ≠ 2xx, status=false,
// atau data null dianggap gagal dengan message e.id di dalam error.
func (h *EIDHandler) do(req *http.Request, out interface {
	ok() (bool, string)
}) error {
	resp, err := h.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if err := json.Unmarshal(b, out); err != nil {
		return fmt.Errorf("e.id %s: HTTP %d, body bukan JSON", req.URL.Path, resp.StatusCode)
	}
	if ok, msg := out.ok(); !ok || resp.StatusCode/100 != 2 {
		return fmt.Errorf("e.id %s: HTTP %d %s", req.URL.Path, resp.StatusCode, msg)
	}
	return nil
}

func (e *eidEnvelope[T]) ok() (bool, string) { return e.Status && e.Data != nil, e.Message }

// flexInt — docs e.id menulis tier sebagai integer tapi contohnya string;
// terima keduanya supaya perbedaan kecil di sisi e.id tidak memutus login.
type flexInt int

func (f *flexInt) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "" || s == "null" {
		*f = 0
		return nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		*f = 0
		return nil
	}
	*f = flexInt(n)
	return nil
}

// normalizeEIDProfile — data e.id dipakai mengisi kontak registrar (EPP),
// jadi aturan sama dengan edit profil: ASCII, panjang terbatas. Yang tidak
// lolos dikosongkan; user mengisinya sendiri nanti.
func normalizeEIDProfile(p *eidProfileResp) EIDProfile {
	out := EIDProfile{
		Email: strings.ToLower(strings.TrimSpace(p.Email)),
		Tier:  int(p.Profile.Tier),
	}
	if n := strings.TrimSpace(p.Profile.FullName); len(n) <= 128 && IsASCIIPrintable(n) {
		out.FullName = n
	}
	if a := strings.TrimSpace(p.Profile.Address); len(a) <= 255 && IsASCIIPrintable(a) {
		out.Address = a
	}
	if ph := eidPhone(p.Profile.CountryPhoneCode, p.Profile.PhoneNumber); ph != "" && len(ph) <= 32 && ValidPhone(ph) {
		out.Phone = ph
	}
	return out
}

// eidPhone — gabung kode negara + nomor jadi "+62812…". e.id bisa saja
// mengirim nomor dengan 0 di depan atau sudah ber-"+"; keduanya ditangani.
func eidPhone(cc, num string) string {
	num = strings.TrimSpace(num)
	cc = strings.TrimLeft(strings.TrimSpace(cc), "+")
	if num == "" {
		return ""
	}
	if strings.HasPrefix(num, "+") || cc == "" {
		return num
	}
	num = strings.TrimLeft(num, "0")
	if strings.HasPrefix(num, cc) && len(num) > len(cc)+6 {
		return "+" + num
	}
	return "+" + cc + num
}

// ProvidersHandler — GET /api/v1/auth/providers. Halaman login/daftar
// memakainya untuk menampilkan hanya tombol SSO yang sudah dikonfigurasi.
func ProvidersHandler(g *GoogleHandler, e *EIDHandler) fiber.Handler {
	return func(c *fiber.Ctx) error {
		return httpx.OK(c, fiber.Map{
			"google": g != nil && g.Enabled(),
			"eid":    e != nil && e.Enabled(),
		})
	}
}
