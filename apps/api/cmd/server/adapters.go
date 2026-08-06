// adapters.go — thin bridges antara concrete packages (pricing.Repo,
// invoices.Service, paymentgw.Registry) dan interface abstract yang
// consumer (domain_purchase.Handler) butuh untuk PurchaseV2 flow.
//
// Alternatif: pindah interface ke concrete package, tapi itu bikin
// coupling reverse (concrete depend abstract). Adapter di sini keep
// concrete package agnostic + consumer testable.

package main

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/auth"
	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/invoices"
	"github.com/webbuilder/api/internal/paymentgw"
	"github.com/webbuilder/api/internal/pricing"
	"github.com/webbuilder/api/internal/promos"
	"github.com/webbuilder/api/internal/wallet_local"
)

// --- pricingAdapter: pricing.Repo → domain_purchase.PricingLookup ---

type pricingAdapter struct {
	repo     *pricing.Repo
	authRepo *auth.Repo // untuk resolve role saat GetChargePrice
}

func (a pricingAdapter) GetPlatformPrice(ctx context.Context, tld string) (int64, int64, error) {
	p, err := a.repo.GetPlatformByTLD(ctx, strings.ToLower(strings.TrimSpace(tld)))
	if err != nil {
		return 0, 0, err
	}
	if p == nil {
		return 0, 0, errors.New("price not set for tld")
	}
	return p.RetailRegisterPrice, p.RetailRenewPrice, nil
}

// GetChargePrice — resolve harga final per role.
//   - client / anonymous : retail_*
//   - reseller (self)    : wholesale_* (fallback retail)
//   - agent (self)       : agent_* dari parent reseller list (fallback wholesale, else retail)
//
// Kalau TLD tidak ada di platform_prices → return error (frontend fallback
// tanpa harga). Anonymous userID uuid.Nil → default ke retail path.
func (a pricingAdapter) GetChargePrice(ctx context.Context, tld string, userID uuid.UUID) (int64, int64, string, error) {
	tld = strings.ToLower(strings.TrimSpace(tld))
	if tld == "" {
		return 0, 0, "", errors.New("tld kosong")
	}
	var role string
	var resellerID *uuid.UUID
	if userID != uuid.Nil && a.authRepo != nil {
		if u, err := a.authRepo.GetByID(ctx, userID); err == nil && u != nil {
			role = u.Role
			switch u.Role {
			case auth.RoleReseller:
				id := u.ID
				resellerID = &id
			case auth.RoleAgent:
				if u.ParentResellerID != nil {
					resellerID = u.ParentResellerID
				}
			}
		}
	}
	resolved, err := a.repo.Resolve(ctx, tld, resellerID)
	if err != nil {
		return 0, 0, "", err
	}
	currency := resolved.Currency
	if currency == "" {
		currency = "IDR"
	}
	// Pick per role. Deref *int64 → int64 dengan nil-safe fallback.
	deref := func(p *int64) int64 {
		if p != nil {
			return *p
		}
		return 0
	}
	var reg, ren int64
	switch role {
	case auth.RoleReseller:
		reg = deref(resolved.WholesaleRegisterPrice)
		ren = deref(resolved.WholesaleRenewPrice)
		if reg == 0 {
			reg = deref(resolved.RetailRegisterPrice)
		}
		if ren == 0 {
			ren = deref(resolved.RetailRenewPrice)
		}
	case auth.RoleAgent:
		reg = deref(resolved.AgentRegisterPrice)
		ren = deref(resolved.AgentRenewPrice)
		if reg == 0 {
			reg = deref(resolved.WholesaleRegisterPrice)
		}
		if ren == 0 {
			ren = deref(resolved.WholesaleRenewPrice)
		}
		if reg == 0 {
			reg = deref(resolved.RetailRegisterPrice)
		}
		if ren == 0 {
			ren = deref(resolved.RetailRenewPrice)
		}
	default:
		reg = deref(resolved.RetailRegisterPrice)
		ren = deref(resolved.RetailRenewPrice)
	}
	if reg == 0 && ren == 0 {
		return 0, 0, currency, errors.New("price not set for tld")
	}
	return reg, ren, currency, nil
}

// --- invoicesAdapter: invoices.Service + Repo → domain_purchase.InvoiceCreator ---
//
// Butuh Service (untuk CreateForRegister + SavePaymentRef + MarkPaid) DAN
// Repo (untuk GetInvoiceForCallback — fetch full invoice+lines).

type invoicesAdapter struct {
	svc  *invoices.Service
	repo *invoices.Repo
}

