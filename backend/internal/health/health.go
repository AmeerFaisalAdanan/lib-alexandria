// Package health reports whether the app's dependencies are configured and reachable. Results are safe to show to
// administrators: they contain a status word and a short fixed description, never a key, URL, token or error text.
package health

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

type Status string

const (
	Healthy       Status = "healthy"        // configured and the lightweight probe succeeded
	Unavailable   Status = "unavailable"    // configured but the probe failed
	NotConfigured Status = "not_configured" // nothing configured in this environment
	Configured    Status = "configured"     // configured, deliberately not probed (it would cost quota or money)
)

// Service describes one dependency.
type Service struct {
	Key        string
	Configured bool
	// Detail is a short fixed description (for example "fixture"). It must never include secrets.
	Detail string
	// Probe is a cheap, read-only check. Leave it nil for services where probing would be expensive or consume quota.
	Probe func(context.Context) error
}

type Result struct {
	Key        string `json:"key"`
	Configured bool   `json:"configured"`
	Status     Status `json:"status"`
	Detail     string `json:"detail,omitempty"`
	LatencyMs  int64  `json:"latencyMs,omitempty"`
}

const probeTimeout = 4 * time.Second

// Run checks every service concurrently. Probe errors are logged on the server and never returned to the caller.
func Run(ctx context.Context, log *slog.Logger, services []Service) []Result {
	out := make([]Result, len(services))
	var wg sync.WaitGroup
	for i, svc := range services {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out[i] = check(ctx, log, svc)
		}()
	}
	wg.Wait()
	return out
}

func check(ctx context.Context, log *slog.Logger, svc Service) Result {
	r := Result{Key: svc.Key, Configured: svc.Configured, Detail: svc.Detail}
	switch {
	case !svc.Configured:
		r.Status = NotConfigured
	case svc.Probe == nil:
		r.Status = Configured
	default:
		pctx, cancel := context.WithTimeout(ctx, probeTimeout)
		defer cancel()
		start := time.Now()
		if err := svc.Probe(pctx); err != nil {
			log.Warn("health probe failed", "service", svc.Key, "error", err)
			r.Status = Unavailable
		} else {
			r.Status = Healthy
		}
		r.LatencyMs = time.Since(start).Milliseconds()
	}
	return r
}
