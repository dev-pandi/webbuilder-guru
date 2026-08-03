package invoices

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/settings"
)

// Service — business logic layer di atas Repo.
//
// Design: setiap operation yang butuh dynamic config (PPN rate, brand info)
// fetch via settings.Service — bukan hardcode. Kalau PPN berubah, invoice
// baru pakai rate baru; invoice historical tetap accurate karena rate
// di-capture di row saat issuance.
type Service struct {
	repo     *Repo
	settings *settings.Service
	// nowFn — untuk deterministic testing. Default time.Now.
	nowFn func() time.Time
}

func NewService(r *Repo, s *settings.Service) *Service {
	return &Service{repo: r, settings: s, nowFn: time.Now}
}

// WithClock — inject fake clock untuk test.
func (s *Service) WithClock(fn func() time.Time) *Service {
	s.nowFn = fn
	return s
}

// CreateForRegisterInput — payload untuk 1 invoice register/renew domain.
type CreateForRegisterInput struct {
	UserID        uuid.UUID
	PurchasedBy   *uuid.UUID
	Domain        string
	Years         int
	UnitPrice     int64  // price per tahun (IDR)
	PromoDiscount int64  // opsional; kalau > 0, subtotal berkurang
	PaymentMethod string // code dari payment_methods
	DueMinutes    int    // default 30 (30 menit expire kalau tidak paid)
	Description   string // "Register .id — myshop.id (2 tahun)" — override kalau kosong build otomatis
	Kind          string // "register" | "renew" — di-embed di metadata untuk audit
	JobID         string // opsional, kalau caller sudah punya (linked ke domain_purchases.job_id)
	PromoCode     string // opsional, di-embed di metadata untuk audit
}

// CreateForRegister — issue invoice untuk register/renew domain.
//
// Steps:
//  1. Fetch PPN config dari settings.
//  2. Compute subtotal (years * unit_price) - promo_discount, apply PPN.
//  3. Generate sequential number pakai advisory lock.
//  4. Insert invoice + line via Repo.Create (transactional).
//
// Return invoice status='draft' — caller lanjut CreateCharge di paymentgw,
// lalu call SavePaymentRef untuk promote ke 'unpaid'.
func (s *Service) CreateForRegister(ctx context.Context, in CreateForRegisterInput) (*Invoice, error) {
	if in.Years < 1 {
		return nil, fmt.Errorf("years wajib >= 1")
	}
	if in.UnitPrice <= 0 {
		return nil, fmt.Errorf("unit_price wajib > 0")
	}
	if in.Domain == "" {
		return nil, fmt.Errorf("domain wajib")
	}
	if in.PaymentMethod == "" {
		return nil, fmt.Errorf("payment_method wajib")
	}
	if in.DueMinutes <= 0 {
		in.DueMinutes = 30
	}
	if in.Kind == "" {
		in.Kind = "register"
	}
	description := in.Description
	if description == "" {
		verb := "Register"
		if in.Kind == "renew" {
			verb = "Perpanjangan"
		}
		description = fmt.Sprintf("%s — %s (%d tahun)", verb, in.Domain, in.Years)
	}

	// Subtotal (before PPN).
	subtotal := int64(in.Years) * in.UnitPrice
	if in.PromoDiscount > 0 {
		subtotal -= in.PromoDiscount
		if subtotal < 0 {
			subtotal = 0 // promo tidak boleh bikin negative
		}
	}

	// PPN — fetch dari settings. Capture rate di row (bukan lookup real-time).
	var taxRate float64
	var taxAmount int64
	if s.settings != nil && s.settings.PPNEnabled(ctx) {
		taxRate = s.settings.PPNRate(ctx)
		taxAmount = int64(math.Round(float64(subtotal) * taxRate))
	}
	total := subtotal + taxAmount

	now := s.nowFn()
	number, err := s.repo.NextNumber(ctx, now)
	if err != nil {
		return nil, fmt.Errorf("generate number: %w", err)
	}

	// Metadata JSONB — audit info yang kita mau surface di admin/analytics.
	meta := map[string]any{
		"kind":     in.Kind,
		"domain":   in.Domain,
		"years":    in.Years,
		"unit_price": in.UnitPrice,
	}
	if in.PromoDiscount > 0 {
		meta["promo_discount"] = in.PromoDiscount
	}
	if in.PromoCode != "" {
		meta["promo_code"] = in.PromoCode
	}
	if in.JobID != "" {
		meta["job_id"] = in.JobID
	}
	metaBytes, _ := json.Marshal(meta)

	dueAt := now.Add(time.Duration(in.DueMinutes) * time.Minute)

	inv, err := s.repo.Create(ctx, CreateInput{
		Number:        number,
		UserID:        in.UserID,
		PurchasedBy:   in.PurchasedBy,
		Subtotal:      subtotal,
		TaxRate:       taxRate,
		TaxAmount:     taxAmount,
		Total:         total,
		Currency:      "IDR",
		PaymentMethod: in.PaymentMethod,
		DueAt:         dueAt,
		Metadata:      metaBytes,
		Lines: []LineInput{
			{
				Description: description,
				Quantity:    in.Years,
				UnitPrice:   in.UnitPrice,
				SortOrder:   0,
			},
		},
	})
	if err != nil {
		return nil, err
	}
	return inv, nil
}

// SavePaymentRef — thin wrapper repo. Promote draft → unpaid + set gw_ref.
func (s *Service) SavePaymentRef(ctx context.Context, id uuid.UUID, ref string) error {
	return s.repo.SavePaymentRef(ctx, id, ref)
}

// MarkPaid — idempotent. Return nil kalau sudah paid.
func (s *Service) MarkPaid(ctx context.Context, id uuid.UUID, paidAt time.Time, providerRef string) error {
	return s.repo.MarkPaid(ctx, id, paidAt, providerRef)
}

// MarkExpired — bulk-jobs friendly: dipanggil scheduler tiap 5 menit untuk
// domain_purchase yang lewat due_at + belum paid. Guard: hanya invoice
// status='unpaid' yang bisa expire.
func (s *Service) MarkExpired(ctx context.Context, id uuid.UUID) error {
	inv, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if inv.Status != StatusUnpaid && inv.Status != StatusDraft {
		return fmt.Errorf("%w: %s → expired tidak diizinkan", ErrInvalidStatus, inv.Status)
	}
	return s.repo.MarkStatus(ctx, id, StatusExpired)
}

// Cancel — user/admin cancel invoice unpaid.
func (s *Service) Cancel(ctx context.Context, id uuid.UUID) error {
	inv, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if inv.Status != StatusUnpaid && inv.Status != StatusDraft {
		return fmt.Errorf("%w: %s → cancelled tidak diizinkan", ErrInvalidStatus, inv.Status)
	}
	return s.repo.MarkStatus(ctx, id, StatusCancelled)
}