func (a invoicesAdapter) CreateForRegister(ctx context.Context, in domain_purchase.InvoiceCreateInput) (uuid.UUID, int64, time.Time, error) {
	inv, err := a.svc.CreateForRegister(ctx, invoices.CreateForRegisterInput{
		UserID:        in.UserID,
		PurchasedBy:   in.PurchasedBy,
		Domain:        in.Domain,
		Years:         in.Years,
		UnitPrice:     in.UnitPrice,
		PaymentMethod: in.PaymentMethod,
		Kind:          in.Kind,
		JobID:         in.JobID,
		PromoCode:     in.PromoCode,
		PromoDiscount: in.PromoDiscount,
	})
	if err != nil {
		return uuid.Nil, 0, time.Time{}, err
	}
	return inv.ID, inv.Total, inv.DueAt, nil
}

func (a invoicesAdapter) SavePaymentRef(ctx context.Context, id uuid.UUID, providerRef string) error {
	return a.svc.SavePaymentRef(ctx, id, providerRef)
}

func (a invoicesAdapter) MarkPaid(ctx context.Context, id uuid.UUID, paidAt time.Time, providerRef string) error {
	return a.svc.MarkPaid(ctx, id, paidAt, providerRef)
}

func (a invoicesAdapter) GetInvoiceForCallback(ctx context.Context, id uuid.UUID) (*invoices.Invoice, error) {
	return a.repo.GetWithLines(ctx, id)
}

// --- promosAdapter: promos.Service → domain_purchase.PromoValidator ---
//
// Bridge supaya Purchase/Renew handler tidak import promos package langsung
// (keep consumer testable + interface-driven).

type promosAdapter struct{ svc *promos.Service }

func (a promosAdapter) Validate(ctx context.Context, code string, userID uuid.UUID, tld, kind string, subtotal int64) (uuid.UUID, int64, error) {
	res, err := a.svc.Validate(ctx, promos.ValidateInput{
		Code:     code,
		UserID:   userID,
		TLD:      tld,
		Kind:     kind,
		Subtotal: subtotal,
	})
	if err != nil {
		return uuid.Nil, 0, err
	}
	return res.Promo.ID, res.Discount, nil
}

func (a promosAdapter) Redeem(ctx context.Context, promoID, userID, invoiceID uuid.UUID, discount int64) error {
	_, err := a.svc.Redeem(ctx, promoID, userID, invoiceID, discount)
	return err
}

// --- walletDebiterAdapter: wallet_local.Repo → paymentgw.WalletDebiter ---
//
// Bridge supaya WalletGateway di paymentgw package tidak import wallet_local
// package langsung (keep concrete packages agnostic ke satu sama lain).

type walletDebiterAdapter struct{ repo *wallet_local.Repo }

func (a walletDebiterAdapter) Debit(ctx context.Context, in paymentgw.WalletDebitInput) (uuid.UUID, error) {
	entry, err := a.repo.Debit(ctx, wallet_local.DebitInput{
		UserID:      in.UserID,
		Amount:      in.Amount,
		Reason:      in.Reason,
		ReferenceID: in.ReferenceID,
		Metadata:    in.Metadata,
	})
	if err != nil {
		return uuid.Nil, err
	}
	return entry.ID, nil
}

// --- gatewayRegistryAdapter: paymentgw.Registry → domain_purchase.GatewayRegistry ---

type gatewayRegistryAdapter struct{ reg *paymentgw.Registry }

func (a gatewayRegistryAdapter) Get(ctx context.Context, code string) (domain_purchase.PaymentGateway, error) {
	gw, err := a.reg.Get(ctx, code)
	if err != nil {
		return nil, err
	}
	return gatewayAdapter{gw: gw}, nil
}

// gatewayAdapter — bridge paymentgw.Gateway → domain_purchase.PaymentGateway.
type gatewayAdapter struct{ gw paymentgw.Gateway }

func (a gatewayAdapter) Code() string { return a.gw.Code() }
func (a gatewayAdapter) Type() string { return a.gw.Type() }

