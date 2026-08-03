package epp

import (
	"errors"
	"strings"
	"testing"

	"github.com/webbuilder/api-registry/internal/provider"
)

func TestMapEPPErr_KnownCodesToSentinels(t *testing.T) {
	cases := []struct {
		code   int
		target error
	}{
		{eppCodeObjectNotExist, provider.ErrNotFound},
		{eppCodeObjectExists, provider.ErrConflict},
		{eppCodeAuthError, provider.ErrUnauthorized},
		{eppCodeAuthorizationError, provider.ErrUnauthorized},
		{eppCodeInvalidAttribute, provider.ErrValidation},
		{eppCodeParameterValueRange, provider.ErrValidation},
		{eppCodeMissingParameter, provider.ErrValidation},
		{eppCodeSessionLimitExceed, provider.ErrRateLimit},
	}
	for _, tc := range cases {
		err := &EPPResponseError{Code: tc.code, Message: "test", Op: "test:op"}
		mapped := mapEPPErr(err)
		if !errors.Is(mapped, tc.target) {
			t.Errorf("code=%d should map ke %v, dapat %v", tc.code, tc.target, mapped)
		}
	}
}

func TestMapEPPErr_UnknownCodeReturnsUpstreamError(t *testing.T) {
	err := &EPPResponseError{Code: 2999, Message: "unknown", Op: "x:y"}
	mapped := mapEPPErr(err)
	var upErr *provider.UpstreamError
	if !errors.As(mapped, &upErr) {
		t.Errorf("unknown code seharusnya jadi UpstreamError, dapat %T", mapped)
	}
	if upErr.Code != "epp_2999" {
		t.Errorf("code label mismatch: %s", upErr.Code)
	}
}

func TestMapEPPErr_NonEPPBecomesNetworkUpstream(t *testing.T) {
	err := errors.New("connection reset")
	mapped := mapEPPErr(err)
	var upErr *provider.UpstreamError
	if !errors.As(mapped, &upErr) {
		t.Errorf("non-EPP error seharusnya jadi UpstreamError, dapat %T", mapped)
	}
	if upErr.Code != "network" {
		t.Errorf("code = %q, expected 'network'", upErr.Code)
	}
}

func TestParseResponse_ErrorCodeReturnsEPPErr(t *testing.T) {
	raw := []byte(`<?xml version="1.0"?>
<epp xmlns="urn:ietf:params:xml:ns:epp-1.0">
  <response>
    <result code="2303">
      <msg>Object does not exist</msg>
    </result>
  </response>
</epp>`)
	_, err := parseResponse(raw, "domain:info", nil, nil)
	if err == nil {
		t.Fatal("expected EPP error for code 2303")
	}
	epErr, ok := err.(*EPPResponseError)
	if !ok {
		t.Fatalf("expected EPPResponseError, got %T", err)
	}
	if epErr.Code != 2303 {
		t.Errorf("code mismatch: %d", epErr.Code)
	}
}

func TestParseResponse_MalformedXMLReturnsError(t *testing.T) {
	_, err := parseResponse([]byte(`<not valid xml`), "test:op", nil, nil)
	if err == nil {
		t.Fatal("expected error for malformed XML")
	}
	if !strings.Contains(err.Error(), "unmarshal") {
		t.Errorf("expected unmarshal error, got: %v", err)
	}
}

func TestCapabilities_EPPDirectShape(t *testing.T) {
	p := &EPPDirectProvider{}
	caps := p.Capabilities()
	// EPP direct: wallet/promo/document di web builder — bukan EPP concern.
	if caps.HasWallet || caps.HasPromoInternal || caps.HasDocumentFlow {
		t.Errorf("EPP direct seharusnya delegate wallet/promo/doc ke web builder, dapat: %+v", caps)
	}
	// Yang harus tersedia via EPP native (interface currently exposes):
	if !caps.HasBulkCheck || !caps.HasContact {
		t.Errorf("EPP direct seharusnya support check+contact, dapat: %+v", caps)
	}
	// Transfer + DNSSEC belum di Provider interface — flag harus jujur false.
	if caps.HasTransfer || caps.HasDNSSEC {
		t.Errorf("HasTransfer/HasDNSSEC harus false selama interface belum expose method-nya, dapat: %+v", caps)
	}
}

func TestName_ReturnsEPPDirect(t *testing.T) {
	p := &EPPDirectProvider{}
	if p.Name() != "epp_direct" {
		t.Errorf("Name = %q, expected 'epp_direct'", p.Name())
	}
}
