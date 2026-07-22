package registrar

import (
	"context"
	"fmt"
)

// Login authenticates dengan email + password reseller ke registrar.
//
//	POST /v1/api/user/login
//	body: {"email": "...", "password": "..."}
//
// Registrar-api pakai gin-jwt yang balik JWT di header `Authorization`
// response atau body. Format response tergantung implementasi login handler
// di registrar — spec plan.md §4.3 bilang JWT TTL 30 hari untuk reseller.
//
// Return raw JWT string (tanpa "Bearer " prefix). Caller (main.go refresh
// loop) yang panggil SetAPIKey.
//
// Note: dipanggil DENGAN client yang existing (bahkan kalau apiKey-nya
// invalid), tapi Login endpoint anonymous — Authorization header dikirim
// tapi registrar ignore. Aman.
func (c *Client) Login(ctx context.Context, email, password string) (string, error) {
	var raw resellerLoginResp
	body := map[string]string{"email": email, "password": password}
	if err := c.do(ctx, "POST", "/v1/api/user/login", body, &raw); err != nil {
		return "", err
	}
	// gin-jwt library default response shape:
	//   { "code": 200, "expire": "...", "token": "eyJ..." }
	// Beberapa custom impl pakai key beda ("access_token", "jwt"). Fallback
	// ke semua field yang mungkin — return non-empty pertama.
	if raw.Token != "" {
		return raw.Token, nil
	}
	if raw.AccessToken != "" {
		return raw.AccessToken, nil
	}
	if raw.JWT != "" {
		return raw.JWT, nil
	}
	return "", fmt.Errorf("registrar login: JWT tidak ditemukan di response (cek shape response registrar's login handler)")
}

// resellerLoginResp — flat parse (bukan envelope) karena gin-jwt.LoginHandler
// balik di root, bukan di `{data: ...}`. Cover 3 nama field yang umum
// (token, access_token, jwt).
type resellerLoginResp struct {
	Token       string `json:"token,omitempty"`
	AccessToken string `json:"access_token,omitempty"`
	JWT         string `json:"jwt,omitempty"`
}
