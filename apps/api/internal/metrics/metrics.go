// Package metrics emits a minimal Prometheus text-format scrape endpoint.
//
// Why a hand-rolled version? prometheus/client_golang pulls a wide transitive
// graph for capabilities we don't need (custom collectors, registries,
// process collector). Our needs: HTTP request counter + duration histogram,
// pool gauges, error tally. ~200 LOC of bucketed counters covers it.
//
// If we ever need exemplars / histograms with native protobuf scraping, swap
// to client_golang then.
package metrics

import (
	"bytes"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Registry is the process-wide metrics holder. Safe for concurrent use.
type Registry struct {
	mu sync.RWMutex

	counters map[string]*counter
	gauges   map[string]*gauge
	hists    map[string]*histogram
}

var Default = New()

func New() *Registry {
	return &Registry{
		counters: map[string]*counter{},
		gauges:   map[string]*gauge{},
		hists:    map[string]*histogram{},
	}
}

// --- counter ---

type counter struct {
	help   string
	labels []string
	values sync.Map // labelKey string -> *uint64
}

// CounterAdd adds delta to the counter identified by name+labels. Counters are
// monotonic — use Gauge for values that can decrease.
func (r *Registry) CounterAdd(name, help string, labels map[string]string, delta uint64) {
	r.mu.RLock()
	c, ok := r.counters[name]
	r.mu.RUnlock()
	if !ok {
		r.mu.Lock()
		c, ok = r.counters[name]
		if !ok {
			c = &counter{help: help, labels: sortedKeys(labels)}
			r.counters[name] = c
		}
		r.mu.Unlock()
	}
	key := labelKey(labels)
	v, _ := c.values.LoadOrStore(key, new(uint64))
	atomic.AddUint64(v.(*uint64), delta)
}

func (r *Registry) CounterInc(name, help string, labels map[string]string) {
	r.CounterAdd(name, help, labels, 1)
}

// --- gauge ---

type gauge struct {
	help   string
	labels []string
	values sync.Map // labelKey string -> *int64 (signed for "can go down")
}

func (r *Registry) GaugeSet(name, help string, labels map[string]string, value int64) {
	r.mu.RLock()
	g, ok := r.gauges[name]
	r.mu.RUnlock()
	if !ok {
		r.mu.Lock()
		g, ok = r.gauges[name]
		if !ok {
			g = &gauge{help: help, labels: sortedKeys(labels)}
			r.gauges[name] = g
		}
		r.mu.Unlock()
	}
	key := labelKey(labels)
	v, _ := g.values.LoadOrStore(key, new(int64))
	atomic.StoreInt64(v.(*int64), value)
}

// --- histogram (HTTP latency style) ---

var defaultBuckets = []float64{
	0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
}

type histogram struct {
	help    string
	labels  []string
	buckets []float64
	series  sync.Map // labelKey -> *histogramSeries
}

type histogramSeries struct {
	counts []uint64 // len == len(buckets)+1 (+Inf)
	sum    uint64   // bits of float64 sum, atomic via CAS
	count  uint64
}

// HistogramObserve records a single observation in seconds.
func (r *Registry) HistogramObserve(name, help string, labels map[string]string, value float64) {
	r.mu.RLock()
	h, ok := r.hists[name]
	r.mu.RUnlock()
	if !ok {
		r.mu.Lock()
		h, ok = r.hists[name]
		if !ok {
			h = &histogram{help: help, labels: sortedKeys(labels), buckets: defaultBuckets}
			r.hists[name] = h
		}
		r.mu.Unlock()
	}
	key := labelKey(labels)
	s, _ := h.series.LoadOrStore(key, &histogramSeries{counts: make([]uint64, len(h.buckets)+1)})
	ss := s.(*histogramSeries)
	for i, b := range h.buckets {
		if value <= b {
			atomic.AddUint64(&ss.counts[i], 1)
		}
	}
	// +Inf bucket — always increments.
	atomic.AddUint64(&ss.counts[len(h.buckets)], 1)
	atomic.AddUint64(&ss.count, 1)
	// sum: encode float64 via bits & CAS. Single allocation-free path.
	for {
		old := atomic.LoadUint64(&ss.sum)
		nv := floatBits(bitsFloat(old) + value)
		if atomic.CompareAndSwapUint64(&ss.sum, old, nv) {
			break
		}
	}
}

// --- text scrape format ---

// Render emits the entire registry in Prometheus text-format 0.0.4.
func (r *Registry) Render() []byte {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var b bytes.Buffer

	// counters
	for _, name := range sortedMapKeys(r.counters) {
		c := r.counters[name]
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s counter\n", name, c.help, name)
		c.values.Range(func(k, v any) bool {
			fmt.Fprintf(&b, "%s%s %d\n", name, k.(string), atomic.LoadUint64(v.(*uint64)))
			return true
		})
	}

	// gauges
	for _, name := range sortedMapKeys(r.gauges) {
		g := r.gauges[name]
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s gauge\n", name, g.help, name)
		g.values.Range(func(k, v any) bool {
			fmt.Fprintf(&b, "%s%s %d\n", name, k.(string), atomic.LoadInt64(v.(*int64)))
			return true
		})
	}

	// histograms
	for _, name := range sortedMapKeys(r.hists) {
		h := r.hists[name]
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s histogram\n", name, h.help, name)
		h.series.Range(func(k, v any) bool {
			ss := v.(*histogramSeries)
			labelKey := k.(string)
			cumulative := uint64(0)
			for i, bucket := range h.buckets {
				cumulative += atomic.LoadUint64(&ss.counts[i])
				bv := strconv.FormatFloat(bucket, 'f', -1, 64)
				fmt.Fprintf(&b, "%s_bucket%s %d\n",
					name, appendLabel(labelKey, "le", bv), atomic.LoadUint64(&ss.counts[i]))
				_ = cumulative
			}
			fmt.Fprintf(&b, "%s_bucket%s %d\n",
				name, appendLabel(labelKey, "le", "+Inf"),
				atomic.LoadUint64(&ss.counts[len(h.buckets)]))
			fmt.Fprintf(&b, "%s_sum%s %s\n", name, labelKey,
				strconv.FormatFloat(bitsFloat(atomic.LoadUint64(&ss.sum)), 'f', -1, 64))
			fmt.Fprintf(&b, "%s_count%s %d\n", name, labelKey,
				atomic.LoadUint64(&ss.count))
			return true
		})
	}

	// Process info
	fmt.Fprintf(&b, "# HELP process_uptime_seconds Time since process start\n# TYPE process_uptime_seconds gauge\n")
	fmt.Fprintf(&b, "process_uptime_seconds %.0f\n", time.Since(startTime).Seconds())

	return b.Bytes()
}

var startTime = time.Now()

// --- helpers ---

func labelKey(labels map[string]string) string {
	if len(labels) == 0 {
		return ""
	}
	keys := sortedKeys(labels)
	var b strings.Builder
	b.WriteByte('{')
	for i, k := range keys {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(k)
		b.WriteString(`="`)
		b.WriteString(escape(labels[k]))
		b.WriteByte('"')
	}
	b.WriteByte('}')
	return b.String()
}

func appendLabel(existing, k, v string) string {
	if existing == "" {
		return `{` + k + `="` + escape(v) + `"}`
	}
	// strip closing brace, append, re-close.
	return existing[:len(existing)-1] + `,` + k + `="` + escape(v) + `"}`
}

func escape(s string) string {
	if !strings.ContainsAny(s, `"\`) {
		return s
	}
	r := strings.NewReplacer(`\`, `\\`, `"`, `\"`)
	return r.Replace(s)
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sortedMapKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// atomic-safe float64<->uint64 conversion used so HistogramObserve.sum can be
// CAS-updated without taking the registry mutex.
func floatBits(f float64) uint64 { return math.Float64bits(f) }
func bitsFloat(b uint64) float64 { return math.Float64frombits(b) }
