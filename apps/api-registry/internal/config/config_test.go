package config

import (
	"os"
	"strings"
	"testing"
	"time"
)

// helper — clear env vars yang tests touch supaya tidak bocor antar-run.
// Panggil di awal setiap test.
func clearEnv(t *testing.T) {
	t.Helper()
	keys := []string{
		"PORT", "APP_ENV", "LOG_LEVEL", "PROVIDER_MODE",
		"PANDI_API_URL", "PANDI_API_KEY", "PANDI_EMAIL", "PANDI_PASSWORD", "PANDI_API_TIMEOUT",
		"EPP_HOST", "EPP_PORT", "EPP_USER", "EPP_PASSWORD",
		"EPP_CERT_FILE", "EPP_KEY_FILE", "EPP_CA_FILE",
		"EPP_INSECURE_SKIP_VERIFY", "EPP_KEEPALIVE_INTERVAL",
		"INTERNAL_HMAC_SECRET", "REQUEST_TIMEOUT", "MAX_CONCURRENT",
		"WEBHOOK_UPSTREAM_SECRET", "WEBBUILDER_WEBHOOK_URL",
		"WEBBUILDER_WEBHOOK_SECRET", "WEBHOOK_FORWARD_TIMEOUT",
		"RESILIENCE_ENABLED", "RETRY_MAX_ATTEMPTS", "RETRY_INITIAL_DELAY",
		"RETRY_MAX_DELAY", "CIRCUIT_FAILURE_THRESHOLD", "CIRCUIT_COOLDOWN_PERIOD",
	}
	for _, k := range keys {
		_ = os.Unsetenv(k)
	}
}

// expectPanic — assert function panics with msg substring. Kalau panic tidak
// terjadi atau msg tidak match, fail test.
func expectPanic(t *testing.T, msgSubstr string, fn func()) {
	t.Helper()
	defer func() {
		r := recover()
		if r == nil {
			t.Fatalf("expected panic containing %q, got no panic", msgSubstr)
		}
		if !strings.Contains(toString(r), msgSubstr) {
			t.Errorf("panic message = %q, want substring %q", r, msgSubstr)
		}
	}()
	fn()
}

func toString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	if e, ok := v.(error); ok {
		return e.Error()
	}
	return ""
}

// --- Provider mode validation ---

func TestLoad_DefaultProviderIsEPPDirect(t *testing.T) {
	clearEnv(t)
	// Set minimum EPP creds supaya validation lolos.
	_ = os.Setenv("EPP_HOST", "epp.test.local")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")

	c := Load()
	if c.ProviderMode != "epp_direct" {
		t.Errorf("default provider = %q, want epp_direct", c.ProviderMode)
	}
}

func TestLoad_PandiWrapper_MissingURL_Panics(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "pandi_wrapper")

	expectPanic(t, "PANDI_API_URL wajib", func() { Load() })
}

func TestLoad_PandiWrapper_MissingCredentials_Panics(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "pandi_wrapper")
	_ = os.Setenv("PANDI_API_URL", "http://registrar.local")
	// No API_KEY + no email/password.

	expectPanic(t, "PANDI_API_KEY atau", func() { Load() })
}

func TestLoad_PandiWrapper_StaticKeyOK(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "pandi_wrapper")
	_ = os.Setenv("PANDI_API_URL", "http://registrar.local")
	_ = os.Setenv("PANDI_API_KEY", "static-jwt")

	c := Load()
	if c.PandiAPIKey != "static-jwt" {
		t.Errorf("api key not loaded")
	}
}

func TestLoad_PandiWrapper_EmailPasswordOK(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "pandi_wrapper")
	_ = os.Setenv("PANDI_API_URL", "http://registrar.local")
	_ = os.Setenv("PANDI_EMAIL", "admin@example.com")
	_ = os.Setenv("PANDI_PASSWORD", "secret")

	c := Load()
	if c.PandiEmail != "admin@example.com" || c.PandiPassword != "secret" {
		t.Errorf("email/password not loaded")
	}
}

