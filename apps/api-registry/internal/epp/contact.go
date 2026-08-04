package epp

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/al0fayz/epp-pandi-client/frames"
	"github.com/webbuilder/api-registry/internal/provider"
)

// deriveHandleFromExternalID — deterministic mapping external user UUID
// → NIC handle EPP. PANDI limit ID 16 char alphanumeric.
//
// Format: "WB" + first-14-hex-of-uuid-md5. Deterministic supaya idempotent
// contact:create — kalau caller register domain baru untuk user yang sama,
// pakai handle sama → PANDI return 2302 kalau sudah exists (kita ignore).
func deriveHandleFromExternalID(externalUserID string) (string, error) {
	trimmed := strings.TrimSpace(externalUserID)
	if trimmed == "" {
		return "", errors.New("external_user_id kosong")
	}
	// Ambil 14 char alphanumeric pertama, skip dash UUID.
	clean := strings.Map(func(r rune) rune {
		if (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			return r
		}
		return -1
	}, strings.ToLower(trimmed))
	if len(clean) < 8 {
		return "", fmt.Errorf("external_user_id terlalu pendek untuk derive handle: %q", externalUserID)
	}
	if len(clean) > 14 {
		clean = clean[:14]
	}
	return "WB" + clean, nil
}

// ensureContact — create contact kalau belum ada. Idempotent: kalau EPP
// return 2302 (object exists), swallow error (contact sudah ada — safe).
//
// Contact digenerate dengan minimal viable fields. Update lebih detail
// via UpdateDomainContact atau UpdateContactByID pasca register.
//
// NIK / civil ID BUKAN concern api-registry per arsitektur — itu PII user
// yang di-owned web builder (verify via document flow di sana). EPP
// contact object hanya menerima nama/email/tel/address standard.
func (p *EPPDirectProvider) ensureContact(ctx context.Context, handle string, c provider.Contact) error {
	p.c.connMu.Lock()
	defer p.c.connMu.Unlock()
	defer p.c.endCommand()
	if err := p.c.ensureConnected(ctx); err != nil {
		return mapEPPErr(err)
	}

	frame := &frames.ContactCreateType{}
	frame.SetContactID(handle)
	frame.SetEmail(c.Email)
	frame.SetAuthInfo(defaultAuthInfo(handle))
	frame.AddVoice(frames.E164Type{Value: normalizePhoneE164(c.Phone)})

	countryCode := c.CountryCode
	if countryCode == "" {
		countryCode = "ID"
	}
	postal := frames.PostalInfo{
		Name: c.Name,
		Type: frames.PostalInfoInternational,
		Address: frames.Address{
			Street:        streetLines(c.Address),
			City:          c.City,
			StateProvince: c.State,
			PostalCode:    c.PostalCode,
			CountryCode:   countryCode,
		},
	}
	frame.AddPostalInfo(postal)

	raw, err := p.c.client.CreateContact(ctx, frame)
	if err != nil {
		return mapEPPErr(err)
	}
	if _, err := parseResponse(raw, "contact:create", nil, nil); err != nil {
		mapped := mapEPPErr(err)
		// Swallow ErrConflict — contact sudah ada (safe untuk re-register flow).
		if errors.Is(mapped, provider.ErrConflict) {
			return nil
		}
		return mapped
	}
	return nil
}

// GetContact — EPP contact:info. Return typed contact data.
//
// `id` di sini adalah web builder internal contact_id (uint64), yang kita
// map ke NIC handle via contactHandleFromID (deterministic). Caller yang
// pakai EPP direct mode HARUS store contact_id yang di-generate/derive di
// web builder side (bukan yang di-generate registrar).
func (p *EPPDirectProvider) GetContact(ctx context.Context, id uint64) (*provider.Contact, error) {
	if id == 0 {
		return nil, fmt.Errorf("%w: contact_id kosong", provider.ErrValidation)
	}
	return p.getContactByHandle(ctx, contactHandleFromID(id))
}

// getContactByHandle — helper internal: query contact:info dengan handle string.
func (p *EPPDirectProvider) getContactByHandle(ctx context.Context, handle string) (*provider.Contact, error) {
	p.c.connMu.Lock()
	defer p.c.connMu.Unlock()
	defer p.c.endCommand()
	if err := p.c.ensureConnected(ctx); err != nil {
		return nil, mapEPPErr(err)
	}

	frame := &frames.ContactInfoType{}
	frame.SetContact(handle)

	raw, err := p.c.client.InfoContact(ctx, frame)
	if err != nil {
		return nil, mapEPPErr(err)
	}
	resp, err := parseResponse(raw, "contact:info", &frames.ContactInfoDataType{}, nil)
	if err != nil {
		return nil, mapEPPErr(err)
	}
	data := resp.ResultData.(*frames.ContactInfoDataType).InfoData

	// Ambil postal international (fallback ke local kalau tidak ada).
	var postal *frames.PostalInfo
	for i := range data.PostalInfo {
		if data.PostalInfo[i].Type == frames.PostalInfoInternational {
			postal = &data.PostalInfo[i]
			break
		}
	}
	if postal == nil && len(data.PostalInfo) > 0 {
		postal = &data.PostalInfo[0]
	}

	out := &provider.Contact{
		Email: data.Email,
	}
	if data.Voice != nil {
		out.Phone = data.Voice.Value
	}
	if postal != nil {
		out.Name = postal.Name
		var addrLines []string
		for _, s := range postal.Address.Street {
			if s != "" && s != "(no address)" {
				addrLines = append(addrLines, s)
			}
		}
		if len(addrLines) > 0 {
			out.Address = strings.Join(addrLines, "\n")
		}
		out.City = postal.Address.City
		out.State = postal.Address.StateProvince
		out.PostalCode = postal.Address.PostalCode
		out.CountryCode = postal.Address.CountryCode
	}
	return out, nil
}

