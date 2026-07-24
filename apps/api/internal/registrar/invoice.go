package registrar

import (
	"context"
	"net/url"
	"strconv"
	"strings"
)

// ListInvoices — GET /v1/api/user/reseller/invoices
//
// Query invoice list milik reseller yang login (auth pakai JWT reseller).
// Filter externalUserID wajib di-inject caller dari JWT claims web builder
// (bukan trust body request) supaya user A tidak lihat invoice user B.
//
// Params:
//   - externalUserID : UUID user web-builder (WAJIB — enforce isolation)
//   - status         : opsional, comma-separated alias (unpaid, paid, dst.)
//   - search         : opsional, filter domain name (LIKE %search%)
//   - page, perPage  : pagination standard
func (c *Client) ListInvoices(
	ctx context.Context,
	externalUserID string,
	status string,
	search string,
	page, perPage int,
) (*InvoiceListResponse, error) {
	q := url.Values{}
	if externalUserID != "" {
		q.Set("external_user_id", externalUserID)
	}
	if s := strings.TrimSpace(status); s != "" {
		q.Set("status", s)
	}
	if s := strings.TrimSpace(search); s != "" {
		q.Set("search", s)
	}
	if page > 0 {
		q.Set("page", strconv.Itoa(page))
	}
	if perPage > 0 {
		q.Set("perPage", strconv.Itoa(perPage))
	}
	path := "/v1/api/user/reseller/invoices"
	if enc := q.Encode(); enc != "" {
		path += "?" + enc
	}
	var env envelope[InvoiceListResponse]
	if err := c.do(ctx, "GET", path, nil, &env); err != nil {
		return nil, err
	}
	return &env.Data, nil
}
