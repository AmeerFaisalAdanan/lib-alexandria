package lookup

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Chain asks several providers about the same ISBN and merges what they know (the first provider wins on
// conflicts). Answers, including "nobody knows this ISBN", are cached so repeat scans are free.
type Chain struct {
	Providers []ISBNLookup
	Log       *slog.Logger
	// Timeout bounds each provider call (default 6s).
	Timeout time.Duration

	mu    sync.Mutex
	cache map[string]cached
	now   func() time.Time
}

type cached struct {
	info    Info
	found   bool
	expires time.Time
}

const (
	hitTTL  = 24 * time.Hour
	missTTL = time.Hour
	maxKeys = 2000
)

func (c *Chain) ByISBN(ctx context.Context, isbn string) (Info, bool, error) {
	norm := NormaliseISBN(isbn)
	if !Valid(norm) {
		return Info{}, false, errors.New("invalid ISBN")
	}
	isbn13 := To13(norm)
	now := time.Now
	if c.now != nil {
		now = c.now
	}

	c.mu.Lock()
	if e, ok := c.cache[isbn13]; ok && now().Before(e.expires) {
		c.mu.Unlock()
		return e.info, e.found, nil
	}
	c.mu.Unlock()

	timeout := c.Timeout
	if timeout == 0 {
		timeout = 6 * time.Second
	}
	var merged Info
	var found bool
	var failures int
	for _, p := range c.Providers {
		pctx, cancel := context.WithTimeout(ctx, timeout)
		info, ok, err := p.ByISBN(pctx, isbn13)
		cancel()
		if err != nil {
			failures++
			if c.Log != nil {
				c.Log.Warn("isbn lookup provider failed", "error", err)
			}
			continue
		}
		if ok {
			found = true
			merged = merged.Fill(info.Clean(now()))
		}
	}
	if !found {
		// A miss is only trustworthy when every source actually answered. If any of them failed (rate limit,
		// outage), we cannot say the book does not exist: report a temporary failure and do not cache it.
		if failures > 0 {
			return Info{}, false, fmt.Errorf("%d of %d lookup providers failed and the rest did not know this ISBN", failures, len(c.Providers))
		}
		c.store(isbn13, Info{}, false, now().Add(missTTL))
		return Info{}, false, nil
	}
	merged.ISBN = isbn13
	c.store(isbn13, merged, true, now().Add(hitTTL))
	return merged, true, nil
}

func (c *Chain) store(key string, info Info, found bool, expires time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cache == nil || len(c.cache) >= maxKeys {
		c.cache = make(map[string]cached, 64) // simple bound: start over rather than track LRU
	}
	c.cache[key] = cached{info, found, expires}
}
