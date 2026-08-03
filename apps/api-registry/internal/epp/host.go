package epp

import (
	"context"
	"fmt"
	"strings"

	"github.com/al0fayz/epp-pandi-client/frames"
	"github.com/webbuilder/api-registry/internal/provider"
)

// GetNameservers — derive dari domain:info (satu round-trip).
func (p *EPPDirectProvider) GetNameservers(ctx context.Context, name string) (*provider.NameserverInfo, error) {
	info, err := p.InfoDomain(ctx, name)
	if err != nil {
		return nil, err
	}
	return &provider.NameserverInfo{
		Domain:      strings.ToLower(name),
		Nameservers: info.Nameservers,
	}, nil
}

// UpdateNameservers — EPP domain:update dengan add/rem NS diff.
// EPP tidak accept "replace all" — kita hitung diff current vs desired,
// kirim add+rem block. Kalau tidak ada perubahan, no-op return current.
//
// Nameserver di-passing sebagai hostObj (name-only, bukan hostAttr
// dengan IP inline). Registrar biasanya sudah punya host record — kalau
// belum, PANDI reject dengan code 2303 → caller harus create host dulu
// atau pakai hostAttr flow.
func (p *EPPDirectProvider) UpdateNameservers(ctx context.Context, name string, ns []string) (*provider.NameserverInfo, error) {
	// Validasi input.
	if len(ns) < 2 {
		return nil, fmt.Errorf("%w: min 2 nameserver (redundancy)", provider.ErrValidation)
	}
	if len(ns) > 13 {
		return nil, fmt.Errorf("%w: max 13 nameserver per RFC 5731", provider.ErrValidation)
	}

	// Fetch current state.
	current, err := p.GetNameservers(ctx, name)
	if err != nil {
		return nil, err
	}
	curSet := setOf(current.Nameservers)
	nextSet := setOf(ns)

	toAdd := make([]string, 0)
	toRem := make([]string, 0)
	for n := range nextSet {
		if !curSet[n] {
			toAdd = append(toAdd, n)
		}
	}
	for n := range curSet {
		if !nextSet[n] {
			toRem = append(toRem, n)
		}
	}
	// No-op — no diff, return current.
	if len(toAdd) == 0 && len(toRem) == 0 {
		return current, nil
	}

	p.c.connMu.Lock()
	defer p.c.connMu.Unlock()
	if err := p.c.ensureConnected(ctx); err != nil {
		return nil, mapEPPErr(err)
	}

	frame := &frames.DomainUpdateType{}
	frame.SetDomain(strings.ToLower(name))
	if len(toAdd) > 0 {
		frame.AddData(frames.DomainAddRemove{
			NameServer: frames.NameServer{HostObject: toAdd},
		})
	}
	if len(toRem) > 0 {
		frame.RemoveData(frames.DomainAddRemove{
			NameServer: frames.NameServer{HostObject: toRem},
		})
	}

	raw, err := p.c.client.UpdateDomain(ctx, frame)
	if err != nil {
		return nil, mapEPPErr(err)
	}
	// domain:update return no resData — cuma result code. parseResponse
	// akan return error kalau code >= 2000.
	if _, err := parseResponse(raw, "domain:update", nil, nil); err != nil {
		return nil, mapEPPErr(err)
	}

	// Return desired state (asumsi PANDI accept — kalau reject, sudah error di atas).
	return &provider.NameserverInfo{
		Domain:      strings.ToLower(name),
		Nameservers: ns,
	}, nil
}
