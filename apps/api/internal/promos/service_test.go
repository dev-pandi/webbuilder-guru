package promos

import "testing"

// calculateDiscount — pure function, no DB needed.

func TestCalculateDiscount_Percent(t *testing.T) {
	p := &Promo{DiscountType: DiscountPercent, DiscountValue: 10}
	got := calculateDiscount(p, 100_000)
	if got != 10_000 {
		t.Errorf("10%% of 100k = 10k, got %d", got)
	}
}

func TestCalculateDiscount_PercentWithMaxCap(t *testing.T) {
	p := &Promo{DiscountType: DiscountPercent, DiscountValue: 50, MaxDiscount: 20_000}
	got := calculateDiscount(p, 100_000)
	if got != 20_000 {
		t.Errorf("50%% of 100k capped at 20k = 20k, got %d", got)
	}
}

func TestCalculateDiscount_Fixed(t *testing.T) {
	p := &Promo{DiscountType: DiscountFixed, DiscountValue: 15_000}
	got := calculateDiscount(p, 100_000)
	if got != 15_000 {
		t.Errorf("fixed 15k = 15k, got %d", got)
	}
}

func TestCalculateDiscount_FixedExceedsSubtotal(t *testing.T) {
	// Diskon fixed lebih besar dari subtotal → clamp ke subtotal (jangan
	// bikin invoice negatif).
	p := &Promo{DiscountType: DiscountFixed, DiscountValue: 200_000}
	got := calculateDiscount(p, 50_000)
	if got != 50_000 {
		t.Errorf("fixed 200k clamped to subtotal 50k, got %d", got)
	}
}

func TestCalculateDiscount_UnknownTypeReturnsZero(t *testing.T) {
	p := &Promo{DiscountType: "unknown", DiscountValue: 100}
	got := calculateDiscount(p, 100_000)
	if got != 0 {
		t.Errorf("unknown type must return 0, got %d", got)
	}
}

func TestCalculateDiscount_ZeroSubtotal(t *testing.T) {
	// Renew subtotal 0 (backend hitung) — discount tetap 0 supaya tidak
	// bikin negatif. Kalau operator butuh apply promo di subtotal 0,
	// desain-nya: renew backend re-compute discount setelah tau price.
	p := &Promo{DiscountType: DiscountPercent, DiscountValue: 10}
	got := calculateDiscount(p, 0)
	if got != 0 {
		t.Errorf("subtotal 0 → discount 0, got %d", got)
	}
}

func TestCalculateDiscount_MaxCapZeroIgnored(t *testing.T) {
	// max_discount=0 = tidak ada cap.
	p := &Promo{DiscountType: DiscountPercent, DiscountValue: 25, MaxDiscount: 0}
	got := calculateDiscount(p, 1_000_000)
	if got != 250_000 {
		t.Errorf("25%% of 1M no cap = 250k, got %d", got)
	}
}
