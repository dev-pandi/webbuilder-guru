package metrics

import (
	"strings"
	"testing"
)

func TestCounter_IncAndSnapshot(t *testing.T) {
	r := New()
	r.CounterInc("http_reqs_total", "test help", map[string]string{"path": "/a", "status": "200"})
	r.CounterInc("http_reqs_total", "test help", map[string]string{"path": "/a", "status": "200"})
	r.CounterInc("http_reqs_total", "test help", map[string]string{"path": "/b", "status": "200"})

	samples := r.Snapshot()
	if len(samples) != 2 {
		t.Fatalf("expected 2 series, got %d", len(samples))
	}
	// Find /a series.
	var a *Sample
	for i := range samples {
		if samples[i].Labels["path"] == "/a" {
			a = &samples[i]
		}
	}
	if a == nil || a.Value != 2 {
		t.Errorf("expected /a=2, got %+v", a)
	}
}

func TestCounter_LabelOrderStableKey(t *testing.T) {
	r := New()
	// Increment via 2 map order berbeda — harus jadi 1 series bukan 2.
	r.CounterInc("m", "", map[string]string{"a": "1", "b": "2"})
	r.CounterInc("m", "", map[string]string{"b": "2", "a": "1"})
	samples := r.Snapshot()
	if len(samples) != 1 {
		t.Fatalf("expected 1 dedup series, got %d", len(samples))
	}
	if samples[0].Value != 2 {
		t.Errorf("expected value=2 (deduplicated), got %d", samples[0].Value)
	}
}

func TestExpose_PrometheusFormat(t *testing.T) {
	r := New()
	r.CounterInc("http_reqs_total", "Total requests", map[string]string{"path": "/x"})
	out := r.Expose()

	if !strings.Contains(out, "# HELP http_reqs_total Total requests") {
		t.Errorf("missing HELP line:\n%s", out)
	}
	if !strings.Contains(out, "# TYPE http_reqs_total counter") {
		t.Errorf("missing TYPE line:\n%s", out)
	}
	if !strings.Contains(out, `http_reqs_total{path="/x"} 1`) {
		t.Errorf("missing counter line:\n%s", out)
	}
}

func TestExpose_EscapesQuotesAndBackslash(t *testing.T) {
	r := New()
	r.CounterInc("m", "", map[string]string{"v": `hello "world"\path`})
	out := r.Expose()
	if !strings.Contains(out, `v="hello \"world\"\\path"`) {
		t.Errorf("expected escaped output, got:\n%s", out)
	}
}
