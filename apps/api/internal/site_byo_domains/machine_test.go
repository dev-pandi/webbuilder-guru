package site_byo_domains

import (
	"testing"
	"time"
)

func mustTime(t *testing.T, s string) time.Time {
	t.Helper()
	v, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("parse time: %v", err)
	}
	return v
}

func ptr[T any](v T) *T { return &v }

func TestDecide_PendingVerifySuccess(t *testing.T) {
	row := Row{Status: StatePending}
	now := mustTime(t, "2026-10-07T00:00:00Z")
	d := Decide(row, EventVerifySuccess, now, DefaultConfig())
	if d.Err != nil {
		t.Fatalf("unexpected err: %v", d.Err)
	}
	if d.Next != StateVerified {
		t.Fatalf("want verified, got %s", d.Next)
	}
	if !hasEffect(d.Effects, EffectSetVerifiedAt) {
		t.Fatalf("missing set_verified_at effect: %v", d.Effects)
	}
}

func TestDecide_PendingVerifyFailStaysPending(t *testing.T) {
	row := Row{Status: StatePending}
	d := Decide(row, EventVerifyFail, time.Now(), DefaultConfig())
	if d.Err != nil {
		t.Fatalf("unexpected err: %v", d.Err)
	}
	if d.Next != StatePending {
		t.Fatalf("want pending, got %s", d.Next)
	}
}

func TestDecide_PendingIllegalEvent(t *testing.T) {
	row := Row{Status: StatePending}
	d := Decide(row, EventHealthOK, time.Now(), DefaultConfig())
	if d.Err == nil {
		t.Fatalf("want illegal transition err, got nil")
	}
}

func TestDecide_VerifiedHealthFailMovesToDrifting(t *testing.T) {
	row := Row{Status: StateVerified}
	d := Decide(row, EventHealthFail, time.Now(), DefaultConfig())
	if d.Err != nil {
		t.Fatalf("unexpected err: %v", d.Err)
	}
	if d.Next != StateDrifting {
		t.Fatalf("want drifting, got %s", d.Next)
	}
	if !hasEffect(d.Effects, EffectSetDriftDetected) {
		t.Fatalf("missing set_drift_detected effect: %v", d.Effects)
	}
	if !hasEffect(d.Effects, EffectSendDriftEmail) {
		t.Fatalf("missing send_drift_email effect: %v", d.Effects)
	}
}

func TestDecide_VerifiedExpiredDemotesPrimary(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	past := now.Add(-1 * time.Hour)
	row := Row{
		Status:    StateVerified,
		ExpiresAt: &past,
		IsPrimary: true,
	}
	d := Decide(row, EventWhoisExpired, now, DefaultConfig())
	if d.Err != nil {
		t.Fatalf("unexpected err: %v", d.Err)
	}
	if d.Next != StateExpired {
		t.Fatalf("want expired, got %s", d.Next)
	}
	if !hasEffect(d.Effects, EffectDemotePrimary) {
		t.Fatalf("primary row expected demote effect: %v", d.Effects)
	}
	if !hasEffect(d.Effects, EffectSendExpiredEmail) {
		t.Fatalf("missing expired email effect")
	}
}

func TestDecide_VerifiedExpiredNonPrimarySkipsDemote(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	past := now.Add(-1 * time.Hour)
	row := Row{
		Status:    StateVerified,
		ExpiresAt: &past,
		IsPrimary: false,
	}
	d := Decide(row, EventWhoisExpired, now, DefaultConfig())
	if d.Next != StateExpired {
		t.Fatalf("want expired, got %s", d.Next)
	}
	if hasEffect(d.Effects, EffectDemotePrimary) {
		t.Fatalf("non-primary row should NOT demote: %v", d.Effects)
	}
}

func TestDecide_VerifiedExpiredGuardFailsWhenNotActuallyExpired(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	future := now.Add(24 * time.Hour)
	row := Row{Status: StateVerified, ExpiresAt: &future}
	d := Decide(row, EventWhoisExpired, now, DefaultConfig())
	if d.Err == nil {
		t.Fatalf("want guard failed, got transition to %s", d.Next)
	}
}

