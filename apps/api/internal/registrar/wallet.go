package registrar

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
)

// DEPRECATED (Fase 1 self-sufficient): Wallet endpoints — proxy ke
// registrar-api reseller wallet. Diganti dengan `internal/wallet_local`
// yang authoritative di web builder DB.
//
// Timeline removal: setelah frontend fully migrate ke `/wallet/v2` endpoint.
// Sampai itu, method di file ini tetap available untuk hybrid mode
// (`REGISTRAR_API_URL` set). Kalau self-sufficient (`REGISTRAR_API_URL=""`),
// semua method di sini akan error "not configured" saat di-call.
//
// Lihat [docs/migration-registrar-to-api-registry.md] Step 5 untuk migrate
// balance existing dari registrar-api ke wallet_local.

// GetWallet — GET /v1/api/user/reseller/wallet.
// Return balance + recent 20 ledger entries. Auto-init wallet row di registrar
// side kalau reseller baru (idempotent EnsureExists).
func (c *Client) GetWallet(ctx context.Context) (*Wallet, error) {
	var env envelope[Wallet]
	if err := c.do(ctx, "GET", "/v1/api/user/reseller/wallet", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// ListWalletLedger — GET /v1/api/user/reseller/wallet/ledger.
// Paginated ledger + optional kind filter (topup / debit_register / dst.).
func (c *Client) ListWalletLedger(ctx context.Context, kind string, page, perPage int) (*WalletLedgerListResponse, error) {
	q := url.Values{}
	if kind != "" {
		q.Set("kind", kind)
	}
	if page > 0 {
		q.Set("page", strconv.Itoa(page))
	}
	if perPage > 0 {
		q.Set("perPage", strconv.Itoa(perPage))
	}
	path := "/v1/api/user/reseller/wallet/ledger"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var env envelope[WalletLedgerListResponse]
	if err := c.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// InitTopup — POST /v1/api/user/reseller/wallet/topup.
// Bikin invoice + payment_history + topup_job. Idempotent via (user_id,
// idempotency_key) dalam TTL 24 jam.
func (c *Client) InitTopup(ctx context.Context, req TopupRequest) (*TopupResponse, error) {
	var env envelope[TopupResponse]
	if err := c.do(ctx, "POST", "/v1/api/user/reseller/wallet/topup", req, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// GetTopupStatus — GET /v1/api/user/reseller/wallet/topup/:topup_id/status.
// Polling status untuk gateway (menunggu callback) atau manual_transfer
// (menunggu admin verify).
func (c *Client) GetTopupStatus(ctx context.Context, topupID string) (*TopupStatus, error) {
	var env envelope[TopupStatus]
	if err := c.do(ctx, "GET", "/v1/api/user/reseller/wallet/topup/"+url.PathEscape(topupID)+"/status", nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// ListMyTopups — GET /v1/api/user/reseller/wallet/topup.
// `status` alias: "ongoing" (default), "history", "all", atau CSV literal.
func (c *Client) ListMyTopups(ctx context.Context, status string, page, perPage int) (*TopupListResponse, error) {
	q := url.Values{}
	if status != "" {
		q.Set("status", status)
	}
	if page > 0 {
		q.Set("page", strconv.Itoa(page))
	}
	if perPage > 0 {
		q.Set("perPage", strconv.Itoa(perPage))
	}
	path := "/v1/api/user/reseller/wallet/topup"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var env envelope[TopupListResponse]
	if err := c.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// ListTopupBanks — GET /v1/api/user/reseller/wallet/topup/banks.
// Daftar rekening bank tujuan (untuk flow manual_transfer). Read-only.
func (c *Client) ListTopupBanks(ctx context.Context) ([]TopupBank, error) {
	var env envelope[[]TopupBank]
	if err := c.do(ctx, "GET", "/v1/api/user/reseller/wallet/topup/banks", nil, &env); err != nil {
		return nil, err
	}
	return env.Data, nil
}

// TopupProofFields — metadata bukti transfer manual yang WAJIB diisi reseller.
// TransferAmount harus == amount top-up (registrar reject kalau mismatch).
// TransferDate opsional (format YYYY-MM-DD kalau di-set).
type TopupProofFields struct {
	BankName       string
	AccountNumber  string
	AccountHolder  string
	TransferAmount float64
	TransferDate   string // YYYY-MM-DD, boleh kosong
}

// UploadTopupProof — POST /v1/api/user/reseller/wallet/topup/:topup_id/proof
// (multipart/form-data). Reseller upload bukti transfer manual + metadata
// pengirim. File di-forward langsung ke registrar (tidak disimpan di web
// builder).
//
// Registrar validasi:
//   - MIME (image/jpeg, image/png, application/pdf) + max 5 MiB
//   - 4 field wajib: bank_name, account_number, account_holder, transfer_amount
//   - transfer_amount == topup.amount (mismatch → 400)
//   - status topup ∈ {awaiting_proof, rejected} (state lain → 409)
//
// Pattern mirror UploadDocumentForJob — retry aman diserahkan ke caller.
func (c *Client) UploadTopupProof(ctx context.Context, topupID, filename, contentType string, file io.Reader, fields TopupProofFields) (*TopupStatus, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// Text fields dulu — pattern standard multipart, urutan tidak strict tapi
	// konvensi nya field metadata sebelum file part.
	textFields := map[string]string{
		"bank_name":       fields.BankName,
		"account_number":  fields.AccountNumber,
		"account_holder":  fields.AccountHolder,
		"transfer_amount": strconv.FormatFloat(fields.TransferAmount, 'f', -1, 64),
	}
	if fields.TransferDate != "" {
		textFields["transfer_date"] = fields.TransferDate
	}
	for k, v := range textFields {
		if err := mw.WriteField(k, v); err != nil {
			return nil, fmt.Errorf("multipart write field %s: %w", k, err)
		}
	}

	partHeader := map[string][]string{
		"Content-Disposition": {fmt.Sprintf(`form-data; name="file"; filename=%q`, filename)},
	}
	if contentType != "" {
		partHeader["Content-Type"] = []string{contentType}
	}
	part, err := mw.CreatePart(partHeader)
	if err != nil {
		return nil, fmt.Errorf("multipart create part: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("multipart copy: %w", err)
	}
	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("multipart close: %w", err)
	}

	reqURL := c.baseURL + "/v1/api/user/reseller/wallet/topup/" + url.PathEscape(topupID) + "/proof"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, &buf)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if key := c.APIKey(); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("registrar upload proof: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, decodeError(resp.StatusCode, raw)
	}

	var env envelope[TopupStatus]
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &env); err != nil {
			return nil, fmt.Errorf("decode response: %w (body: %s)", err, snip(raw))
		}
	}
	return &env.Data, nil
}
