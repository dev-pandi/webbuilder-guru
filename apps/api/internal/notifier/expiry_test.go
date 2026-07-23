package notifier

import (
	"strings"
	"testing"
	"time"
)

func TestRenderExpiryBody(t *testing.T) {
	exp := time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)

	cases := []struct {
		name    string
		user    string
		domain  string
		days    int
		appURL  string
		want    []string // substring wajib muncul
		notWant []string // substring TIDAK boleh muncul
	}{
		{
			name:   "greet with name + link",
			user:   "Budi",
			domain: "myshop.id",
			days:   14,
			appURL: "https://dashboard.example.com",
			want: []string{
				"Halo Budi",
				"myshop.id",
				"15 August 2026",
				"14 hari lagi",
				"https://dashboard.example.com/settings/domains/myshop.id",
			},
		},
		{
			name:    "empty name falls back to generic",
			user:    "  ",
			domain:  "toko.co.id",
			days:    3,
			appURL:  "",
			want:    []string{"Halo,", "toko.co.id", "3 hari lagi"},
			notWant: []string{"Halo  ,", "Perpanjang sekarang"}, // no appURL → no link
		},
		{
			name:   "same-day expire relative label",
			user:   "Ani",
			domain: "brand.com",
			days:   0,
			appURL: "https://app/",
			want: []string{
				"Halo Ani",
				"hari ini",
				"https://app/settings/domains/brand.com", // trailing slash stripped
			},
			notWant: []string{"0 hari lagi", "https://app//settings"},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			body := renderExpiryBody(c.user, c.domain, c.days, exp, c.appURL)
			for _, s := range c.want {
				if !strings.Contains(body, s) {
					t.Errorf("body missing %q\n--- body ---\n%s", s, body)
				}
			}
			for _, s := range c.notWant {
				if strings.Contains(body, s) {
					t.Errorf("body should NOT contain %q\n--- body ---\n%s", s, body)
				}
			}
		})
	}
}

func TestNewExpiry_DefaultsAppliedWhenZero(t *testing.T) {
	n := NewExpiry(nil, nil, ExpiryConfig{})
	if n.cfg.Interval != 24*time.Hour {
		t.Errorf("Interval default = %v, want 24h", n.cfg.Interval)
	}
	if n.cfg.Within != 30*24*time.Hour {
		t.Errorf("Within default = %v, want 720h", n.cfg.Within)
	}
	if n.cfg.ResendAfter != 7*24*time.Hour {
		t.Errorf("ResendAfter default = %v, want 168h", n.cfg.ResendAfter)
	}
}

func TestNewExpiry_UserOverridesRespected(t *testing.T) {
	custom := ExpiryConfig{
		Interval:    time.Hour,
		Within:      48 * time.Hour,
		ResendAfter: 2 * time.Hour,
		AppBaseURL:  "https://example.test",
	}
	n := NewExpiry(nil, nil, custom)
	if n.cfg != custom {
		t.Errorf("cfg = %+v, want %+v", n.cfg, custom)
	}
}
