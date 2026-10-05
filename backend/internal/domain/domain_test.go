package domain

import (
	"reflect"
	"testing"
)

func TestApplyStatus(t *testing.T) {
	cases := []struct {
		name string
		from State
		to   string
		want State
	}{
		{"want resets progress", State{StatusReading, 40}, StatusWantToRead, State{StatusWantToRead, 0}},
		{"completed forces 100", State{StatusReading, 40}, StatusCompleted, State{StatusCompleted, 100}},
		{"reading keeps progress", State{StatusWantToRead, 0}, StatusReading, State{StatusReading, 0}},
		{"re-read from completed restarts at 0", State{StatusCompleted, 100}, StatusReading, State{StatusReading, 0}},
		{"reading to reading keeps progress", State{StatusReading, 30}, StatusReading, State{StatusReading, 30}},
	}
	for _, c := range cases {
		if got := ApplyStatus(c.from, c.to); got != c.want {
			t.Errorf("%s: got %+v want %+v", c.name, got, c.want)
		}
	}
}

func TestApplyProgress(t *testing.T) {
	cases := []struct {
		name string
		from State
		to   int
		want State
	}{
		{"starting a want-to-read book", State{StatusWantToRead, 0}, 10, State{StatusReading, 10}},
		{"zero keeps want-to-read", State{StatusWantToRead, 0}, 0, State{StatusWantToRead, 0}},
		{"never auto-completes", State{StatusReading, 50}, 100, State{StatusReading, 100}},
		{"rewinding a completed book", State{StatusCompleted, 100}, 80, State{StatusReading, 80}},
		{"completed stays completed at 100", State{StatusCompleted, 100}, 100, State{StatusCompleted, 100}},
		{"clamps high", State{StatusReading, 10}, 250, State{StatusReading, 100}},
		{"clamps low", State{StatusReading, 10}, -5, State{StatusReading, 0}},
	}
	for _, c := range cases {
		if got := ApplyProgress(c.from, c.to); got != c.want {
			t.Errorf("%s: got %+v want %+v", c.name, got, c.want)
		}
	}
}

func TestReconcile(t *testing.T) {
	cases := []struct{ from, want State }{
		{State{StatusWantToRead, 60}, State{StatusWantToRead, 0}},
		{State{StatusCompleted, 20}, State{StatusCompleted, 100}},
		{State{StatusReading, 140}, State{StatusReading, 100}},
		{State{StatusReading, 33}, State{StatusReading, 33}},
	}
	for _, c := range cases {
		if got := Reconcile(c.from); got != c.want {
			t.Errorf("Reconcile(%+v) = %+v, want %+v", c.from, got, c.want)
		}
	}
}

func TestNormaliseTags(t *testing.T) {
	got, err := NormaliseTags([]string{"  Fiqh ", "fiqh", "Spiritual   Growth", "", "  "})
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{"Fiqh", "Spiritual Growth"}; !reflect.DeepEqual(got, want) {
		t.Errorf("got %v want %v", got, want)
	}

	long := make([]string, MaxTags+1)
	for i := range long {
		long[i] = string(rune('a'+i%26)) + string(rune('a'+i/26))
	}
	if _, err := NormaliseTags(long); err == nil {
		t.Error("expected an error for too many tags")
	}
	if got := NormaliseTag("abcdefghijklmnopqrstuvwxyz0123456789"); len([]rune(got)) != MaxTagLen {
		t.Errorf("tag not truncated to %d: %q", MaxTagLen, got)
	}
}
