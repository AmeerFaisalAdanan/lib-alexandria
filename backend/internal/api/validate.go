package api

import (
	"strings"
	"time"
	"unicode/utf8"

	"libax/internal/domain"
	"libax/internal/store"
)

// entryFields are the writable personal fields of a UserBook, shared by create (POST) and update (PATCH).
type entryFields struct {
	Status   Field[string]   `json:"status"`
	Progress Field[int]      `json:"progress"`
	Rating   Field[int]      `json:"rating"`
	Notes    Field[string]   `json:"notes"`
	Tags     Field[[]string] `json:"tags"`
}

const (
	maxNotes    = 5000
	maxLocation = 120
	maxPrice    = 10_000_000
)

// apply validates the supplied fields and writes them onto e, enforcing the status/progress rules.
func (f entryFields) apply(e *store.Entry) error {
	state := domain.State{Status: e.Status, Progress: e.Progress}

	if f.Status.Set && (f.Status.Null || !domain.ValidStatus(f.Status.Val)) {
		return domain.Invalid("status", "must be one of want_to_read, reading, completed")
	}
	if f.Progress.Set && (f.Progress.Null || f.Progress.Val < 0 || f.Progress.Val > 100) {
		return domain.Invalid("progress", "must be a whole number from 0 to 100")
	}
	switch {
	case f.Status.Set && f.Progress.Set:
		state = domain.Reconcile(domain.State{Status: f.Status.Val, Progress: f.Progress.Val})
	case f.Status.Set:
		state = domain.ApplyStatus(state, f.Status.Val)
	case f.Progress.Set:
		state = domain.ApplyProgress(state, f.Progress.Val)
	}
	e.Status, e.Progress = state.Status, state.Progress

	if f.Rating.Set {
		switch {
		case f.Rating.Null:
			e.Rating = nil
		case f.Rating.Val < 1 || f.Rating.Val > 5:
			return domain.Invalid("rating", "must be from 1 to 5")
		default:
			v := f.Rating.Val
			e.Rating = &v
		}
	}
	if f.Notes.Set {
		notes := strings.TrimSpace(f.Notes.Val)
		if utf8.RuneCountInString(notes) > maxNotes {
			return domain.Invalid("notes", "at most %d characters", maxNotes)
		}
		e.Notes = notes
	}
	if f.Tags.Set {
		tags, err := domain.NormaliseTags(f.Tags.Val)
		if err != nil {
			return err
		}
		e.Tags = tags
	}
	return nil
}

var collectionColors = map[string]bool{"amber": true, "emerald": true, "purple": true, "blue": true, "rose": true}

type collectionFields struct {
	Name        Field[string] `json:"name"`
	Description Field[string] `json:"description"`
	Color       Field[string] `json:"color"`
}

func (f collectionFields) apply(c *store.Collection) error {
	if f.Name.Set {
		name := strings.TrimSpace(f.Name.Val)
		if f.Name.Null || name == "" || utf8.RuneCountInString(name) > 80 {
			return domain.Invalid("name", "required, at most 80 characters")
		}
		c.Name = name
	}
	if f.Description.Set {
		d := strings.TrimSpace(f.Description.Val)
		switch {
		case f.Description.Null || d == "":
			c.Description = nil
		case utf8.RuneCountInString(d) > 500:
			return domain.Invalid("description", "at most 500 characters")
		default:
			c.Description = &d
		}
	}
	if f.Color.Set {
		if f.Color.Null || !collectionColors[f.Color.Val] {
			return domain.Invalid("color", "must be one of amber, emerald, purple, blue, rose")
		}
		c.Color = f.Color.Val
	}
	return nil
}

// copyFields are the writable details of a physical copy (what its owner bought and where it lives).
type copyFields struct {
	Price        Field[float64] `json:"price"`
	PurchaseDate Field[string]  `json:"purchaseDate"`
	Location     Field[string]  `json:"location"`
}

func (f copyFields) apply(c *store.Copy) error {
	if f.Price.Set {
		switch {
		case f.Price.Null:
			c.Price = nil
		case f.Price.Val < 0 || f.Price.Val > maxPrice:
			return domain.Invalid("price", "must be between 0 and %d", maxPrice)
		default:
			v := f.Price.Val
			c.Price = &v
		}
	}
	if f.PurchaseDate.Set {
		d := strings.TrimSpace(f.PurchaseDate.Val)
		if f.PurchaseDate.Null || d == "" {
			c.PurchaseDate = nil
		} else {
			if _, err := time.Parse("2006-01-02", d); err != nil {
				return domain.Invalid("purchaseDate", "must be a date as YYYY-MM-DD")
			}
			c.PurchaseDate = &d
		}
	}
	if f.Location.Set {
		loc := strings.TrimSpace(f.Location.Val)
		switch {
		case f.Location.Null || loc == "":
			c.Location = nil
		case utf8.RuneCountInString(loc) > maxLocation:
			return domain.Invalid("location", "at most %d characters", maxLocation)
		default:
			c.Location = &loc
		}
	}
	return nil
}
