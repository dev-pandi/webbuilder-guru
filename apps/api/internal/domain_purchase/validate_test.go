package domain_purchase

import (
	"strings"
	"testing"
)

func TestValidateDomainLength(t *testing.T) {
	cases := []struct {
		name     string
		fqdn     string
		wantErr  bool
		wantHint string // substring expected in error message
	}{
		// Direct SLD under .id — min 5 chars
		{"direct SLD 2 char (blocked)", "ab.id", true, "minimal 5"},
		{"direct SLD 3 char (blocked)", "abc.id", true, "minimal 5"},
		{"direct SLD 4 char (blocked)", "nike.id", true, "minimal 5"},
		{"direct SLD 5 char (OK)", "nikes.id", false, ""},
		{"direct SLD 10 char (OK)", "mytoko123x.id", false, ""},

		// Second-level under .id — min 3 chars
		{"co.id SLD 1 char (blocked)", "a.co.id", true, "minimal 3"},
		{"co.id SLD 2 char (blocked)", "ab.co.id", true, "minimal 3"},
		{"co.id SLD 3 char (OK)", "abc.co.id", false, ""},
		{"ac.id SLD 2 char (blocked)", "ug.ac.id", true, "minimal 3"},
		{"ac.id SLD 3 char (OK)", "upi.ac.id", false, ""},
		{"sch.id SLD 3 char (OK)", "sdn.sch.id", false, ""},
		{"my.id SLD 10 char (OK)", "sanggitafb.my.id", false, ""},

		// Non-.id — tidak di-restrict
		{".com 2 char (OK)", "ab.com", false, ""},
		{".net 1 char (OK)", "a.net", false, ""},
		{".co 2 char (OK)", "ab.co", false, ""},

		// Edge cases
		{"empty (passed through)", "", false, ""},
		{"no dot (passed through)", "nike", false, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := validateDomainLength(tc.fqdn)
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error for %q, got nil", tc.fqdn)
					return
				}
				if tc.wantHint != "" && !strings.Contains(err.Error(), tc.wantHint) {
					t.Errorf("error should contain %q, got: %v", tc.wantHint, err)
				}
			} else {
				if err != nil {
					t.Errorf("expected nil for %q, got: %v", tc.fqdn, err)
				}
			}
		})
	}
}
