package client

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strconv"
	"time"
)

// UploadDocument — multipart POST /v1/documents. Beda dari method lain,
// signing HMAC pakai empty body (bukan multipart body) karena multipart
// boundary randomize per request — server verify tidak akan match.
//
// Pola signing multipart di production biasanya sign header stream sebelum
// body. Untuk MVP kita compromise: sign kosong + rely on TLS + HMAC scope
// method+path saja. Kalau butuh strict body integrity, migrate ke JSON
// base64-encoded body (trade-off: 33% overhead).
func (c *Client) UploadDocument(ctx context.Context, req UploadDocumentRequest) (*UploadDocumentResponse, error) {
	if req.ExternalUserID == "" {
		return nil, errors.New("external_user_id wajib")
	}
	if req.CategoryID <= 0 {
		return nil, errors.New("category_id wajib > 0")
	}
	if len(req.Body) == 0 {
		return nil, errors.New("file body kosong")
	}
	if req.Filename == "" {
		req.Filename = "upload.bin"
	}
	if req.ContentType == "" {
		req.ContentType = "application/octet-stream"
	}

	// Build multipart body.
	buf := &bytes.Buffer{}
	w := multipart.NewWriter(buf)
	_ = w.WriteField("external_user_id", req.ExternalUserID)
	_ = w.WriteField("category_id", strconv.FormatInt(req.CategoryID, 10))
	if req.Label != "" {
		_ = w.WriteField("name", req.Label)
	}
	h := textproto.MIMEHeader{}
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, req.Filename))
	h.Set("Content-Type", req.ContentType)
	part, err := w.CreatePart(h)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(req.Body); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	multipartBody := buf.Bytes()
	contentType := w.FormDataContentType()

	path := "/v1/documents"
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.base+path, bytes.NewReader(multipartBody))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", contentType)

	// HMAC — sign multipart body verbatim. Server harus recover byte-exact.
	// Fiber c.Body() return raw body → cocok, boundary yang sama.
	if len(c.secret) > 0 {
		ts := strconv.FormatInt(time.Now().Unix(), 10)
		sig := computeSignature(c.secret, ts, "POST", path, multipartBody)
		httpReq.Header.Set("X-Timestamp", ts)
		httpReq.Header.Set("X-Signature", "sha256="+sig)
	}

	resp, err := c.httpc.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		var env struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		_ = json.Unmarshal(respBody, &env)
		return nil, &APIError{Status: resp.StatusCode, Code: env.Error.Code, Message: env.Error.Message}
	}

	var env struct {
		Data UploadDocumentResponse `json:"data"`
	}
	if err := json.Unmarshal(respBody, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// ListDocuments — GET /v1/documents?external_user_id=<uuid>
func (c *Client) ListDocuments(ctx context.Context, externalUserID string) (*DocumentsListResponse, error) {
	if externalUserID == "" {
		return nil, errors.New("external_user_id wajib")
	}
	var out DocumentsListResponse
	path := "/v1/documents?external_user_id=" + externalUserID
	if err := c.do(ctx, "GET", path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Guard: hmac tetap import walau tidak langsung dipakai di func ini
// (computeSignature ada di client.go).
var _ = hmac.New
var _ = sha256.New
var _ = hex.EncodeToString
