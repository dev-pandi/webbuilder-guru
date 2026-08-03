package invoices

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Pure-function tests untuk HTML renderer + formatIDR. No DB.

func TestFormatIDR(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0"},
		{100, "100"},
		{1000, "1.000"},
		{12345, "12.345"},
		{1000000, "1.000.000"},
	}
	for _, tc := range cases {
		if got := formatIDR(tc.in); got != tc.want {
			t.Errorf("formatIDR(%d) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestHTMLEscape(t *testing.T) {
	cases := []struct{ in, want string }{
		{"plain", "plain"},
		{"<script>", "&lt;script&gt;"},
		{"A & B", "A &amp; B"},
		{`"quoted"`, "&quot;quoted&quot;"},
		{"O'Brien", "O&#39;Brien"},
	}
	for _, tc := range cases {
		if got := htmlEscape(tc.in); got != tc.want {
			t.Errorf("htmlEscape(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestHTMLRenderer_Render_BasicShape(t *testing.T) {
	// Render tanpa settings.Service — pakai fallback default (Web Builder brand).
	r := NewHTMLRenderer(nil)
	inv := &Invoice{
		ID:        uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		Number:    "INV-2026-08-000001",
		UserID:    uuid.New(),
		Subtotal:  250000,
		TaxRate:   0.11,
		TaxAmount: 27500,
		Total:     277500,
		Currency:  "IDR",
		Status:    StatusUnpaid,
		DueAt:     time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC),
		CreatedAt: time.Date(2026, 8, 3, 10, 0, 0, 0, time.UTC),
		Lines: []InvoiceLine{
			{
				Description: "Register .id — myshop.id (1 tahun)",
				Quantity:    1,
				UnitPrice:   250000,
				Subtotal:    250000,
			},
		},
	}
	buf, err := r.Render(context.Background(), inv)
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	html := string(buf)

	// Essential elements harus muncul.
	mustContain := []string{
		"INV-2026-08-000001",
		"Web Builder", // default brand fallback
		"myshop.id",
		"Rp 250.000", // subtotal formatted
		"Rp 27.500",  // PPN formatted
		"Rp 277.500", // total formatted
		`class="status unpaid"`,
	}
	for _, s := range mustContain {
		if !strings.Contains(html, s) {
			t.Errorf("output missing %q", s)
		}
	}
}

func TestHTMLRenderer_Render_PaidStatusShowsPaidAt(t *testing.T) {
	r := NewHTMLRenderer(nil)
	paidAt := time.Date(2026, 8, 3, 15, 30, 0, 0, time.UTC)
	inv := &Invoice{
		ID:        uuid.New(),
		Number:    "INV-1",
		Status:    StatusPaid,
		PaidAt:    &paidAt,
		DueAt:     time.Now(),
		CreatedAt: time.Now(),
		Total:     100000,
	}
	buf, _ := r.Render(context.Background(), inv)
	html := string(buf)
	if !strings.Contains(html, "Dibayar") {
		t.Errorf("paid invoice should show 'Dibayar' label: %s", html)
	}
	if !strings.Contains(html, `class="status paid"`) {
		t.Errorf("paid status class missing")
	}
}

func TestHTMLRenderer_Render_ZeroTaxSkipsPPNRow(t *testing.T) {
	r := NewHTMLRenderer(nil)
	inv := &Invoice{
		ID:        uuid.New(),
		Number:    "INV-NO-TAX",
		Status:    StatusUnpaid,
		DueAt:     time.Now(),
		CreatedAt: time.Now(),
		Subtotal:  100000,
		TaxRate:   0,
		TaxAmount: 0,
		Total:     100000,
	}
	buf, _ := r.Render(context.Background(), inv)
	html := string(buf)
	// PPN row hanya render kalau TaxAmount > 0.
	if strings.Contains(html, "PPN") {
		t.Errorf("zero-tax invoice should not render PPN row: %s", html)
	}
}

func TestHTMLRenderer_Render_NilInvoice(t *testing.T) {
	r := NewHTMLRenderer(nil)
	if _, err := r.Render(context.Background(), nil); err == nil {
		t.Error("nil invoice should error")
	}
}