// UpdateContactByID — EPP contact:update. Semua field replace via <chg>.
// Status add/rem TIDAK di-touch (registry preserve).
func (p *EPPDirectProvider) UpdateContactByID(ctx context.Context, id uint64, req provider.UpdateContactRequest) (*provider.UpdateContactResponse, error) {
	if id == 0 {
		return nil, fmt.Errorf("%w: contact_id kosong", provider.ErrValidation)
	}
	handle := contactHandleFromID(id)
	return p.updateContactByHandle(ctx, handle, "", req)
}

// UpdateDomainContact — resolve registrant handle dari domain:info dulu,
// lalu contact:update pada handle-nya.
func (p *EPPDirectProvider) UpdateDomainContact(ctx context.Context, name string, req provider.UpdateContactRequest) (*provider.UpdateContactResponse, error) {
	info, err := p.InfoDomain(ctx, name)
	if err != nil {
		return nil, err
	}
	if info.Registrant == "" {
		return nil, fmt.Errorf("%w: domain tidak punya registrant handle", provider.ErrNotFound)
	}
	return p.updateContactByHandle(ctx, info.Registrant, strings.ToLower(name), req)
}

// updateContactByHandle — shared implementation. `domain` opsional (untuk
// response context). Return `Message` mirror pola PANDI wrapper ("DB + EPP
// registry" success message).
func (p *EPPDirectProvider) updateContactByHandle(ctx context.Context, handle, domain string, req provider.UpdateContactRequest) (*provider.UpdateContactResponse, error) {
	if req.Name == "" || req.Email == "" {
		return nil, fmt.Errorf("%w: name + email wajib", provider.ErrValidation)
	}

	p.c.connMu.Lock()
	defer p.c.connMu.Unlock()
	defer p.c.endCommand()
	if err := p.c.ensureConnected(ctx); err != nil {
		return nil, mapEPPErr(err)
	}

	frame := &frames.ContactUpdateType{}
	frame.SetContactID(handle)
	frame.ChangeEmail(req.Email)
	frame.ChangeVoice(frames.E164Type{Value: normalizePhoneE164(req.Phone)})

	countryCode := req.CountryCode
	if countryCode == "" {
		countryCode = "ID"
	}
	frame.ChangePostalInfo(frames.PostalInfo{
		Name: req.Name,
		Type: frames.PostalInfoInternational,
		Address: frames.Address{
			Street:        streetLines(req.Address),
			City:          req.City,
			StateProvince: req.State,
			PostalCode:    req.PostalCode,
			CountryCode:   countryCode,
		},
	})

	raw, err := p.c.client.UpdateContact(ctx, frame)
	if err != nil {
		return nil, mapEPPErr(err)
	}
	if _, err := parseResponse(raw, "contact:update", nil, nil); err != nil {
		return nil, mapEPPErr(err)
	}

	return &provider.UpdateContactResponse{
		Domain:    domain,
		ContactID: idFromContactHandle(handle),
		NicHandle: handle,
		Name:      req.Name,
		Email:     req.Email,
		Phone:     req.Phone,
		Message:   "contact updated (EPP registry — synchronous)",
	}, nil
}

// --- Contact-specific helpers ---

// streetLines — split user address multi-line ke slice yang RFC-compliant
// (max 3 lines). EPP city+countryCode wajib; street formally opsional tapi
// PANDI biasanya reject empty — kita fallback `(no address)`.
func streetLines(address string) []string {
	lines := []string{}
	if a := strings.TrimSpace(address); a != "" {
		parts := strings.Split(a, "\n")
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part != "" {
				lines = append(lines, part)
			}
			if len(lines) >= 3 {
				break
			}
		}
	}
	if len(lines) == 0 {
		lines = []string{"(no address)"}
	}
	return lines
}

// normalizePhoneE164 — format sederhana: kalau tidak ada prefix "+", assume
// Indonesia (+62). Strip whitespace + dashes. Registry validate format
// strict — kalau salah, mapEPPErr code 2004.
func normalizePhoneE164(phone string) string {
	p := strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(phone), " ", ""), "-", "")
	if p == "" {
		return ""
	}
	if strings.HasPrefix(p, "+") {
		return p
	}
	if strings.HasPrefix(p, "0") {
		return "+62" + p[1:]
	}
	if strings.HasPrefix(p, "62") {
		return "+" + p
	}
	return "+" + p
}

// defaultAuthInfo — random-ish password untuk contact:create authInfo.
// PANDI biasanya tidak enforce, tapi field required per RFC.
// Kalau butuh security, generate crypto/rand di production. MVP: derived
// dari handle supaya deterministic per contact (idempotent re-create).
func defaultAuthInfo(handle string) string {
	return handle + "-authinfo"
}
