package metrics

import (
	"strings"
	"sync"
	"testing"
)

func TestCounter_Render(t *testing.T) {
	r := New()
	r.CounterInc("widgets_total", "test", map[string]string{"kind": "blue"})
	r.CounterInc("widgets_total", "test", map[string]string{"kind": "blue"})
	r.CounterInc("widgets_total", "test", map[string]string{"kind": "red"})

	out := string(r.Render())
	if !strings.Contains(out, `widgets_total{kind="blue"} 2`) {
		t.Errorf("missing blue counter:\n%s", out)
	}
	if !strings.Contains(out, `widgets_total{kind="red"} 1`) {
		t.Errorf("missing red counter:\n%s", out)
	}
	if !strings.Contains(out, "# TYPE widgets_total counter") {
		t.Errorf("missing TYPE annotation:\n%s", out)
	}
}

func TestGauge_Render(t *testing.T) {
	r := New()
	r.GaugeSet("pool_size", "pool", nil, 42)
	r.GaugeSet("pool_size", "pool", nil, 17) // last-write-wins
	out := string(r.Render())
	if !strings.Contains(out, "pool_size 17") {
		t.Errorf("expected pool_size=17:\n%s", out)
	}
}

func TestHistogram_BucketsAndSum(t *testing.T) {
	r := New()
	r.HistogramObserve("lat_sec", "latency", map[string]string{"route": "/x"}, 0.01)
	r.HistogramObserve("lat_sec", "latency", map[string]string{"route": "/x"}, 0.5)
	r.HistogramObserve("lat_sec", "latency", map[string]string{"route": "/x"}, 3)

	out := string(r.Render())
	if !strings.Contains(out, `lat_sec_count{route="/x"} 3`) {
		t.Errorf("expected count=3:\n%s", out)
	}
	if !strings.Contains(out, `lat_sec_sum{route="/x"} 3.51`) {
		t.Errorf("expected sum=3.51:\n%s", out)
	}
	// +Inf bucket must always equal total count.
	if !strings.Contains(out, `lat_sec_bucket{route="/x",le="+Inf"} 3`) {
		t.Errorf("expected +Inf bucket=3:\n%s", out)
	}
	// 0.025 bucket should include only the 0.01 observation.
	if !strings.Contains(out, `lat_sec_bucket{route="/x",le="0.025"} 1`) {
		t.Errorf("expected le=0.025 bucket=1:\n%s", out)
	}
}

func TestRender_ContainsProcessUptime(t *testing.T) {
	r := New()
	out := string(r.Render())
	if !strings.Contains(out, "process_uptime_seconds") {
		t.Errorf("expected process uptime metric:\n%s", out)
	}
}

func TestConcurrentObserve_NoDataRace(t *testing.T) {
	r := New()
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 1000; j++ {
				r.CounterInc("c", "h", nil)
				r.HistogramObserve("h", "h", nil, float64(j)/1000)
			}
		}()
	}
	wg.Wait()
	out := string(r.Render())
	if !strings.Contains(out, "c 8000") {
		t.Errorf("expected c=8000:\n%s", out)
	}
}
