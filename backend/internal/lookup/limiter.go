package lookup

import (
	"sync"
	"time"
)

// Limiter allows at most Max events per key in a rolling Window. In memory, so it resets on restart; it
// exists to stop one account from running up lookup or vision costs, not to be an accounting system.
type Limiter struct {
	Max    int
	Window time.Duration

	mu   sync.Mutex
	hits map[string][]time.Time
	now  func() time.Time
}

func (l *Limiter) Allow(key string) bool {
	now := time.Now
	if l.now != nil {
		now = l.now
	}
	t := now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.hits == nil {
		l.hits = map[string][]time.Time{}
	}
	recent := l.hits[key][:0]
	for _, h := range l.hits[key] {
		if t.Sub(h) < l.Window {
			recent = append(recent, h)
		}
	}
	if len(recent) >= l.Max {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, t)
	return true
}