func TestDecide_VerifiedTickFiresExpiryWarning(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	in15Days := now.Add(15 * 24 * time.Hour)
	row := Row{Status: StateVerified, ExpiresAt: &in15Days}
	d := Decide(row, EventTick, now, DefaultConfig())
	if d.Err != nil {
		t.Fatalf("unexpected err: %v", d.Err)
	}
	if !hasEffect(d.Effects, EffectSendExpiryEmail) {
		t.Fatalf("expected expiry warning within 30d, got %v", d.Effects)
	}
}

func TestDecide_VerifiedTickFarFromExpiryIsNoop(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	far := now.Add(180 * 24 * time.Hour)
	row := Row{Status: StateVerified, ExpiresAt: &far}
	d := Decide(row, EventTick, now, DefaultConfig())
	if len(d.Effects) != 0 {
		t.Fatalf("far-from-expiry tick should be noop, got %v", d.Effects)
	}
}

func TestDecide_DriftingHealthOKRecovers(t *testing.T) {
	drift := mustTime(t, "2026-10-01T00:00:00Z")
	row := Row{Status: StateDrifting, DriftDetectedAt: &drift}
	d := Decide(row, EventHealthOK, mustTime(t, "2026-10-07T00:00:00Z"), DefaultConfig())
	if d.Next != StateVerified {
		t.Fatalf("want verified, got %s", d.Next)
	}
	if !hasEffect(d.Effects, EffectClearDrift) || !hasEffect(d.Effects, EffectSendRecoveryEmail) {
		t.Fatalf("want clear_drift + recovery_email, got %v", d.Effects)
	}
}

func TestDecide_DriftingTickWithinGraceStays(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	drift := now.Add(-3 * 24 * time.Hour) // 3d < 7d SuspendedGrace
	row := Row{Status: StateDrifting, DriftDetectedAt: &drift}
	d := Decide(row, EventTick, now, DefaultConfig())
	if d.Next != StateDrifting {
		t.Fatalf("want drifting, got %s", d.Next)
	}
	if len(d.Effects) != 0 {
		t.Fatalf("in-grace tick should be noop, got %v", d.Effects)
	}
}

func TestDecide_DriftingTickGraceExpiredSuspends(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	drift := now.Add(-8 * 24 * time.Hour) // 8d > 7d grace
	row := Row{Status: StateDrifting, DriftDetectedAt: &drift}
	d := Decide(row, EventTick, now, DefaultConfig())
	if d.Next != StateSuspended {
		t.Fatalf("want suspended, got %s", d.Next)
	}
	if !hasEffect(d.Effects, EffectSetSuspended) {
		t.Fatalf("missing set_suspended effect: %v", d.Effects)
	}
}

func TestDecide_SuspendedTickHardGraceDisconnects(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	drift := now.Add(-31 * 24 * time.Hour) // 31d > 30d DisconnectHard
	row := Row{Status: StateSuspended, DriftDetectedAt: &drift, IsPrimary: true}
	d := Decide(row, EventTick, now, DefaultConfig())
	if d.Next != StateDisconnected {
		t.Fatalf("want disconnected, got %s", d.Next)
	}
	if !hasEffect(d.Effects, EffectSetDisconnected) {
		t.Fatalf("missing set_disconnected: %v", d.Effects)
	}
	if !hasEffect(d.Effects, EffectDemotePrimary) {
		t.Fatalf("primary should be demoted on disconnect: %v", d.Effects)
	}
}

func TestDecide_SuspendedHealthOKRecovers(t *testing.T) {
	drift := mustTime(t, "2026-09-25T00:00:00Z")
	row := Row{Status: StateSuspended, DriftDetectedAt: &drift}
	d := Decide(row, EventHealthOK, mustTime(t, "2026-10-07T00:00:00Z"), DefaultConfig())
	if d.Next != StateVerified {
		t.Fatalf("want verified, got %s", d.Next)
	}
}

