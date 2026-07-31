// Package metrics — counter registry untuk observability. Prometheus-style
// text exposition format tanpa dep berat (client_golang) — simple + cukup
// untuk MVP. Kalau nanti butuh histogram / labels lebih rich, migrate ke
// Prometheus client_golang tanpa ubah call site (Inc / Observe API stabil).
package metrics

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Registry — singleton global. Sederhana + thread-safe.
type Registry struct {
	mu       sync.RWMutex
	counters map[string]*Counter // key = name + serialized labels
	metadata map[string]string   // name → help text
}

// Default — instance yang dipakai handler + middleware. Boleh construct
// baru untuk test.
var Default = New()

func New() *Registry {
	return &Registry{
		counters: make(map[string]*Counter),
		metadata: make(map[string]string),
	}
}

// Counter — monotonically increasing int64. Thread-safe via atomic.
type Counter struct {
	name   string
	labels map[string]string
	value  atomic.Int64
}

func (c *Counter) Inc()             { c.value.Add(1) }
func (c *Counter) Add(v int64)      { c.value.Add(v) }
func (c *Counter) Value() int64     { return c.value.Load() }

// CounterInc — high-level API. `help` di-set 1x per name (registry cache).
// Labels dedup + sorted supaya key stabil (walau caller kirim map di beda
// order per call).
func (r *Registry) CounterInc(name, help string, labels map[string]string) {
	c := r.getOrCreate(name, help, labels)
	c.Inc()
}

// CounterAdd — increment by N (mis. bytes transferred, ms elapsed).
func (r *Registry) CounterAdd(name, help string, labels map[string]string, delta int64) {
	c := r.getOrCreate(name, help, labels)
	c.Add(delta)
}

func (r *Registry) getOrCreate(name, help string, labels map[string]string) *Counter {
	key := seriesKey(name, labels)
	r.mu.RLock()
	if c, ok := r.counters[key]; ok {
		r.mu.RUnlock()
		return c
	}
	r.mu.RUnlock()

	r.mu.Lock()
	defer r.mu.Unlock()
	// Double-check pasca lock.
	if c, ok := r.counters[key]; ok {
		return c
	}
	c := &Counter{name: name, labels: dupLabels(labels)}
	r.counters[key] = c
	if help != "" {
		if _, exists := r.metadata[name]; !exists {
			r.metadata[name] = help
		}
	}
	return c
}

// Snapshot — copy all counters untuk expose ke /metrics endpoint.
func (r *Registry) Snapshot() []Sample {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Sample, 0, len(r.counters))
	for _, c := range r.counters {
		out = append(out, Sample{
			Name:   c.name,
			Labels: c.labels,
			Value:  c.value.Load(),
			Help:   r.metadata[c.name],
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return seriesKey(out[i].Name, out[i].Labels) < seriesKey(out[j].Name, out[j].Labels)
	})
	return out
}

type Sample struct {
	Name   string
	Labels map[string]string
	Value  int64
	Help   string
}

// Expose — render Prometheus text format. Cocok untuk scrape by Prom/Grafana.
func (r *Registry) Expose() string {
	samples := r.Snapshot()
	var sb strings.Builder
	sb.WriteString("# api-registry metrics — exposition at ")
	sb.WriteString(time.Now().UTC().Format(time.RFC3339))
	sb.WriteString("\n")

	seenName := map[string]bool{}
	for _, s := range samples {
		if !seenName[s.Name] {
			if s.Help != "" {
				fmt.Fprintf(&sb, "# HELP %s %s\n", s.Name, s.Help)
			}
			fmt.Fprintf(&sb, "# TYPE %s counter\n", s.Name)
			seenName[s.Name] = true
		}
		sb.WriteString(s.Name)
		if len(s.Labels) > 0 {
			sb.WriteByte('{')
			// Sorted for stable output.
			keys := make([]string, 0, len(s.Labels))
			for k := range s.Labels {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for i, k := range keys {
				if i > 0 {
					sb.WriteByte(',')
				}
				fmt.Fprintf(&sb, `%s="%s"`, k, escape(s.Labels[k]))
			}
			sb.WriteByte('}')
		}
		fmt.Fprintf(&sb, " %d\n", s.Value)
	}
	return sb.String()
}

// --- helpers ---

func seriesKey(name string, labels map[string]string) string {
	if len(labels) == 0 {
		return name
	}
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var sb strings.Builder
	sb.WriteString(name)
	for _, k := range keys {
		sb.WriteByte(',')
		sb.WriteString(k)
		sb.WriteByte('=')
		sb.WriteString(labels[k])
	}
	return sb.String()
}

func dupLabels(labels map[string]string) map[string]string {
	if len(labels) == 0 {
		return nil
	}
	dup := make(map[string]string, len(labels))
	for k, v := range labels {
		dup[k] = v
	}
	return dup
}

func escape(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, `"`, `\"`)
	v = strings.ReplaceAll(v, "\n", `\n`)
	return v
}
