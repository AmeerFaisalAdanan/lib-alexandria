package catalogue

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

// FixtureSource reads a catalogue from a JSON file. Development and tests only; config refuses it in production.
// Books published while it runs are kept in memory (lost on restart).
type FixtureSource struct {
	Path string

	mu    sync.Mutex
	added []Book
}

func (f *FixtureSource) Fetch(context.Context) ([]Book, error) {
	raw, err := os.ReadFile(f.Path)
	if err != nil {
		return nil, fmt.Errorf("read fixture catalogue: %w", err)
	}
	var books []Book
	if err := json.Unmarshal(raw, &books); err != nil {
		return nil, fmt.Errorf("parse fixture catalogue: %w", err)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return append(books, f.added...), nil
}

func (f *FixtureSource) Append(_ context.Context, b Book, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.added = append(f.added, b)
	return nil
}
