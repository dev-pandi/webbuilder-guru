package site_byo_domains

import (
	"errors"
	"time"
)

// State enumerates lifecycle states for a BYO row. Mirrors the CHECK
// constraint on site_byo_domains.status.
type State string

const (
	StatePending      State = "pending"
	StateVerified     State = "verified"
	StateDrifting     State = "drifting"
	StateSuspended    State = "suspended"
	StateDisconnected State = "disconnected"
	StateExpired      State = "expired"
)

// Event is a lifecycle input. Guards decide whether the event actually
// transitions, and to what state.
type Event string

const (
	EventVerifySuccess   Event = "verify_success"
	EventVerifyFail      Event = "verify_fail"
	EventHealthOK        Event = "health_ok"
	EventHealthFail      Event = "health_fail"
	EventWhoisExpired    Event = "whois_expired"
	EventWhoisRenewed    Event = "whois_renewed"
	EventReverifyRequest Event = "reverify_request"
	EventTick            Event = "tick" // periodic — advances drift/expired grace
)

// Grace windows are config, not consts, so tests can tweak them without
// racing with real timers.
type Config struct {
	DriftGrace     time.Duration // verified → drifting after N consecutive health fails worth of time (default 7d)
	SuspendedGrace time.Duration // drifting → suspended (default 7d from drift_detected_at)
	DisconnectHard time.Duration // suspended → disconnected (default 30d from drift_detected_at total)
	ExpiredCleanup time.Duration // expired → delete (90d from expires_at)
}

func DefaultConfig() Config {
	return Config{
		DriftGrace:     24 * time.Hour,
		SuspendedGrace: 7 * 24 * time.Hour,
		DisconnectHard: 30 * 24 * time.Hour,
		ExpiredCleanup: 90 * 24 * time.Hour,
	}
}

// Row is the subset of site_byo_domains relevant to the state machine.
// Keeping this a plain struct (no DB types) lets the machine be unit-tested
// without touching Postgres.
type Row struct {
	Status            State
	ExpiresAt         *time.Time
	VerifiedAt        *time.Time
	DriftDetectedAt   *time.Time
	SuspendedAt       *time.Time
	DisconnectedAt    *time.Time
	IsPrimary         bool // reflects sites.primary_hostname = this.hostname
}

// SideEffect is what the state machine tells the caller to do after a
// transition. The machine itself is pure — no I/O.
type SideEffect string

const (
	EffectSetVerifiedAt     SideEffect = "set_verified_at"
	EffectClearDrift        SideEffect = "clear_drift"
	EffectSetDriftDetected  SideEffect = "set_drift_detected"
	EffectSetSuspended      SideEffect = "set_suspended"
	EffectSetDisconnected   SideEffect = "set_disconnected"
	EffectDemotePrimary     SideEffect = "demote_primary" // promote site anchor
	EffectSendDriftEmail    SideEffect = "send_drift_email"
	EffectSendRecoveryEmail SideEffect = "send_recovery_email"
	EffectSendExpiryEmail   SideEffect = "send_expiry_email"
	EffectSendExpiredEmail  SideEffect = "send_expired_email"
	EffectDeleteCFZone      SideEffect = "delete_cf_zone"
	EffectHardDelete        SideEffect = "hard_delete_row"
)

// Decision is the output of Decide: the new state (empty = no change) and the
// side effects to apply. Err != nil means the event was illegal in current
// state (handler should treat as 400 / log and ignore).
type Decision struct {
	Next    State
	Effects []SideEffect
	Err     error
}

var (
	ErrIllegalTransition = errors.New("illegal transition")
	ErrGuardFailed       = errors.New("guard failed")
)

// Decide computes the transition. `now` is injected for determinism.
func Decide(row Row, event Event, now time.Time, cfg Config) Decision {
	switch row.Status {
	case StatePending:
		return decidePending(row, event, now)
	case StateVerified:
		return decideVerified(row, event, now, cfg)
	case StateDrifting:
		return decideDrifting(row, event, now, cfg)
	case StateSuspended:
		return decideSuspended(row, event, now, cfg)
	case StateDisconnected:
		return decideDisconnected(row, event, now)
	case StateExpired:
		return decideExpired(row, event, now, cfg)
	}
	return Decision{Err: ErrIllegalTransition}
}

func decidePending(_ Row, event Event, _ time.Time) Decision {
	switch event {
	case EventVerifySuccess:
		return Decision{
			Next:    StateVerified,
			Effects: []SideEffect{EffectSetVerifiedAt},
		}
	case EventVerifyFail:
		// Stay pending — handler decides retry policy / backoff.
		return Decision{Next: StatePending}
	}
	return Decision{Err: ErrIllegalTransition}
}

