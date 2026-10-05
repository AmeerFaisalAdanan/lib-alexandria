// Package domain holds the pure reading-state rules. It mirrors src/lib/library.ts on the frontend;
// the server result is authoritative.
package domain

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	StatusWantToRead = "want_to_read"
	StatusReading    = "reading"
	StatusCompleted  = "completed"

	MaxTagLen = 32
	MaxTags   = 20
)

var Statuses = []string{StatusWantToRead, StatusReading, StatusCompleted}

// ValidationError is a client-correctable input problem.
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

func (e *ValidationError) Error() string { return e.Field + ": " + e.Message }

func Invalid(field, format string, a ...any) error {
	return &ValidationError{Field: field, Message: fmt.Sprintf(format, a...)}
}

func ValidStatus(s string) bool {
	for _, v := range Statuses {
		if v == s {
			return true
		}
	}
	return false
}

// State is the part of a user's book that the status/progress rules touch.
type State struct {
	Status   string
	Progress int
}

func clamp(n int) int { return min(100, max(0, n)) }

// ApplyStatus: want -> 0%, completed -> 100%, restarting a finished book -> 0%.
func ApplyStatus(s State, status string) State {
	switch status {
	case StatusWantToRead:
		return State{status, 0}
	case StatusCompleted:
		return State{status, 100}
	}
	if s.Status == StatusCompleted {
		return State{status, 0}
	}
	return State{status, clamp(s.Progress)}
}

// ApplyProgress starts a want-to-read book, rewinds a completed one, and never auto-completes.
func ApplyProgress(s State, progress int) State {
	next := clamp(progress)
	if s.Status == StatusWantToRead && next > 0 {
		return State{StatusReading, next}
	}
	if s.Status == StatusCompleted && next < 100 {
		return State{StatusReading, next}
	}
	return State{s.Status, next}
}

// Reconcile enforces the invariants when status and progress arrive together.
func Reconcile(s State) State {
	switch s.Status {
	case StatusWantToRead:
		return State{s.Status, 0}
	case StatusCompleted:
		return State{s.Status, 100}
	}
	return State{s.Status, clamp(s.Progress)}
}

func NormaliseTag(tag string) string {
	t := strings.Join(strings.Fields(tag), " ")
	if utf8.RuneCountInString(t) > MaxTagLen {
		t = string([]rune(t)[:MaxTagLen])
	}
	return t
}

// NormaliseTags trims, drops empties and de-duplicates case-insensitively, keeping the first spelling.
func NormaliseTags(in []string) ([]string, error) {
	seen := make(map[string]bool, len(in))
	out := make([]string, 0, len(in))
	for _, raw := range in {
		t := NormaliseTag(raw)
		if t == "" || seen[strings.ToLower(t)] {
			continue
		}
		seen[strings.ToLower(t)] = true
		out = append(out, t)
	}
	if len(out) > MaxTags {
		return nil, Invalid("tags", "at most %d tags", MaxTags)
	}
	return out, nil
}
