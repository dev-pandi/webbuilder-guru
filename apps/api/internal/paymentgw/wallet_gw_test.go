package paymentgw

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/webbuilder/api/internal/payments"
)

// mockDebiter — fake WalletDebiter untuk unit test.
type mockDebiter struct {
	debitFn func(ctx context.Context, in WalletDebitInput) (uuid.UUID, error)
	calls   []WalletDebitInput
}

func (m *mockDebiter) Debit(ctx context.Context, in WalletDebitInput) (uuid.UUID, error) {
	m.calls = append(m.calls, in)
	if m.debitFn != nil {
		return m.debitFn(ctx, in)
	}
	return uuid.New(), nil
}

func TestBuildWallet_RequiresDebiter(t *testing.T) {
	_, err := buildWallet(payments.PaymentMethod{
		Code: payments.CodeDepositWallet, Label: "Wallet",
	}, nil)
	if err == nil {
		t.Fatal("expected error tanpa debiter")
	}
	if !errors.Is(err, ErrInvalidConfig) {
		t.Errorf("expected ErrInvalidConfig, got %v", err)
	}
}

func TestWalletGateway_MetadataMethods(t *testing.T) {
	gw, err := buildWallet(payments.PaymentMethod{
		Code:  payments.CodeDepositWallet,
		Label: "Wallet Prabayar",
	}, &mockDebiter{})
	if err != nil {
		t.Fatalf("buildWallet: %v", err)
	}
	if gw.Code() != payments.CodeDepositWallet {
		t.Errorf("Code = %q", gw.Code())
	}
	if gw.Label() != "Wallet Prabayar" {
		t.Errorf("Label = %q", gw.Label())
	}
	if gw.Type() != payments.TypeWallet {
		t.Errorf("Type = %q, want %q", gw.Type(), payments.TypeWallet)
	}
}

func TestWalletGateway_CreateCharge_DebitsAndReturnsLedgerID(t *testing.T) {
	ledgerID := uuid.New()
	debiter := &mockDebiter{
		debitFn: func(ctx context.Context, in WalletDebitInput) (uuid.UUID, error) {
			return ledgerID, nil
		},
	}
	gw, _ := buildWallet(payments.PaymentMethod{
		Code: payments.CodeDepositWallet,
	}, debiter)

	uid := uuid.New()
	invID := uuid.New()
	res, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID: invID.String(),
		UserID:  uid.String(),
		Amount:  500000,
	})
	if err != nil {
		t.Fatalf("CreateCharge: %v", err)
	}
	if res.ProviderRefID != ledgerID.String() {
		t.Errorf("ProviderRefID = %q, want %q", res.ProviderRefID, ledgerID.String())
	}
	if res.PaymentURL != "" {
		t.Errorf("PaymentURL should be empty for wallet, got %q", res.PaymentURL)
	}
	// Verify debit call.
	if len(debiter.calls) != 1 {
		t.Fatalf("expected 1 debit call, got %d", len(debiter.calls))
	}
	call := debiter.calls[0]
	if call.UserID != uid || call.Amount != 500000 {
		t.Errorf("debit call mismatch: %+v", call)
	}
	if call.ReferenceID == nil || *call.ReferenceID != invID {
		t.Errorf("reference_id mismatch: %v", call.ReferenceID)
	}
	if call.Reason != "debit_register" {
		t.Errorf("reason = %q", call.Reason)
	}
}

func TestWalletGateway_CreateCharge_InsufficientReturnsSentinel(t *testing.T) {
	debiter := &mockDebiter{
		debitFn: func(ctx context.Context, in WalletDebitInput) (uuid.UUID, error) {
			return uuid.Nil, errors.New("saldo wallet tidak cukup")
		},
	}
	gw, _ := buildWallet(payments.PaymentMethod{Code: payments.CodeDepositWallet}, debiter)
	_, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID: uuid.New().String(),
		UserID:  uuid.New().String(),
		Amount:  100000,
	})
	if !errors.Is(err, ErrWalletInsufficient) {
		t.Errorf("expected ErrWalletInsufficient, got %v", err)
	}
}

