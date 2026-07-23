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

// Category = shape response dari GET /v1/api/get-category (registrar public).
// ID = registrar's categories.id (dipakai sebagai `category_id` di document
// upload). Web builder simpan ini di user_documents.registrar_category_id.
type Category struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	ParentID int    `json:"parent_id,omitempty"`
}

// ListCategories fetches semua category (public, no auth). Return apa
// adanya dari registrar — tidak filter/pagination di sini. Payload kecil
// (< 20 rows biasanya), aman untuk single-call.
func (c *Client) ListCategories(ctx context.Context) ([]Category, error) {
	var env envelope[[]Category]
	if err := c.do(ctx, "GET", "/v1/api/get-category", nil, &env); err != nil {
		return nil, err
	}
	return env.Data, nil
}

// UploadDocumentForJob mengirim file dokumen (multipart) ke reseller endpoint:
//
//	POST /v1/api/user/reseller/domain/register/:job_id/documents
//	body: multipart/form-data
//	  file:        <binary>
//	  category_id: <int>   (registrar's categories.id — misal 1 = KTP)
//
// Content-Type header berisi boundary yang tepat, dan Authorization: Bearer
// (reseller JWT) sama dengan endpoint reseller lain.
//
// Retry: single attempt. Multipart upload umumnya idempotent di sisi
// registrar (attach dokumen), tapi retry otomatis multipart harus rebuild
// buffer — untuk simplicity, biar caller yang decide retry.
func (c *Client) UploadDocumentForJob(
	ctx context.Context,
	jobID string,
	categoryID int,
	filename string,
	contentType string,
	file io.Reader,
) (*UploadDocumentResp, error) {
	// Build multipart body in-memory. Untuk dokumen KTP/NPWP ukuran max 8 MiB,
	// buffer in-memory reasonable — kalau nanti dipakai untuk file besar,
	// switch ke io.Pipe streaming.
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// category_id field
	if err := mw.WriteField("category_id", fmt.Sprint(categoryID)); err != nil {
		return nil, fmt.Errorf("multipart write field: %w", err)
	}

	// file field — with proper Content-Disposition + Content-Type
	partHeader := make(map[string][]string)
	partHeader["Content-Disposition"] = []string{
		fmt.Sprintf(`form-data; name="file"; filename=%q`, filename),
	}
	if contentType != "" {
		partHeader["Content-Type"] = []string{contentType}
	}
	part, err := mw.CreatePart(partHeader)
	if err != nil {
		return nil, fmt.Errorf("multipart create part: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("multipart copy file: %w", err)
	}
	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("multipart close: %w", err)
	}

	url := c.baseURL + "/v1/api/user/reseller/domain/register/" + jobID + "/documents"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &buf)
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
		return nil, fmt.Errorf("registrar upload: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, decodeError(resp.StatusCode, raw)
	}

	var env envelope[UploadDocumentResp]
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &env); err != nil {
			return nil, fmt.Errorf("decode response: %w (body: %s)", err, snip(raw))
		}
	}
	return &env.Data, nil
}

// UploadDocumentResp = shape dari POST /register/:job_id/documents response
// (per bruno spec 04 Upload Document.bru line 33).
type UploadDocumentResp struct {
	JobID          string `json:"job_id"`
	DocumentID     int    `json:"document_id"`
	Status         string `json:"status"`
	StatusAdvanced bool   `json:"status_advanced"`
}

// ListDocuments — GET /v1/api/user/reseller/documents
//
// Query params:
//   - externalUserID: WAJIB dari sisi web builder — filter ke 1 end-user
//     supaya tidak leak KTP end-user lain (registrar allow kosong untuk
//     admin/audit, tapi kita enforce di handler proxy).
//   - categoryID: opsional filter (0 = semua)
//   - all: true → non-paginated (buat picker dropdown)
//   - page, perPage: dipakai kalau all=false
//
// Response wrapped di envelope, `Pagination` any (registrar shape bisa berubah).
func (c *Client) ListDocuments(
	ctx context.Context,
	externalUserID string,
	categoryID uint64,
	page, perPage int,
	all bool,
) (*DocumentListResponse, error) {
	q := url.Values{}
	if externalUserID != "" {
		q.Set("external_user_id", externalUserID)
	}
	if categoryID > 0 {
		q.Set("category_id", strconv.FormatUint(categoryID, 10))
	}
	if all {
		q.Set("all", "true")
	} else {
		if page > 0 {
			q.Set("page", strconv.Itoa(page))
		}
		if perPage > 0 {
			q.Set("perPage", strconv.Itoa(perPage))
		}
	}
	path := "/v1/api/user/reseller/documents"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var env envelope[DocumentListResponse]
	if err := c.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}

// UploadDocument — POST /v1/api/user/reseller/documents (pre-attach flow).
//
// Beda dari UploadDocumentForJob (yang scope ke 1 job untuk post-payment
// upload), ini upload ke library reseller yang di-tag ke external_user_id.
// Return `Document` yang ID-nya bisa dipakai di RegisterRequest.DocumentIDs.
//
// Multipart fields:
//   - file             : binary (png/jpg/jpeg/pdf, max 8 MiB)
//   - external_user_id : WAJIB — end-user tag (web builder users.id)
//   - category_id      : WAJIB — 1 = KTP, 2 = NPWP, dst.
//   - name             : opsional label untuk display
func (c *Client) UploadDocument(
	ctx context.Context,
	externalUserID string,
	categoryID uint64,
	name string,
	filename string,
	contentType string,
	file io.Reader,
) (*Document, error) {
	if externalUserID == "" {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "external_user_id wajib"}
	}
	if categoryID == 0 {
		return nil, &APIError{Status: 400, Code: "bad_request", Msg: "category_id wajib"}
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	if err := mw.WriteField("external_user_id", externalUserID); err != nil {
		return nil, fmt.Errorf("multipart write external_user_id: %w", err)
	}
	if err := mw.WriteField("category_id", strconv.FormatUint(categoryID, 10)); err != nil {
		return nil, fmt.Errorf("multipart write category_id: %w", err)
	}
	if name != "" {
		if err := mw.WriteField("name", name); err != nil {
			return nil, fmt.Errorf("multipart write name: %w", err)
		}
	}

	partHeader := make(map[string][]string)
	partHeader["Content-Disposition"] = []string{
		fmt.Sprintf(`form-data; name="file"; filename=%q`, filename),
	}
	if contentType != "" {
		partHeader["Content-Type"] = []string{contentType}
	}
	part, err := mw.CreatePart(partHeader)
	if err != nil {
		return nil, fmt.Errorf("multipart create part: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return nil, fmt.Errorf("multipart copy file: %w", err)
	}
	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("multipart close: %w", err)
	}

	u := c.baseURL + "/v1/api/user/reseller/documents"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, &buf)
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
		return nil, fmt.Errorf("registrar upload doc: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, decodeError(resp.StatusCode, raw)
	}

	var env envelope[Document]
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &env); err != nil {
			return nil, fmt.Errorf("decode response: %w (body: %s)", err, snip(raw))
		}
	}
	return &env.Data, nil
}
