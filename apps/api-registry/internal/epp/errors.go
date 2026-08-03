package epp

import (
	"fmt"

	"github.com/webbuilder/api-registry/internal/provider"
)

// EPP result code constants — RFC 5730 §3.
// https://www.rfc-editor.org/rfc/rfc5730.html#section-3
//
// Sub-set yang kita map explicit ke sentinel error. Code lain fall-through
// ke UpstreamError generic.
const (
	// Success (1xxx).
	eppCodeSuccess             = 1000 // Command completed successfully
	eppCodeSuccessAckToDequeue = 1301
	eppCodeSuccessNoMessages   = 1300

	// Command syntax errors (2xxx).
	eppCodeMissingParameter    = 2003
	eppCodeParameterValueRange = 2004
	eppCodeAuthError           = 2200
	eppCodeAuthorizationError  = 2201
	eppCodeObjectExists        = 2302
	eppCodeObjectNotExist      = 2303
	eppCodeInvalidAttribute    = 2306
	eppCodeCommandFailed       = 2400
	eppCodeSessionLimitExceed  = 2502
)

// EPPResponseError — dilempar dari parseResponse kalau result code >= 2000.
// Mengekspos code + message asli supaya caller (mapEPPErr) bisa translate.
type EPPResponseError struct {
	Code    int
	Message string
	Op      string // "domain:create", dsb. — untuk logging
}

func (e *EPPResponseError) Error() string {
	return fmt.Sprintf("EPP %d (%s): %s", e.Code, e.Op, e.Message)
}

// mapEPPErr — konversi error internal → sentinel provider.Err* supaya
// handler + resilience decorator classify benar (retry-able vs deterministic).
//
// Non-EPP error (network, parse) → wrap sebagai UpstreamError kategori
// "network". EPP known code → sentinel spesifik.
func mapEPPErr(err error) error {
	if err == nil {
		return nil
	}
	epErr, ok := err.(*EPPResponseError)
	if !ok {
		return &provider.UpstreamError{
			Provider: "epp_direct",
			Status:   0,
			Code:     "network",
			Message:  err.Error(),
			Cause:    err,
		}
	}
	upErr := &provider.UpstreamError{
		Provider: "epp_direct",
		Status:   epErr.Code,
		Code:     fmt.Sprintf("epp_%d", epErr.Code),
		Message:  epErr.Message,
		Cause:    err,
	}
	switch epErr.Code {
	case eppCodeObjectNotExist:
		return fmt.Errorf("%w: %s", provider.ErrNotFound, upErr.Error())
	case eppCodeObjectExists:
		return fmt.Errorf("%w: %s", provider.ErrConflict, upErr.Error())
	case eppCodeAuthError, eppCodeAuthorizationError:
		return fmt.Errorf("%w: %s", provider.ErrUnauthorized, upErr.Error())
	case eppCodeInvalidAttribute, eppCodeParameterValueRange, eppCodeMissingParameter:
		return fmt.Errorf("%w: %s", provider.ErrValidation, upErr.Error())
	case eppCodeSessionLimitExceed:
		return fmt.Errorf("%w: %s", provider.ErrRateLimit, upErr.Error())
	}
	return upErr
}