func decideVerified(row Row, event Event, now time.Time, _ Config) Decision {
	switch event {
	case EventHealthFail:
		return Decision{
			Next:    StateDrifting,
			Effects: []SideEffect{EffectSetDriftDetected, EffectSendDriftEmail},
		}
	case EventHealthOK:
		// Noop — already verified, no drift to clear.
		return Decision{Next: StateVerified}
	case EventWhoisExpired:
		if row.ExpiresAt == nil || now.Before(*row.ExpiresAt) {
			return Decision{Err: ErrGuardFailed}
		}
		effects := []SideEffect{EffectSendExpiredEmail}
		if row.IsPrimary {
			effects = append(effects, EffectDemotePrimary)
		}
		return Decision{Next: StateExpired, Effects: effects}
	case EventTick:
		// Fire expiry warning emails as expiry approaches. Idempotence handled
		// by caller (expiry_notice_sent_at dedupe window).
		if row.ExpiresAt != nil {
			daysToExpiry := int(row.ExpiresAt.Sub(now) / (24 * time.Hour))
			if daysToExpiry >= 0 && daysToExpiry <= 30 {
				return Decision{Next: StateVerified, Effects: []SideEffect{EffectSendExpiryEmail}}
			}
		}
		return Decision{Next: StateVerified}
	}
	return Decision{Err: ErrIllegalTransition}
}

func decideDrifting(row Row, event Event, now time.Time, cfg Config) Decision {
	switch event {
	case EventHealthOK:
		return Decision{
			Next:    StateVerified,
			Effects: []SideEffect{EffectClearDrift, EffectSendRecoveryEmail},
		}
	case EventHealthFail:
		// Still drifting — tick evaluation below handles grace expiry.
		return Decision{Next: StateDrifting}
	case EventTick:
		if row.DriftDetectedAt == nil {
			return Decision{Err: ErrGuardFailed}
		}
		elapsed := now.Sub(*row.DriftDetectedAt)
		if elapsed >= cfg.SuspendedGrace {
			return Decision{
				Next:    StateSuspended,
				Effects: []SideEffect{EffectSetSuspended, EffectSendDriftEmail},
			}
		}
		return Decision{Next: StateDrifting}
	case EventWhoisExpired:
		if row.ExpiresAt == nil || now.Before(*row.ExpiresAt) {
			return Decision{Err: ErrGuardFailed}
		}
		effects := []SideEffect{EffectSendExpiredEmail}
		if row.IsPrimary {
			effects = append(effects, EffectDemotePrimary)
		}
		return Decision{Next: StateExpired, Effects: effects}
	}
	return Decision{Err: ErrIllegalTransition}
}

func decideSuspended(row Row, event Event, now time.Time, cfg Config) Decision {
	switch event {
	case EventHealthOK:
		return Decision{
			Next:    StateVerified,
			Effects: []SideEffect{EffectClearDrift, EffectSendRecoveryEmail},
		}
	case EventTick:
		if row.DriftDetectedAt == nil {
			return Decision{Err: ErrGuardFailed}
		}
		elapsed := now.Sub(*row.DriftDetectedAt)
		if elapsed >= cfg.DisconnectHard {
			effects := []SideEffect{EffectSetDisconnected}
			if row.IsPrimary {
				effects = append(effects, EffectDemotePrimary)
			}
			return Decision{Next: StateDisconnected, Effects: effects}
		}
		return Decision{Next: StateSuspended}
	case EventWhoisExpired:
		if row.ExpiresAt == nil || now.Before(*row.ExpiresAt) {
			return Decision{Err: ErrGuardFailed}
		}
		effects := []SideEffect{EffectSendExpiredEmail}
		if row.IsPrimary {
			effects = append(effects, EffectDemotePrimary)
		}
		return Decision{Next: StateExpired, Effects: effects}
	}
	return Decision{Err: ErrIllegalTransition}
}

func decideDisconnected(_ Row, event Event, _ time.Time) Decision {
	switch event {
	case EventReverifyRequest:
		return Decision{Next: StatePending}
	}
	return Decision{Err: ErrIllegalTransition}
}

func decideExpired(row Row, event Event, now time.Time, cfg Config) Decision {
	switch event {
	case EventWhoisRenewed:
		if row.ExpiresAt == nil || !now.Before(*row.ExpiresAt) {
			return Decision{Err: ErrGuardFailed}
		}
		return Decision{Next: StateVerified, Effects: []SideEffect{EffectSendRecoveryEmail}}
	case EventTick:
		if row.ExpiresAt != nil && now.Sub(*row.ExpiresAt) >= cfg.ExpiredCleanup {
			return Decision{
				Next:    StateExpired, // marker; caller treats EffectHardDelete as terminal
				Effects: []SideEffect{EffectDeleteCFZone, EffectHardDelete},
			}
		}
		return Decision{Next: StateExpired}
	}
	return Decision{Err: ErrIllegalTransition}
}

// CanSetPrimary reports whether a row is eligible to be promoted to primary.
// Called by the /set-primary handler before mutating sites.primary_hostname.
func CanSetPrimary(row Row) error {
	if row.Status != StateVerified {
		return ErrGuardFailed
	}
	return nil
}
