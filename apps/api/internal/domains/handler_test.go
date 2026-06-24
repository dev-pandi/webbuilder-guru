package domains

import "testing"

func TestNormalizeHost(t *testing.T) {
	cases := map[string]string{
		"Example.COM":        "example.com",
		" foo.bar.id ":       "foo.bar.id",
		"trailing.dot.":      "trailing.dot",
		"  MIXED.Case.dev. ": "mixed.case.dev",
	}
	for in, want := range cases {
		if got := NormalizeHost(in); got != want {
			t.Errorf("NormalizeHost(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidHost(t *testing.T) {
	ok := []string{"example.com", "shop.example.id", "a-b.c-d.e"}
	for _, h := range ok {
		if !ValidHost(h) {
			t.Errorf("expected %q valid", h)
		}
	}
	bad := []string{"", "no-tld", ".leading.dot", "-bad.com", "bad-.com", "spa ce.com"}
	for _, h := range bad {
		if ValidHost(h) {
			t.Errorf("expected %q invalid", h)
		}
	}
}

func TestIPsOverlap(t *testing.T) {
	cases := []struct {
		name string
		got  []string
		want []string
		out  bool
	}{
		{"empty want", []string{"1.1.1.1"}, nil, false},
		{"match", []string{"1.1.1.1", "2.2.2.2"}, []string{"3.3.3.3", "2.2.2.2"}, true},
		{"no match", []string{"1.1.1.1"}, []string{"2.2.2.2"}, false},
		{"trims whitespace", []string{"  1.1.1.1 "}, []string{" 1.1.1.1"}, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := ipsOverlap(c.got, c.want); got != c.out {
				t.Errorf("ipsOverlap=%v want=%v", got, c.out)
			}
		})
	}
}
