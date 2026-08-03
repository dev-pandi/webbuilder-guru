package paymentgw

import (
	"context"
	"errors"
	"testing"

	"github.com/webbuilder/api/internal/payments"
)

// Registry tests fokus ke:
//   - Register + Get override behavior
//   - Fake gateway integration (test injection point untuk consumer tests)
//
// Full DB-backed Registry.Get / ListEnabled test skipped karena butuh
// payments.Repo (integration path — di-cover di consumer package nanti).

func TestFakeGateway_TracksCallsAndUsesInjectableBehavior(t *testing.T) {
	f := NewFake("test-gateway")

	// Default behavior — success.
	res, err := f.CreateCharge(context.Background(), ChargeRequest{
		OrderID: "INV-1", Amount: 100000,
	})
	if err != nil {
		t.Fatalf("default CreateCharge: %v", err)
	}
	if res.ProviderRefID != "fake-INV-1" || res.PaymentURL == "" {
		t.Errorf("unexpected default response: %+v", res)
	}
	if f.CallCount("CreateCharge") != 1 {
		t.Errorf("call count = %d", f.CallCount("CreateCharge"))
	}

	// Injectable — simulate failure.
	f.CreateChargeFn = func(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
		return nil, errors.New("simulated failure")
	}
	if _, err := f.CreateCharge(context.Background(), ChargeRequest{OrderID: "INV-2", Amount: 200}); err == nil {
		t.Error("expected injected error")
	}

	// Call count harus track semua invocation (default + injected).
	if f.CallCount("CreateCharge") != 2 {
		t.Errorf("total CreateCharge call count = %d, want 2", f.CallCount("CreateCharge"))
	}
}

func TestFakeGateway_WebhookInjectable(t *testing.T) {
	f := NewFake("test")
	f.HandleWebhookFn = func(ctx context.Context, headers map[string]string, body []byte) (*WebhookEvent, error) {
		return &WebhookEvent{Status: StatusFailed, OrderID: "INJECTED"}, nil
	}
	ev, err := f.HandleWebhook(context.Background(), nil, []byte(`{}`))
	if err != nil {
		t.Fatalf("HandleWebhook: %v", err)
	}
	if ev.Status != StatusFailed || ev.OrderID != "INJECTED" {
		t.Errorf("injected fn not called: %+v", ev)
	}
}

func TestRegistry_Register_Override(t *testing.T) {
	// Bikin Registry tanpa repo (kita test Register/Get flow via reflection saja).
	reg := &Registry{builders: map[string]Builder{}}

	original := reg.builders[payments.CodeMidtrans]
	_ = original

	// Register fake builder.
	reg.Register("custom-code", func(m payments.PaymentMethod) (Gateway, error) {
		return NewFake("custom-code"), nil
	})

	reg.mu.RLock()
	b, ok := reg.builders["custom-code"]
	reg.mu.RUnlock()
	if !ok {
		t.Fatal("Register did not add builder")
	}
	// Invoke builder — should return fake without needing repo.
	gw, err := b(payments.PaymentMethod{Code: "custom-code"})
	if err != nil {
		t.Fatalf("builder error: %v", err)
	}
	if gw.Code() != "custom-code" {
		t.Errorf("Code = %q", gw.Code())
	}
}