func TestLoad_EPPDirect_MissingHost_Panics(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")

	expectPanic(t, "EPP_HOST", func() { Load() })
}

func TestLoad_EPPDirect_MissingCredentials_Panics(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.pandi.id")
	// Missing EPP_USER + EPP_PASSWORD.

	expectPanic(t, "EPP_USER", func() { Load() })
}

func TestLoad_UnknownProviderMode_Panics(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "verisign_epp")

	expectPanic(t, "PROVIDER_MODE tidak dikenal", func() { Load() })
}

// --- HMAC secret validation ---

func TestLoad_HMACSecretMissingInProd_Panics(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.test")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")
	_ = os.Setenv("APP_ENV", "prod")

	expectPanic(t, "INTERNAL_HMAC_SECRET wajib", func() { Load() })
}

func TestLoad_HMACSecretMissingInDev_OK(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.test")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")
	_ = os.Setenv("APP_ENV", "dev")

	// Should not panic.
	c := Load()
	if c.InternalHMACSecret != "" {
		t.Errorf("dev mode should tolerate empty HMAC secret")
	}
}

// --- Duration + int + bool parsing ---

func TestLoad_DurationParsing(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.test")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")
	_ = os.Setenv("REQUEST_TIMEOUT", "45s")
	_ = os.Setenv("EPP_KEEPALIVE_INTERVAL", "10m")

	c := Load()
	if c.RequestTimeout != 45*time.Second {
		t.Errorf("REQUEST_TIMEOUT parse: got %v, want 45s", c.RequestTimeout)
	}
	if c.EPPKeepAliveInterval != 10*time.Minute {
		t.Errorf("EPP_KEEPALIVE_INTERVAL parse: got %v, want 10m", c.EPPKeepAliveInterval)
	}
}

func TestLoad_DurationInvalidFallsBackToDefault(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.test")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")
	_ = os.Setenv("REQUEST_TIMEOUT", "not-a-duration")

	c := Load()
	if c.RequestTimeout != 30*time.Second {
		t.Errorf("invalid duration should fall back to default 30s, got %v", c.RequestTimeout)
	}
}

func TestLoad_IntParsing(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.test")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")
	_ = os.Setenv("MAX_CONCURRENT", "50")
	_ = os.Setenv("EPP_PORT", "8700")

	c := Load()
	if c.MaxConcurrent != 50 {
		t.Errorf("MAX_CONCURRENT: got %d, want 50", c.MaxConcurrent)
	}
	if c.EPPPort != 8700 {
		t.Errorf("EPP_PORT: got %d, want 8700", c.EPPPort)
	}
}

func TestLoad_BoolParsing(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.test")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")

	cases := []struct {
		val  string
		want bool
	}{
		{"true", true}, {"1", true}, {"yes", true}, {"on", true},
		{"false", false}, {"0", false}, {"no", false}, {"off", false},
	}
	for _, tc := range cases {
		_ = os.Setenv("EPP_INSECURE_SKIP_VERIFY", tc.val)
		c := Load()
		if c.EPPInsecureSkipVerify != tc.want {
			t.Errorf("EPP_INSECURE_SKIP_VERIFY=%q → %v, want %v", tc.val, c.EPPInsecureSkipVerify, tc.want)
		}
	}
}

func TestLoad_DefaultResilience(t *testing.T) {
	clearEnv(t)
	_ = os.Setenv("PROVIDER_MODE", "epp_direct")
	_ = os.Setenv("EPP_HOST", "epp.test")
	_ = os.Setenv("EPP_USER", "u")
	_ = os.Setenv("EPP_PASSWORD", "p")

	c := Load()
	// Defaults per config.go.
	if !c.ResilienceEnabled {
		t.Errorf("resilience default should be true")
	}
	if c.RetryMaxAttempts != 3 {
		t.Errorf("retry default 3, got %d", c.RetryMaxAttempts)
	}
	if c.CircuitFailureThreshold != 5 {
		t.Errorf("circuit threshold default 5, got %d", c.CircuitFailureThreshold)
	}
}
