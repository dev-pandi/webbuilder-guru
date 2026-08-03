package paymentgw

import (
	"context"
	"fmt"
	"sync"
)

// FakeGateway — untuk unit test consumer domain_purchase. Track semua
// CreateCharge + HandleWebhook calls untuk assertion.
type FakeGateway struct {
	CodeStr  string
	LabelStr string
	TypeStr  string

	// Injectable behavior — konsumer test set closure ini untuk simulasi.
	CreateChargeFn  func(context.Context, ChargeRequest) (*ChargeResponse, error)
	HandleWebhookFn func(context.Context, map[string]string, []byte) (*WebhookEvent, error)

	mu    sync.Mutex
	calls []FakeCall
}

// FakeCall — 1 record dari call history.
type FakeCall struct {
	Method string
	Args   any
}

// NewFake — construct with sensible defaults (success charge, success webhook).
func NewFake(code string) *FakeGateway {
	return &FakeGateway{
		CodeStr:  code,
		LabelStr: "Fake " + code,
		TypeStr:  "gateway",
	}
}

func (f *FakeGateway) Code() string  { return f.CodeStr }
func (f *FakeGateway) Label() string { return f.LabelStr }
func (f *FakeGateway) Type() string  { return f.TypeStr }

func (f *FakeGateway) Calls() []FakeCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	out := make([]FakeCall, len(f.calls))
	copy(out, f.calls)
	return out
}

func (f *FakeGateway) CallCount(method string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, c := range f.calls {
		if c.Method == method {
			n++
		}
	}
	return n
}

func (f *FakeGateway) record(method string, args any) {
	f.mu.Lock()
	f.calls = append(f.calls, FakeCall{Method: method, Args: args})
	f.mu.Unlock()
}

func (f *FakeGateway) CreateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error) {
	f.record("CreateCharge", req)
	if f.CreateChargeFn != nil {
		return f.CreateChargeFn(ctx, req)
	}
	// Default: success dengan payment URL derived dari order id.
	return &ChargeResponse{
		ProviderRefID: "fake-" + req.OrderID,
		PaymentURL:    fmt.Sprintf("https://fake-gw.local/pay/%s", req.OrderID),
	}, nil
}

func (f *FakeGateway) HandleWebhook(ctx context.Context, headers map[string]string, body []byte) (*WebhookEvent, error) {
	f.record("HandleWebhook", body)
	if f.HandleWebhookFn != nil {
		return f.HandleWebhookFn(ctx, headers, body)
	}
	return &WebhookEvent{Status: StatusSuccess, RawPayload: body}, nil
}
