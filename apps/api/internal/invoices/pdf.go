package invoices

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/webbuilder/api/internal/settings"
)

// PDFRenderer — interface untuk render invoice ke PDF bytes. Impl bisa
// pakai wkhtmltopdf, chromium headless, gofpdf, dsb. — MVP disini stub
// HTML rendering (return HTML sebagai fallback kalau PDF library belum
// terintegrasi).
//
// Consumer (handler.GetPDFMine / GetPDFAdmin) call ini setelah fetch invoice
// dengan lines hydrated.
type PDFRenderer interface {
	Render(ctx context.Context, inv *Invoice) ([]byte, error)
}

// HTMLRenderer — MVP renderer yang generate HTML markup (untuk render di
// browser atau di-convert ke PDF via external tool nanti). Pakai
// settings.Service untuk fetch brand info + PPN label.
//
// Output HTML self-contained (inline CSS), UTF-8, print-friendly A4 layout.
type HTMLRenderer struct {
	settings *settings.Service
}

func NewHTMLRenderer(s *settings.Service) *HTMLRenderer {
	return &HTMLRenderer{settings: s}
}

// Render — build HTML dari template + Invoice data.
//
// Untuk MVP: return HTML bytes dengan Content-Type override di handler
// (application/pdf). Ini SEMENTARA supaya endpoint /pdf functional.
// Follow-up: swap pakai wkhtmltopdf/chromium binary yang produce actual PDF.
func (r *HTMLRenderer) Render(ctx context.Context, inv *Invoice) ([]byte, error) {
	if inv == nil {
		return nil, errors.New("invoice nil")
	}
	// Fetch brand info via settings (default fallback kalau service nil).
	brandName := "Web Builder"
	brandAddress := ""
	brandTaxID := ""
	supportEmail := ""
	supportPhone := ""
	ppnLabel := "PPN"
	if r.settings != nil {
		brandName = r.settings.BrandCompanyName(ctx)
		brandAddress = r.settings.BrandAddress(ctx)
		brandTaxID = r.settings.BrandTaxID(ctx)
		supportEmail = r.settings.BrandSupportEmail(ctx)
		supportPhone = r.settings.BrandSupportPhone(ctx)
		ppnLabel = r.settings.PPNLabel(ctx)
	}

	var b strings.Builder
	fmt.Fprintf(&b, `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Invoice %s</title>`, inv.Number)
	b.WriteString(`<style>
	body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;padding:32px;max-width:720px;margin:auto}
	.hdr{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #eee;padding-bottom:16px;margin-bottom:24px}
	.brand h1{margin:0;font-size:20px}
	.brand p{margin:2px 0;font-size:12px;color:#555}
	.inv{text-align:right}
	.inv h2{margin:0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.05em}
	.inv .num{font-size:16px;font-weight:600;margin-top:4px}
	.status{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase}
	.status.paid{background:#d1fae5;color:#065f46}
	.status.unpaid{background:#fef3c7;color:#92400e}
	.status.expired,.status.cancelled{background:#fee2e2;color:#991b1b}
	table{width:100%;border-collapse:collapse;margin:16px 0}
	th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #eee;font-size:13px}
	th{background:#f9fafb;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.03em;color:#666}
	.right{text-align:right}
	.totals{margin-top:16px;margin-left:auto;width:280px}
	.totals .row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
	.totals .total{border-top:2px solid #111;padding-top:8px;margin-top:8px;font-weight:700;font-size:15px}
	.footer{margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#888}
	</style></head><body>`)

	// Header.
	fmt.Fprintf(&b, `<div class="hdr"><div class="brand"><h1>%s</h1>`, htmlEscape(brandName))
	if brandAddress != "" {
		fmt.Fprintf(&b, `<p>%s</p>`, htmlEscape(brandAddress))
	}
	if brandTaxID != "" {
		fmt.Fprintf(&b, `<p>NPWP: %s</p>`, htmlEscape(brandTaxID))
	}
	b.WriteString(`</div><div class="inv"><h2>Invoice</h2>`)
	fmt.Fprintf(&b, `<div class="num">%s</div>`, htmlEscape(inv.Number))
	fmt.Fprintf(&b, `<div class="status %s">%s</div>`, string(inv.Status), string(inv.Status))
	fmt.Fprintf(&b, `<div style="margin-top:8px;font-size:12px;color:#555">Tanggal: %s</div>`,
		inv.CreatedAt.Format("2 January 2006"))
	if inv.Status == StatusUnpaid || inv.Status == StatusDraft {
		fmt.Fprintf(&b, `<div style="font-size:12px;color:#555">Jatuh tempo: %s</div>`,
			inv.DueAt.Format("2 January 2006 15:04"))
	}
	if inv.PaidAt != nil {
		fmt.Fprintf(&b, `<div style="font-size:12px;color:#555">Dibayar: %s</div>`,
			inv.PaidAt.Format("2 January 2006 15:04"))
	}
	b.WriteString(`</div></div>`)

	// Line items.
	b.WriteString(`<table><thead><tr><th>Deskripsi</th><th class="right">Qty</th><th class="right">Harga Satuan</th><th class="right">Subtotal</th></tr></thead><tbody>`)
	for _, l := range inv.Lines {
		fmt.Fprintf(&b, `<tr><td>%s</td><td class="right">%d</td><td class="right">Rp %s</td><td class="right">Rp %s</td></tr>`,
			htmlEscape(l.Description), l.Quantity,
			formatIDR(l.UnitPrice), formatIDR(l.Subtotal))
	}
	b.WriteString(`</tbody></table>`)

	// Totals.
	b.WriteString(`<div class="totals">`)
	fmt.Fprintf(&b, `<div class="row"><span>Subtotal</span><span>Rp %s</span></div>`, formatIDR(inv.Subtotal))
	if inv.TaxAmount > 0 {
		fmt.Fprintf(&b, `<div class="row"><span>%s</span><span>Rp %s</span></div>`,
			htmlEscape(ppnLabel), formatIDR(inv.TaxAmount))
	}
	fmt.Fprintf(&b, `<div class="row total"><span>Total</span><span>Rp %s</span></div>`, formatIDR(inv.Total))
	b.WriteString(`</div>`)

	// Footer.
	b.WriteString(`<div class="footer">`)
	if supportEmail != "" || supportPhone != "" {
		b.WriteString(`Butuh bantuan? Hubungi `)
		if supportEmail != "" {
			fmt.Fprintf(&b, `<a href="mailto:%s">%s</a>`, htmlEscape(supportEmail), htmlEscape(supportEmail))
		}
		if supportEmail != "" && supportPhone != "" {
			b.WriteString(` atau `)
		}
		if supportPhone != "" {
			b.WriteString(htmlEscape(supportPhone))
		}
		b.WriteString(`.`)
	}
	fmt.Fprintf(&b, `<br>Dibuat oleh %s.`, htmlEscape(brandName))
	b.WriteString(`</div></body></html>`)

	return []byte(b.String()), nil
}

// formatIDR — helper: 12000000 → "12.000.000". Sama dengan paymentgw ver.
func formatIDR(amount int64) string {
	s := fmt.Sprintf("%d", amount)
	if len(s) <= 3 {
		return s
	}
	var out strings.Builder
	pre := len(s) % 3
	if pre > 0 {
		out.WriteString(s[:pre])
		if len(s) > pre {
			out.WriteByte('.')
		}
	}
	for i := pre; i < len(s); i += 3 {
		out.WriteString(s[i : i+3])
		if i+3 < len(s) {
			out.WriteByte('.')
		}
	}
	return out.String()
}

// htmlEscape — minimal escape untuk template safety. Kita tidak pakai
// html/template supaya string building tetap simpel + performant.
var htmlReplacer = strings.NewReplacer(
	"&", "&amp;",
	"<", "&lt;",
	">", "&gt;",
	"\"", "&quot;",
	"'", "&#39;",
)

func htmlEscape(s string) string { return htmlReplacer.Replace(s) }
