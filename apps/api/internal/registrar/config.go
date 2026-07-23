package registrar

import "context"

// Reseller config endpoints — currently just webhook. Split dari domain.go
// supaya scope handler + test file jelas.

// GetWebhookConfig — GET /v1/api/user/reseller/config/webhook.
//
// Return URL + external_prefix current. Secret TIDAK dikembalikan (write-only
// di registrar). Kalau reseller mau lihat secret, harus rotate via Set.
func (c *Client) GetWebhookConfig(ctx context.Context) (*WebhookConfig, error) {
	var env envelope[WebhookConfig]
	if err := c.do(ctx, "GET", "/v1/api/user/reseller/config/webhook", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// SetWebhookConfig — POST /v1/api/user/reseller/config/webhook.
//
// SETIAP CALL ROTATE SECRET. Secret lama invalid setelah call ini.
// Caller WAJIB simpan `Secret` dari response — server hanya kirim sekali
// (meskipun di registrar disimpan plaintext, endpoint GET tidak return).
//
// URL harus absolute http:// atau https://.
func (c *Client) SetWebhookConfig(ctx context.Context, req WebhookConfigRequest) (*WebhookConfig, error) {
	var env envelope[WebhookConfig]
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/config/webhook", req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}