func (a gatewayAdapter) CreateCharge(ctx context.Context, req domain_purchase.GatewayChargeRequest) (string, string, error) {
	res, err := a.gw.CreateCharge(ctx, paymentgw.ChargeRequest{
		OrderID:     req.OrderID,
		UserID:      req.UserID,
		Amount:      req.Amount,
		Currency:    "IDR",
		Description: req.Description,
		Customer: paymentgw.Customer{
			Name:  req.CustomerName,
			Email: req.CustomerEmail,
			Phone: req.CustomerPhone,
		},
		ReturnURL:      req.ReturnURL,
		NotifURL:       req.NotifURL,
		ExpiresAt:      req.ExpiresAt,
		WalletPayerID:  req.WalletPayerID,
		WalletMetadata: req.WalletMetadata,
	})
	if err != nil {
		return "", "", err
	}
	// Manual bank return Instructions (bukan PaymentURL) — untuk PurchaseV2
	// response, kita include keduanya. Handler decide field mana yang
	// return. Untuk MVP: kalau PaymentURL kosong tapi Instructions ada,
	// caller (frontend) show instructions modal.
	url := res.PaymentURL
	if url == "" && res.Instructions != "" {
		// Sinyal untuk consumer: instructions available, no redirect.
		// Kita encode di ProviderRefID? No — simpler: caller check
		// paymentURL != "" untuk decide redirect vs modal.
	}
	return url, res.ProviderRefID, nil
}

// --- wallet_local topup adapters ---
//
// Wallet_local package tidak boleh import invoices/paymentgw langsung
// (import cycle risk). Bridge via interface. Sama pattern dengan
// domain_purchase adapters di atas.

// walletInvoicesAdapter: invoices.Service → wallet_local.InvoiceForTopup
type walletInvoicesAdapter struct{ svc *invoices.Service }

func (a walletInvoicesAdapter) CreateForTopup(ctx context.Context, in wallet_local.InvoiceTopupInput) (uuid.UUID, int64, time.Time, error) {
	inv, err := a.svc.CreateForTopup(ctx, invoices.CreateForTopupInput{
		UserID:        in.UserID,
		Amount:        in.Amount,
		PaymentMethod: in.PaymentMethod,
		Description:   in.Description,
		TopupID:       in.TopupID,
	})
	if err != nil {
		return uuid.Nil, 0, time.Time{}, err
	}
	return inv.ID, inv.Total, inv.DueAt, nil
}

func (a walletInvoicesAdapter) SavePaymentRef(ctx context.Context, id uuid.UUID, ref string) error {
	return a.svc.SavePaymentRef(ctx, id, ref)
}

func (a walletInvoicesAdapter) MarkPaid(ctx context.Context, id uuid.UUID, paidAt time.Time, providerRef string) error {
	return a.svc.MarkPaid(ctx, id, paidAt, providerRef)
}

// walletGatewayAdapter: paymentgw.Registry → wallet_local.GatewayForTopup
type walletGatewayAdapter struct{ reg *paymentgw.Registry }

func (a walletGatewayAdapter) Get(ctx context.Context, code string) (wallet_local.TopupPaymentGateway, error) {
	gw, err := a.reg.Get(ctx, code)
	if err != nil {
		return nil, err
	}
	return walletGatewayCallAdapter{gw: gw}, nil
}

type walletGatewayCallAdapter struct{ gw paymentgw.Gateway }

func (a walletGatewayCallAdapter) Code() string { return a.gw.Code() }
func (a walletGatewayCallAdapter) Type() string { return a.gw.Type() }

func (a walletGatewayCallAdapter) CreateCharge(ctx context.Context, req wallet_local.TopupChargeRequest) (string, string, string, error) {
	res, err := a.gw.CreateCharge(ctx, paymentgw.ChargeRequest{
		OrderID:     req.OrderID,
		UserID:      req.UserID,
		Amount:      req.Amount,
		Currency:    "IDR",
		Description: req.Description,
		Customer: paymentgw.Customer{
			Name:  req.CustomerName,
			Email: req.CustomerEmail,
			Phone: req.CustomerPhone,
		},
		ReturnURL: req.ReturnURL,
		ExpiresAt: req.ExpiresAt,
	})
	if err != nil {
		return "", "", "", err
	}
	return res.PaymentURL, res.Instructions, res.ProviderRefID, nil
}

// walletUserAdapter: auth.Repo → wallet_local.UserProfile
type walletUserAdapter struct{ repo *auth.Repo }

func (a walletUserAdapter) GetCustomerInfo(ctx context.Context, userID uuid.UUID) (string, string, string, error) {
	u, err := a.repo.GetByID(ctx, userID)
	if err != nil {
		return "", "", "", err
	}
	return u.Name, u.Email, u.PhoneNumber, nil
}

func (a walletUserAdapter) GetRoleAndParent(ctx context.Context, userID uuid.UUID) (string, *uuid.UUID, error) {
	u, err := a.repo.GetByID(ctx, userID)
	if err != nil {
		return "", nil, err
	}
	return u.Role, u.ParentResellerID, nil
}
