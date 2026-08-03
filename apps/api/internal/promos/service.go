// service.go — validate + apply promo. Business logic pinjaman dari repo,
// no direct DB access. Caller (invoices.Service) pass ini via interface untuk
// hindari import cycle.

package promos

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrInactive       = errors.New("promo tidak aktif")
	ErrNotYetValid    = errors.New("promo belum berlaku")
	ErrExpired        = errors.New("promo sudah expired")
	ErrMaxUses        = errors.New("promo sudah mencapai batas pemakaian")
	ErrUserMaxUses    = errors.New("Anda sudah pernah pakai promo ini")
	ErrKindMismatch   = errors.New("promo tidak berlaku untuk operasi ini")
	ErrTLDMismatch    = errors.New("promo tidak berlaku untuk TLD ini")
	ErrMinSubtotal    = errors.New("total invoice kurang dari minimum promo")
	ErrInvalidCode    = errors.New("kode promo tidak dikenal")
)

// Service wraps repo + provides validate/apply logic.
type Service struct {
	repo *Repo
}

func NewService(r *Repo) *Service { return &Service{repo: r} }

// ValidateInput — konteks untuk validasi.
type ValidateInput struct {
	Code     string
	UserID   uuid.UUID
	TLD      string
	Kind     string // "register" | "renew"
	Subtotal int64  // IDR minor unit
}

// ValidateResult — hasil validasi + hitung diskon.
type ValidateResult struct {
	Promo    *Promo
	Discount int64 // IDR minor unit, sudah di-clamp ke max_discount + subtotal
}

// Validate — check semua constraint promo. Return ValidateResult kalau lolos,
// error yang di-map ke Err* kalau tidak.
func (s *Service) Validate(ctx context.Context, in ValidateInput) (*ValidateResult, error) {
	code := strings.ToUpper(strings.TrimSpace(in.Code))
	if code == "" {
		return nil, ErrInvalidCode
	}
	p, err := s.repo.GetByCode(ctx, code)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrInvalidCode
		}
		return nil, err
	}
	if !p.Active {
		return nil, ErrInactive
	}
	now := time.Now()
	if p.ValidFrom != nil && now.Before(*p.ValidFrom) {
		return nil, ErrNotYetValid
	}
	if p.ValidUntil != nil && now.After(*p.ValidUntil) {
		return nil, ErrExpired
	}

	// Kind gate.
	if p.AppliesTo != AppliesToBoth && p.AppliesTo != in.Kind {
		return nil, ErrKindMismatch
	}

	// TLD gate (kalau di-set).
	if len(p.AllowedTLDs) > 0 {
		tld := strings.ToLower(strings.TrimSpace(in.TLD))
		found := false
		for _, t := range p.AllowedTLDs {
			if strings.ToLower(t) == tld {
				found = true
				break
			}
		}
		if !found {
			return nil, ErrTLDMismatch
		}
	}

	// Min subtotal gate.
	if p.MinSubtotal > 0 && in.Subtotal < p.MinSubtotal {
		return nil, ErrMinSubtotal
	}

	// Global uses cap.
	if p.MaxUses != nil {
		total, err := s.repo.CountRedemptions(ctx, p.ID)
		if err != nil {
			return nil, err
		}
		if total >= *p.MaxUses {
			return nil, ErrMaxUses
		}
	}

	// Per-user uses cap.
	if p.MaxUsesPerUser > 0 {
		userUses, err := s.repo.CountRedemptionsByUser(ctx, p.ID, in.UserID)
		if err != nil {
			return nil, err
		}
		if userUses >= p.MaxUsesPerUser {
			return nil, ErrUserMaxUses
		}
	}

	// Hitung diskon.
	discount := calculateDiscount(p, in.Subtotal)
	return &ValidateResult{Promo: p, Discount: discount}, nil
}

// Redeem — insert redemption row. Race protection lewat unique(invoice_id):
// kalau invoice sudah punya redemption (retry saat error setelah insert),
// upstream harus fetch existing redemption, bukan bikin dobel.
func (s *Service) Redeem(ctx context.Context, promoID, userID, invoiceID uuid.UUID, discount int64) (*Redemption, error) {
	rd := &Redemption{
		PromoID:         promoID,
		UserID:          userID,
		InvoiceID:       invoiceID,
		DiscountApplied: discount,
	}
	if err := s.repo.InsertRedemption(ctx, rd); err != nil {
		return nil, err
	}
	return rd, nil
}

// calculateDiscount — hitung diskon berdasarkan tipe. Clamp ke max_discount
// (kalau di-set > 0) dan clamp ke subtotal (jangan negatif total).
func calculateDiscount(p *Promo, subtotal int64) int64 {
	var d int64
	switch p.DiscountType {
	case DiscountPercent:
		// discount_value = 1-100 (%). Bulat ke integer minor unit.
		d = subtotal * p.DiscountValue / 100
	case DiscountFixed:
		d = p.DiscountValue
	default:
		return 0
	}
	if p.MaxDiscount > 0 && d > p.MaxDiscount {
		d = p.MaxDiscount
	}
	if d > subtotal {
		d = subtotal
	}
	if d < 0 {
		d = 0
	}
	return d
}
