package openapi

import (
	"encoding/json"
	"testing"
)

// TestSpec_NonEmpty — bundle spec.json harus di-embed pas build (kalau
// //go:embed gagal, `Spec` bakal nil di runtime).
func TestSpec_NonEmpty(t *testing.T) {
	if len(Spec) == 0 {
		t.Fatal("Spec is empty — embed failed?")
	}
}

// TestSpec_ValidJSON — spec parseable sebagai OpenAPI object.
func TestSpec_ValidJSON(t *testing.T) {
	var doc map[string]any
	if err := json.Unmarshal(Spec, &doc); err != nil {
		t.Fatalf("Spec is not valid JSON: %v", err)
	}
	if doc["openapi"] == nil {
		t.Errorf("spec missing 'openapi' field")
	}
	if _, ok := doc["info"].(map[string]any); !ok {
		t.Errorf("spec missing 'info' object")
	}
}

// TestSpec_HasCoreEndpoints — sanity check bahwa endpoint utama ada di spec.
// Kalau route baru di-tambah di code tapi lupa update spec, test ini fail
// untuk endpoint yang critical.
func TestSpec_HasCoreEndpoints(t *testing.T) {
	var doc struct {
		Paths map[string]any `json:"paths"`
	}
	if err := json.Unmarshal(Spec, &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(doc.Paths) == 0 {
		t.Fatal("spec.paths kosong")
	}
	// Core endpoints yang wajib ada. Kalau spec di-restructure, update daftar.
	// Threshold longgar (substring match) supaya path parameter variasi tetap ke-detect.
	mustHave := []string{
		"/v1/domains/check",
		"/v1/domains/register",
		"/v1/whois",
	}
	for _, path := range mustHave {
		if _, ok := doc.Paths[path]; !ok {
			t.Errorf("spec.paths missing %q — update spec.json setelah tambah endpoint",
				path)
		}
	}
}

// TestSpec_HMACSecurityScheme — spec harus expose hmacAuth security scheme
// supaya konsumer tahu auth requirement.
func TestSpec_HMACSecurityScheme(t *testing.T) {
	var doc struct {
		Components struct {
			SecuritySchemes map[string]any `json:"securitySchemes"`
		} `json:"components"`
	}
	if err := json.Unmarshal(Spec, &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := doc.Components.SecuritySchemes["hmacAuth"]; !ok {
		t.Errorf("spec.components.securitySchemes.hmacAuth missing")
	}
}
