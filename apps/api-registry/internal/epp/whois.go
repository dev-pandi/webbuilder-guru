package epp

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"regexp"
	"strings"
	"time"

	"github.com/webbuilder/api-registry/internal/provider"
)

// PANDI WHOIS server — RFC 3912. TCP:43.
const pandiWhoisServer = "whois.id"

// Whois — query WHOIS via TCP:43 (RFC 3912), bukan EPP. Return parsed
// structured data.
//
// Kenapa TCP:43 alih EPP domain:info?
//   - WHOIS format lebih standard cross-registrar (tidak butuh EPP session)
//   - Public info visible tanpa auth (rate-limited server-side)
//   - EPP contact info privacy-redacted (dari registry perspective)
//
// Kalau TCP:43 error / timeout, fallback ke InfoDomain via EPP.
func (p *EPPDirectProvider) Whois(ctx context.Context, domain string) (*provider.Whois, error) {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return nil, fmt.Errorf("%w: domain kosong", provider.ErrValidation)
	}

	raw, err := queryWhois(ctx, pandiWhoisServer, domain, 10*time.Second)
	if err != nil {
		// Fallback ke InfoDomain kalau TCP:43 unreachable — pastikan
		// endpoint /whois tetap functional meskipun cuma dapat data
		// terbatas dari EPP.
		return p.whoisFromInfoDomain(ctx, domain)
	}
	return parseWhoisResponse(domain, raw), nil
}

// queryWhois — RFC 3912 client. Connect TCP:43, send domain + CRLF,
// read all response.
func queryWhois(ctx context.Context, server, domain string, timeout time.Duration) ([]byte, error) {
	d := &net.Dialer{Timeout: timeout}
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(server, "43"))
	if err != nil {
		return nil, fmt.Errorf("whois dial %s: %w", server, err)
	}
	defer conn.Close()

	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(timeout)
	}
	_ = conn.SetDeadline(deadline)

	if _, err := fmt.Fprintf(conn, "%s\r\n", domain); err != nil {
		return nil, fmt.Errorf("whois write: %w", err)
	}
	body, err := io.ReadAll(conn)
	if err != nil {
		return nil, fmt.Errorf("whois read: %w", err)
	}
	return body, nil
}

// parseWhoisResponse — extract key fields dari WHOIS text response.
// PANDI WHOIS format standard key-value dengan "Key: Value" per line.
// Kalau field tidak ada, empty string (bukan error — WHOIS format
// bervariasi per registry).
func parseWhoisResponse(domain string, raw []byte) *provider.Whois {
	out := &provider.Whois{Domain: domain}

	// Deteksi "not registered" — PANDI + banyak registry pakai variasi
	// pesan ini. Kalau match, return early sebagai status=available.
	lower := strings.ToLower(string(raw))
	if strings.Contains(lower, "not found") ||
		strings.Contains(lower, "no match") ||
		strings.Contains(lower, "no data found") ||
		strings.Contains(lower, "domain not found") {
		out.Status = "available"
		return out
	}

	scanner := bufio.NewScanner(strings.NewReader(string(raw)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "%") || strings.HasPrefix(line, "#") {
			continue // comment / blank
		}
		key, val, ok := splitWhoisKV(line)
		if !ok {
			continue
		}
		switch normalizeWhoisKey(key) {
		case "status", "domainstatus":
			if out.Status == "" {
				out.Status = val
			}
		case "sponsoringregistrar", "registrar":
			out.Registrar = val
		case "creationdate", "created", "registered":
			out.CreatedAt = val
		case "expirationdate", "expiresat", "expiredate", "registryexpirydate":
			out.ExpiresAt = val
		case "registrantname", "registrant", "owner":
			out.OwnerMasked = maskOwner(val)
		}
	}
	if out.Status == "" {
		out.Status = "registered" // default: kalau ada data response, asumsi registered
	}
	return out
}

// splitWhoisKV — parse "Key: Value" line. Return (key, val, ok=true) kalau
// format valid. Support multi-word key seperti "Sponsoring Registrar: ...".
func splitWhoisKV(line string) (key, val string, ok bool) {
	idx := strings.Index(line, ":")
	if idx < 0 {
		return "", "", false
	}
	return strings.TrimSpace(line[:idx]), strings.TrimSpace(line[idx+1:]), true
}

// normalizeWhoisKey — collapse whitespace + lowercase supaya match kunci
// yang bervariasi antar-registry. "Sponsoring Registrar" → "sponsoringregistrar".
func normalizeWhoisKey(key string) string {
	return strings.ToLower(spaceRE.ReplaceAllString(key, ""))
}

var spaceRE = regexp.MustCompile(`\s+`)

// maskOwner — WHOIS return full name owner, kita mask sebagian untuk
// privacy (biasakan default output). Sisakan first 2 char + `***`.
func maskOwner(name string) string {
	if len(name) <= 3 {
		return "***"
	}
	if len(name) <= 6 {
		return name[:2] + "***"
	}
	return name[:2] + "***" + name[len(name)-2:]
}

// whoisFromInfoDomain — fallback kalau TCP:43 unreachable. Data terbatas
// (no registrant name, cuma status + dates + registrar handle).
func (p *EPPDirectProvider) whoisFromInfoDomain(ctx context.Context, domain string) (*provider.Whois, error) {
	info, err := p.InfoDomain(ctx, domain)
	if err != nil {
		return nil, err
	}
	return &provider.Whois{
		Domain:    info.Domain,
		Status:    joinStatuses(info.Status),
		Registrar: info.Registrant,
		CreatedAt: info.CreatedAt.Format(time.RFC3339),
		ExpiresAt: info.ExpiresAt.Format(time.RFC3339),
	}, nil
}