func TestDecide_DisconnectedReverify(t *testing.T) {
	row := Row{Status: StateDisconnected}
	d := Decide(row, EventReverifyRequest, time.Now(), DefaultConfig())
	if d.Next != StatePending {
		t.Fatalf("want pending, got %s", d.Next)
	}
}

func TestDecide_ExpiredRenewRecovers(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	future := now.Add(365 * 24 * time.Hour)
	row := Row{Status: StateExpired, ExpiresAt: &future}
	d := Decide(row, EventWhoisRenewed, now, DefaultConfig())
	if d.Next != StateVerified {
		t.Fatalf("want verified, got %s", d.Next)
	}
	if !hasEffect(d.Effects, EffectSendRecoveryEmail) {
		t.Fatalf("want recovery email: %v", d.Effects)
	}
}

func TestDecide_ExpiredRenewGuardFailsWhenStillPast(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	past := now.Add(-1 * time.Hour)
	row := Row{Status: StateExpired, ExpiresAt: &past}
	d := Decide(row, EventWhoisRenewed, now, DefaultConfig())
	if d.Err == nil {
		t.Fatalf("want guard failed, got %s", d.Next)
	}
}

func TestDecide_ExpiredCleanupAfterGrace(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	expired := now.Add(-91 * 24 * time.Hour) // 91d > 90d ExpiredCleanup
	row := Row{Status: StateExpired, ExpiresAt: &expired}
	d := Decide(row, EventTick, now, DefaultConfig())
	if !hasEffect(d.Effects, EffectDeleteCFZone) {
		t.Fatalf("want delete_cf_zone after 90d, got %v", d.Effects)
	}
	if !hasEffect(d.Effects, EffectHardDelete) {
		t.Fatalf("want hard_delete after 90d, got %v", d.Effects)
	}
}

func TestDecide_ExpiredCleanupNoopBeforeGrace(t *testing.T) {
	now := mustTime(t, "2026-10-07T00:00:00Z")
	expired := now.Add(-30 * 24 * time.Hour)
	row := Row{Status: StateExpired, ExpiresAt: &expired}
	d := Decide(row, EventTick, now, DefaultConfig())
	if len(d.Effects) != 0 {
		t.Fatalf("pre-grace tick should be noop, got %v", d.Effects)
	}
}

func TestCanSetPrimary_RejectsNonVerified(t *testing.T) {
	cases := []State{StatePending, StateDrifting, StateSuspended, StateDisconnected, StateExpired}
	for _, s := range cases {
		if err := CanSetPrimary(Row{Status: s}); err == nil {
			t.Errorf("state %s should not be eligible for primary", s)
		}
	}
	if err := CanSetPrimary(Row{Status: StateVerified}); err != nil {
		t.Errorf("verified should be eligible, got err: %v", err)
	}
}

// Illegal transitions matrix — exhaustive sanity check that we don't
// accidentally allow state transitions outside the designed graph.
func TestDecide_IllegalMatrix(t *testing.T) {
	illegal := []struct {
		state State
		event Event
	}{
		{StateVerified, EventVerifySuccess},
		{StateVerified, EventVerifyFail},
		{StateVerified, EventWhoisRenewed},
		{StateVerified, EventReverifyRequest},
		{StateDrifting, EventVerifySuccess},
		{StateDrifting, EventReverifyRequest},
		{StateSuspended, EventVerifySuccess},
		{StateDisconnected, EventHealthOK},
		{StateDisconnected, EventWhoisExpired},
		{StateExpired, EventVerifySuccess},
		{StateExpired, EventHealthOK},
	}
	for _, c := range illegal {
		d := Decide(Row{Status: c.state}, c.event, time.Now(), DefaultConfig())
		if d.Err == nil {
			t.Errorf("expected illegal: state=%s event=%s got next=%s", c.state, c.event, d.Next)
		}
	}
}

func hasEffect(effects []SideEffect, want SideEffect) bool {
	for _, e := range effects {
		if e == want {
			return true
		}
	}
	return false
}