func TestWalletGateway_CreateCharge_InsufficientEnglish(t *testing.T) {
	debiter := &mockDebiter{
		debitFn: func(ctx context.Context, in WalletDebitInput) (uuid.UUID, error) {
			return uuid.Nil, errors.New("insufficient balance for user")
		},
	}
	gw, _ := buildWallet(payments.PaymentMethod{Code: payments.CodeDepositWallet}, debiter)
	_, err := gw.CreateCharge(context.Background(), ChargeRequest{
		OrderID: uuid.New().String(), UserID: uuid.New().String(), Amount: 100000,
	})
	if !errors.Is(err, ErrWalletInsufficient) {
		t.Errorf("expected ErrWalletInsufficient (English marker), got %v", err)
	}
}

func TestWalletGateway_CreateCharge_ValidatesInput(t *testing.T) {
	gw, _ := buildWallet(payments.PaymentMethod{Code: payments.CodeDepositWallet}, &mockDebiter{})
	cases := []struct {
		name string
		req  ChargeRequest
	}{
		{"amount 0", ChargeRequest{OrderID: "x", UserID: uuid.New().String()}},
		{"empty order_id", ChargeRequest{UserID: uuid.New().String(), Amount: 100}},
		{"empty user_id", ChargeRequest{OrderID: uuid.New().String(), Amount: 100}},
		{"invalid user_id", ChargeRequest{OrderID: uuid.New().String(), UserID: "not-a-uuid", Amount: 100}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := gw.CreateCharge(context.Background(), tc.req); err == nil {
				t.Error("expected validation error")
			}
		})
	}
}

func TestWalletGateway_HandleWebhook_ReturnsUnsupported(t *testing.T) {
	gw, _ := buildWallet(payments.PaymentMethod{Code: payments.CodeDepositWallet}, &mockDebiter{})
	_, err := gw.HandleWebhook(context.Background(), nil, []byte(`{}`))
	if !errors.Is(err, ErrUnsupported) {
		t.Errorf("expected ErrUnsupported, got %v", err)
	}
}

func TestRegistry_GetWallet_RequiresDebiter(t *testing.T) {
	// Registry tanpa SetWalletDebiter → Get("deposit_wallet") return
	// ErrInvalidConfig (via buildWallet).
	reg := &Registry{
		builders: map[string]Builder{},
	}
	// Fake PaymentMethod fetch via inline test — kita test buildWallet directly.
	_, err := buildWallet(payments.PaymentMethod{
		Code: payments.CodeDepositWallet,
		Config: json.RawMessage(`{}`),
	}, reg.walletDebiter) // nil
	if err == nil {
		t.Fatal("expected error tanpa debiter")
	}
}

func TestIsInsufficientErr(t *testing.T) {
	cases := []struct {
		err  error
		want bool
	}{
		{errors.New("saldo wallet tidak cukup"), true},
		{errors.New("Saldo tidak cukup"), true}, // case-insensitive
		{errors.New("insufficient balance"), true},
		{errors.New("Insufficient funds"), true},
		{errors.New("network error"), false},
		{errors.New("timeout"), false},
		{nil, false},
	}
	for _, tc := range cases {
		if got := isInsufficientErr(tc.err); got != tc.want {
			t.Errorf("isInsufficientErr(%v) = %v, want %v", tc.err, got, tc.want)
		}
	}
}

func TestContainsFold(t *testing.T) {
	cases := []struct {
		s, substr string
		want      bool
	}{
		{"hello world", "world", true},
		{"HELLO WORLD", "world", true},
		{"HELLO WORLD", "WORLD", true},
		{"Hello World", "hello", true},
		{"xyz", "hello", false},
		{"short", "muchlonger", false},
		{"", "", true},
		{"abc", "", true},
	}
	for _, tc := range cases {
		if got := containsFold(tc.s, tc.substr); got != tc.want {
			t.Errorf("containsFold(%q,%q) = %v, want %v", tc.s, tc.substr, got, tc.want)
		}
	}
}
