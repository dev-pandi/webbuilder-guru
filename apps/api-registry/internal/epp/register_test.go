package epp

import (
	"encoding/xml"
	"strings"
	"testing"

	"github.com/teknispandi/epp-pandi-client/v2/frames"
)

func TestNewDomainAuthInfo(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		pw, err := newDomainAuthInfo()
		if err != nil {
			t.Fatal(err)
		}
		if len(pw) != 16 {
			t.Fatalf("len = %d, want 16 (%q)", len(pw), pw)
		}
		for _, set := range []string{authUpper, authLower, authDigits, authSpecial} {
			if !strings.ContainsAny(pw, set) {
				t.Fatalf("%q missing a char from %q", pw, set)
			}
		}
		if seen[pw] {
			t.Fatalf("duplicate authInfo %q", pw)
		}
		seen[pw] = true
	}
}

// Library v2 menjalankan Validate() sebelum mengirim; v1 tidak. Frame yang
// tidak lolos di sini berarti registrasi domain gagal di produksi.
func TestBuildDomainCreate_PassesV2Validation(t *testing.T) {
	frame := buildDomainCreate("contoh.my.id", 2, "WB-ABC123", "Xy7#kLm9pQ2!rStU", []string{"ns1.example.id", "ns2.example.id"})
	if err := frame.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	out, err := xml.Marshal(frame)
	if err != nil {
		t.Fatal(err)
	}
	x := string(out)
	for _, want := range []string{"contoh.my.id", `unit="y"`, ">2<", "WB-ABC123", "Xy7#kLm9pQ2!rStU", "ns1.example.id", `type="admin"`, `type="tech"`, `type="billing"`} {
		if !strings.Contains(x, want) {
			t.Errorf("XML missing %q:\n%s", want, x)
		}
	}
	// Tanpa authInfo v2 harus menolak — memastikan test di atas memang menguji aturan itu.
	if err := buildDomainCreate("contoh.my.id", 1, "WB-ABC123", "", nil).Validate(); err == nil {
		t.Error("expected Validate to reject domain:create without authInfo")
	}
}

func TestDomainUpdateNameservers_PassesV2Validation(t *testing.T) {
	frame := &frames.DomainUpdateType{}
	frame.SetDomain("contoh.my.id")
	frame.AddData(frames.DomainAddRemove{NameServer: &frames.NameServer{HostObject: []string{"ns3.example.id"}}})
	frame.RemoveData(frames.DomainAddRemove{NameServer: &frames.NameServer{HostObject: []string{"ns1.example.id"}}})
	if err := frame.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
}
