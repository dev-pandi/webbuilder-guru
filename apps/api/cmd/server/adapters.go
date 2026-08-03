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

	"github.com/webbuilder/api/internal/domain_purchase"
	"github.com/webbuilder/api/internal/invoices"
	"github.com/webbuilder/api/internal/paymentgw"
	"github.com/webbuilder/api/internal/pricing"
)

// --- pricingAdapter: pricing.Repo → domain_purchase.PricingLookup ---

type pricingAdapter struct{ repo *pricing.Repo }

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

// --- invoicesAdapter: invoices.Service → domain_purchase.InvoiceCreator ---

type invoicesAdapter struct{ svc *invoices.Service }

func (a invoicesAdapter) CreateForRegister(ctx context.Context, in domain_purchase.InvoiceCreateInput) (uuid.UUID, int64, time.Time, error) {
	inv, err := a.svc.CreateForRegister(ctx, invoices.CreateForRegisterInput{
		UserID:        in.UserID,
		Domain:        in.Domain,
		Years:         in.Years,
		UnitPrice:     in.UnitPrice,
		PaymentMethod: in.PaymentMethod,
		Kind:          in.Kind,
		JobID:         in.JobID,
	})
	if err != nil {
		return uuid.Nil, 0, time.Time{}, err
	}
	return inv.ID, inv.Total, inv.DueAt, nil
}

func (a invoicesAdapter) SavePaymentRef(ctx context.Context, id uuid.UUID, providerRef string) error {
	return a.svc.SavePaymentRef(ctx, id, providerRef)
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

func (a gatewayAdapter) CreateCharge(ctx context.Context, req domain_purchase.GatewayChargeRequest) (string, string, error) {
	res, err := a.gw.CreateCharge(ctx, paymentgw.ChargeRequest{
		OrderID:     req.OrderID,
		Amount:      req.Amount,
		Currency:    "IDR",
		Description: req.Description,
		Customer: paymentgw.Customer{
			Name:  req.CustomerName,
			Email: req.CustomerEmail,
			Phone: req.CustomerPhone,
		},
		ReturnURL: req.ReturnURL,
		NotifURL:  req.NotifURL,
		ExpiresAt: req.ExpiresAt,
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
