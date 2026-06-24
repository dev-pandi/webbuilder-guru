// Package mail abstracts transactional email so password reset + email
// verification flows don't bake in a specific provider.
//
// Drivers:
//   - "log":  prints the message to stdout (default — dev mode).
//   - "smtp": uses net/smtp with optional STARTTLS.
//
// We deliberately keep the interface narrow: subject + plain-text body. HTML
// is overkill for OTP-style emails and would force a templating dep.
package mail

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
)

// Message is the minimum payload a transactional email needs.
type Message struct {
	To      string // recipient email
	Subject string
	Body    string // plain-text
}

// Sender is the abstraction over mail drivers.
type Sender interface {
	Send(ctx context.Context, m Message) error
	Driver() string
}

// Config is what main wires from app config.
type Config struct {
	Driver string // "log" | "smtp"

	// SMTP — only used when Driver=="smtp".
	Host     string
	Port     int
	Username string
	Password string
	From     string
	StartTLS bool
}

// New returns a Sender for the given driver. Unknown driver falls back to
// "log" with a warning so the API still boots in misconfigured environments.
func New(cfg Config) (Sender, error) {
	switch strings.ToLower(strings.TrimSpace(cfg.Driver)) {
	case "", "log":
		return &logSender{}, nil
	case "smtp":
		if cfg.Host == "" || cfg.From == "" {
			return nil, errors.New("mail: smtp driver requires Host and From")
		}
		return &smtpSender{cfg: cfg}, nil
	default:
		slog.Warn("mail: unknown driver, falling back to log", "driver", cfg.Driver)
		return &logSender{}, nil
	}
}

// --- log driver ---

type logSender struct{}

func (l *logSender) Driver() string { return "log" }

func (l *logSender) Send(_ context.Context, m Message) error {
	slog.Info("mail (log driver — would send)",
		"to", m.To,
		"subject", m.Subject,
		"body", m.Body,
	)
	return nil
}

// --- smtp driver ---

type smtpSender struct{ cfg Config }

func (s *smtpSender) Driver() string { return "smtp" }

func (s *smtpSender) Send(_ context.Context, m Message) error {
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	var auth smtp.Auth
	if s.cfg.Username != "" {
		auth = smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
	}
	// RFC 5322 minimal headers. From is the configured sender, To is the recipient.
	msg := []byte(
		"From: " + s.cfg.From + "\r\n" +
			"To: " + m.To + "\r\n" +
			"Subject: " + m.Subject + "\r\n" +
			"Content-Type: text/plain; charset=UTF-8\r\n" +
			"\r\n" +
			m.Body + "\r\n",
	)
	return smtp.SendMail(addr, auth, s.cfg.From, []string{m.To}, msg)
}
